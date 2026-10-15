"""AKShare 采集股票日线数据, 每只股票保存一份 CSV 快照到 data/raw/.

用法: python fetch_data.py
快照已存在时跳过; 加 --force 强制全量重拉;
加 --incremental 增量更新: 重取每只股票最近 10 天并去重合并 (qfq 复权微调靠入库 upsert 兜底)。
"""
import argparse
import os
import sys
import time

import akshare as ak
import pandas as pd

from config import END_DATE, OHLCV_COLUMNS, RAW_DIR, START_DATE, STOCK_POOL
from mock_data import SEED, generate_one

COLUMN_MAP = {
    "日期": "trade_date",
    "开盘": "open",
    "最高": "high",
    "最低": "low",
    "收盘": "close",
    "成交量": "volume",
}


def sanitize(df: pd.DataFrame, code: str) -> pd.DataFrame:
    """行情质量门: AKShare qfq 前复权对长历史高分红股会产出负价/零价, 脏行直通入库会
    穿透后端估值 (负收盘价把多头估成负贡献 -> 进阶模式误强平)。规则: OHLC 全为正、
    high/low 包住 open/close、按 trade_date 去重 (保留后出现的, 与增量合并口径一致)。"""
    before = len(df)
    ok = (
        (df[["open", "high", "low", "close"]] > 0).all(axis=1)
        & (df["high"] >= df[["open", "close", "low"]].max(axis=1))
        & (df["low"] <= df[["open", "close"]].min(axis=1))
    )
    df = df[ok].drop_duplicates(subset="trade_date", keep="last")
    dropped = before - len(df)
    if dropped:
        print(f"[quality] {code}: 丢弃 {dropped} 行脏数据 (非正价/高低矛盾/重复日期)")
    return df


def fetch_one(code: str) -> pd.DataFrame:
    df = ak.stock_zh_a_hist(
        symbol=code,
        period="daily",
        start_date=START_DATE,
        end_date=END_DATE,
        adjust="qfq",
    )
    df = df.rename(columns=COLUMN_MAP)
    # AKShare 返回的日期可能是 date 对象, 统一成字符串, 否则增量合并时无法去重
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    df = df[OHLCV_COLUMNS]
    # AKShare 成交量单位是"手"(100股), 统一转为股, 与 mock 数据口径一致
    df["volume"] = df["volume"] * 100
    df["code"] = code
    return sanitize(df, code)


def fetch_us_one(code: str) -> pd.DataFrame:
    df = ak.stock_us_daily(symbol=code, adjust="qfq")
    df = df.rename(columns={"date": "trade_date"})
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    start = f"{START_DATE[:4]}-{START_DATE[4:6]}-{START_DATE[6:]}"
    end = f"{END_DATE[:4]}-{END_DATE[4:6]}-{END_DATE[6:]}"
    df = df[(df["trade_date"] >= start) & (df["trade_date"] <= end)]
    df = df[OHLCV_COLUMNS].copy()
    df["volume"] = df["volume"].astype("int64")
    df["code"] = code
    return sanitize(df, code)


def merge_incremental(out_path: str, fresh: pd.DataFrame) -> pd.DataFrame:
    """增量合并: 旧快照 + 新数据按 trade_date 去重 (新数据优先, 覆盖 qfq 复权微调的近端)。"""
    old = pd.read_csv(out_path, dtype={"code": str})
    # 两边都强制为字符串日期, 防止 str 与 date 混型导致去重失效/排序报错
    old["trade_date"] = old["trade_date"].astype(str)
    fresh = fresh.copy()
    fresh["trade_date"] = fresh["trade_date"].astype(str)
    merged = pd.concat([old, fresh], ignore_index=True)
    merged = merged.drop_duplicates(subset=["trade_date"], keep="last")
    return merged.sort_values("trade_date").reset_index(drop=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="覆盖已有快照")
    parser.add_argument("--incremental", action="store_true",
                        help="增量更新已有快照 (重取近 10 天并合并)")
    args = parser.parse_args()

    os.makedirs(RAW_DIR, exist_ok=True)
    failed = []
    for i, (code, name, _, market) in enumerate(STOCK_POOL):
        out_path = os.path.join(RAW_DIR, f"{code}.csv")
        incremental = args.incremental and os.path.exists(out_path)
        if os.path.exists(out_path) and not args.force and not args.incremental:
            print(f"[skip] {code} {name} 快照已存在")
            continue
        try:
            if market == "CRYPTO":
                # AKShare 无加密货币数据源, 用模拟数据补齐 (与 mock_data.py 同参数)
                df = generate_one(code, SEED + i, market)
                tag = "mock"
            elif market == "US":
                # 美股接口在部分网络环境不可达, 失败时退回模拟数据
                try:
                    df = fetch_us_one(code)
                    tag = "ok"
                    time.sleep(1)
                except Exception:
                    df = generate_one(code, SEED + i, market)
                    tag = "mock"
            else:
                df = fetch_one(code)
                tag = "ok"
                time.sleep(1)  # 避免触发限流
            if incremental:
                df = merge_incremental(out_path, df)
                tag += "+inc"
            df.to_csv(out_path, index=False, encoding="utf-8")
            print(f"[{tag}]   {code} {name} {len(df)} 行 -> {out_path}")
        except Exception as e:
            failed.append(code)
            print(f"[fail] {code} {name}: {e}")

    if failed:
        print(f"\n失败: {failed}, 可重试或运行 mock_data.py 生成模拟数据")
        sys.exit(1)
    print("\n采集完成")


if __name__ == "__main__":
    main()
