"""AKShare 采集股票日线数据, 每只股票保存一份 CSV 快照到 data/raw/.

用法: python fetch_data.py
快照已存在时跳过, 加 --force 强制重新拉取。
"""
import argparse
import os
import sys
import time

import akshare as ak
import pandas as pd

from config import RAW_DIR, START_DATE, END_DATE, STOCK_POOL
from mock_data import SEED, generate_one

COLUMN_MAP = {
    "日期": "trade_date",
    "开盘": "open",
    "最高": "high",
    "最低": "low",
    "收盘": "close",
    "成交量": "volume",
}


def fetch_one(code: str) -> pd.DataFrame:
    df = ak.stock_zh_a_hist(
        symbol=code,
        period="daily",
        start_date=START_DATE,
        end_date=END_DATE,
        adjust="qfq",
    )
    df = df.rename(columns=COLUMN_MAP)
    df = df[["trade_date", "open", "high", "low", "close", "volume"]]
    # AKShare 成交量单位是"手"(100股), 统一转为股, 与 mock 数据口径一致
    df["volume"] = df["volume"] * 100
    df["code"] = code
    return df


def fetch_us_one(code: str) -> pd.DataFrame:
    df = ak.stock_us_daily(symbol=code, adjust="qfq")
    df = df.rename(columns={"date": "trade_date"})
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    start = f"{START_DATE[:4]}-{START_DATE[4:6]}-{START_DATE[6:]}"
    end = f"{END_DATE[:4]}-{END_DATE[4:6]}-{END_DATE[6:]}"
    df = df[(df["trade_date"] >= start) & (df["trade_date"] <= end)]
    df = df[["trade_date", "open", "high", "low", "close", "volume"]].copy()
    df["volume"] = df["volume"].astype("int64")
    df["code"] = code
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="覆盖已有快照")
    args = parser.parse_args()

    os.makedirs(RAW_DIR, exist_ok=True)
    failed = []
    for i, (code, name, _, market) in enumerate(STOCK_POOL):
        out_path = os.path.join(RAW_DIR, f"{code}.csv")
        if os.path.exists(out_path) and not args.force:
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
