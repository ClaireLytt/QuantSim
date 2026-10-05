# -*- coding: utf-8 -*-
"""事件回放场景的历史行情回灌: 抓取场景窗口 (含前置预热段) 的真实日线,
用 pandas 复算指标 (与 compute_indicators.py 的 Spark 口径一致), 直接 upsert 入库。

用法: python fetch_scenarios.py          # 回灌全部场景
     python fetch_scenarios.py CN_2015_CRASH  # 只回灌指定场景

与常规管道的关键差异:
- 行情挂在 hidden 标的行上 (code = "真实代码@场景code"), 不进任何公开列表 (防比对泄题);
- **没有 mock 回退**: 事件回放的意义就是真实历史, akshare 失败或数据量不足直接报错退出;
- 跳过预测模型 (EVENT 强制非进阶, 对局内不展示 AI 预测)。
幂等: stocks/daily_price/daily_indicator 全部 ON DUPLICATE KEY 覆盖。
"""
import sys
from datetime import datetime, timedelta

import akshare as ak
import pandas as pd
import pymysql

from config import DB_CONFIG

VOLATILITY_WINDOW = 20  # 与 compute_indicators.py 同值

# 窗口前多抓的自然日天数: 保证至少 60 根预热 K 线 (节假日折损后仍有富余)
PRE_FETCH_DAYS = 180
MIN_PRE_BARS = 60

# 与 V22__event_scenarios.sql 的目录保持一致 (code, market, window_start, window_end, tickers)
SCENARIOS = [
    ("CN_2015_CRASH",    "STOCK", "2015-05-15", "2015-07-31",
     [("600519", "贵州茅台"), ("601318", "中国平安"), ("600030", "中信证券"), ("601988", "中国银行")]),
    ("CN_2016_FUSE",     "STOCK", "2015-12-15", "2016-02-05",
     [("600519", "贵州茅台"), ("601318", "中国平安"), ("600036", "招商银行"), ("000858", "五粮液")]),
    ("CN_2018_TRADEWAR", "STOCK", "2018-03-15", "2018-07-15",
     [("600519", "贵州茅台"), ("601318", "中国平安"), ("600036", "招商银行"), ("000858", "五粮液")]),
    ("US_2020_COVID",    "US",    "2020-02-14", "2020-04-15",
     [("AAPL", "苹果"), ("MSFT", "微软"), ("JPM", "摩根大通"), ("XOM", "埃克森美孚")]),
    ("US_2008_LEHMAN",   "US",    "2008-08-15", "2008-11-15",
     [("AAPL", "苹果"), ("MSFT", "微软"), ("JPM", "摩根大通"), ("GS", "高盛")]),
]


def fetch_window(code: str, market: str, start: str, end: str) -> pd.DataFrame:
    """抓取 [start-PRE_FETCH_DAYS, end+10d] 的日线; 失败直接抛错 (绝不 mock)。"""
    pre = (datetime.strptime(start, "%Y-%m-%d") - timedelta(days=PRE_FETCH_DAYS)).strftime("%Y%m%d")
    post = (datetime.strptime(end, "%Y-%m-%d") + timedelta(days=10)).strftime("%Y%m%d")
    if market == "STOCK":
        df = ak.stock_zh_a_hist(symbol=code, period="daily",
                                start_date=pre, end_date=post, adjust="qfq")
        df = df.rename(columns={"日期": "trade_date", "开盘": "open", "最高": "high",
                                "最低": "low", "收盘": "close", "成交量": "volume"})
        df["volume"] = df["volume"] * 100  # 手 -> 股
    else:
        df = ak.stock_us_daily(symbol=code, adjust="qfq")
        df = df.rename(columns={"date": "trade_date"})
        pre_d = f"{pre[:4]}-{pre[4:6]}-{pre[6:]}"
        post_d = f"{post[:4]}-{post[4:6]}-{post[6:]}"
        df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
        df = df[(df["trade_date"] >= pre_d) & (df["trade_date"] <= post_d)]
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    df = df[["trade_date", "open", "high", "low", "close", "volume"]].copy()
    df = df.sort_values("trade_date").reset_index(drop=True)
    df["volume"] = df["volume"].astype("int64")
    return df


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """与 compute_indicators.py 的 Spark 口径一致: 窗口不满输出 NULL。"""
    out = df[["trade_date"]].copy()
    close = df["close"].astype(float)
    pct = (close - close.shift(1)) / close.shift(1)
    out["pct_change"] = pct.round(4)
    out["ma5"] = close.rolling(5, min_periods=5).mean().round(2)
    out["ma20"] = close.rolling(20, min_periods=20).mean().round(2)
    out["volatility"] = pct.rolling(VOLATILITY_WINDOW, min_periods=VOLATILITY_WINDOW) \
        .std().round(4)
    return out


def upsert(cursor, scen_code: str, market: str, name: str, df: pd.DataFrame, ind: pd.DataFrame,
           hidden_code: str):
    cursor.execute(
        "INSERT INTO stocks (code, name, industry, market, hidden) VALUES (%s, %s, %s, %s, 1) "
        "ON DUPLICATE KEY UPDATE name=VALUES(name), market=VALUES(market), hidden=1",
        (hidden_code, name, None, market),
    )
    cursor.execute("SELECT stock_id FROM stocks WHERE code=%s", (hidden_code,))
    stock_id = cursor.fetchone()[0]
    cursor.executemany(
        "INSERT INTO daily_price (stock_id, trade_date, open, high, low, close, volume) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s) "
        "ON DUPLICATE KEY UPDATE open=VALUES(open), high=VALUES(high), "
        "low=VALUES(low), close=VALUES(close), volume=VALUES(volume)",
        [(stock_id, r.trade_date, r.open, r.high, r.low, r.close, int(r.volume))
         for r in df.itertuples()],
    )
    ind2 = ind.astype(object).where(pd.notnull(ind), None)
    cursor.executemany(
        "INSERT INTO daily_indicator (stock_id, trade_date, ma5, ma20, volatility, pct_change) "
        "VALUES (%s, %s, %s, %s, %s, %s) "
        "ON DUPLICATE KEY UPDATE ma5=VALUES(ma5), ma20=VALUES(ma20), "
        "volatility=VALUES(volatility), pct_change=VALUES(pct_change)",
        [(stock_id, r.trade_date, r.ma5, r.ma20, r.volatility, r.pct_change)
         for r in ind2.itertuples()],
    )


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    conn = pymysql.connect(**DB_CONFIG, charset="utf8mb4", autocommit=False)
    failures = []
    try:
        with conn.cursor() as cursor:
            for scen_code, market, start, end, tickers in SCENARIOS:
                if only and scen_code != only:
                    continue
                ready = 0
                for code, name in tickers:
                    hidden_code = f"{code}@{scen_code}"
                    try:
                        df = fetch_window(code, market, start, end)
                    except Exception as e:  # noqa: BLE001 - akshare 异常种类繁杂, 统一按失败处理
                        failures.append(f"{hidden_code}: 抓取失败 {e}")
                        continue
                    pre_bars = (df["trade_date"] < start).sum()
                    in_bars = ((df["trade_date"] >= start) & (df["trade_date"] <= end)).sum()
                    if pre_bars < MIN_PRE_BARS or in_bars < 25:
                        failures.append(
                            f"{hidden_code}: 数据量不足 (预热 {pre_bars} 根 / 窗口内 {in_bars} 根), "
                            "绝不 mock 补数 —— 真实事件回放只能用真实行情")
                        continue
                    ind = compute_indicators(df)
                    upsert(cursor, scen_code, market, name, df, ind, hidden_code)
                    ready += 1
                    print(f"{hidden_code}: 预热 {pre_bars} 根 + 窗口内 {in_bars} 根, 已入库")
                    conn.commit()
                if ready == 0:
                    failures.append(f"场景 {scen_code}: 没有任何候选标的就绪")
    finally:
        conn.close()
    if failures:
        print("\n以下条目回灌失败:")
        for f in failures:
            print("  - " + f)
        sys.exit(1)
    print("\n全部场景回灌完成")


if __name__ == "__main__":
    main()
