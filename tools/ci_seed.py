# -*- coding: utf-8 -*-
"""CI 冒烟专用灌数据: 直接往 quantsim 库插 3 只合成行情 (随机游走 180 天)。

不走完整数据管道 (PySpark 在 CI 里太重): 价格/MA/涨跌幅/预测在这里用纯 Python 算,
表结构由后端启动时的 Flyway 建好, 本脚本只负责 INSERT (幂等 upsert)。
用法: 后端起好后  python tools/ci_seed.py  (QUANTSIM_DB_* 环境变量同管道)。
"""
import os
import random
from datetime import date, timedelta

import pymysql

DB = dict(
    host=os.environ.get("QUANTSIM_DB_HOST", "127.0.0.1"),
    port=int(os.environ.get("QUANTSIM_DB_PORT", "3306")),
    user=os.environ.get("QUANTSIM_DB_USER", "root"),
    password=os.environ.get("QUANTSIM_DB_PASSWORD", "root"),
    database=os.environ.get("QUANTSIM_DB_NAME", "quantsim"),
    charset="utf8mb4",
)

STOCKS = [
    ("600519", "贵州茅台", "白酒", "STOCK"),
    ("AAPL", "苹果", "科技", "US"),
    ("BTC", "比特币", "加密货币", "CRYPTO"),
]
DAYS = 180
MODELS = ["LOGISTIC", "FOREST", "BOOST"]


def trading_days(n):
    """近 n 个工作日 (倒推), 升序返回。"""
    days = []
    d = date.today()
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return list(reversed(days))


def main():
    rng = random.Random(42)  # 固定种子: CI 可复现
    conn = pymysql.connect(**DB)
    try:
        with conn.cursor() as cur:
            for code, name, industry, market in STOCKS:
                cur.execute(
                    "INSERT INTO stocks (code, name, industry, market) VALUES (%s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE name=VALUES(name), industry=VALUES(industry), market=VALUES(market)",
                    (code, name, industry, market))
                cur.execute("SELECT stock_id FROM stocks WHERE code=%s", (code,))
                stock_id = cur.fetchone()[0]

                closes = []
                price = 100.0
                for d in trading_days(DAYS):
                    chg = rng.gauss(0.0005, 0.02)
                    o = price
                    c = max(1.0, price * (1 + chg))
                    hi = max(o, c) * (1 + abs(rng.gauss(0, 0.005)))
                    lo = min(o, c) * (1 - abs(rng.gauss(0, 0.005)))
                    vol = rng.randint(1_000_000, 9_000_000)
                    cur.execute(
                        "INSERT INTO daily_prices (stock_id, trade_date, open, high, low, close, volume) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                        "ON DUPLICATE KEY UPDATE open=VALUES(open), high=VALUES(high), "
                        "low=VALUES(low), close=VALUES(close), volume=VALUES(volume)",
                        (stock_id, d, round(o, 2), round(hi, 2), round(lo, 2), round(c, 2), vol))
                    closes.append((d, c))
                    price = c

                # 指标: MA5/MA20/涨跌幅
                for i, (d, c) in enumerate(closes):
                    ma5 = round(sum(x[1] for x in closes[max(0, i - 4):i + 1]) / min(i + 1, 5), 2) if i >= 4 else None
                    ma20 = round(sum(x[1] for x in closes[max(0, i - 19):i + 1]) / min(i + 1, 20), 2) if i >= 19 else None
                    pct = round(c / closes[i - 1][1] - 1, 4) if i > 0 else None
                    cur.execute(
                        "INSERT INTO daily_indicators (stock_id, trade_date, ma5, ma20, volatility, pct_change) "
                        "VALUES (%s, %s, %s, %s, %s, %s) "
                        "ON DUPLICATE KEY UPDATE ma5=VALUES(ma5), ma20=VALUES(ma20), pct_change=VALUES(pct_change)",
                        (stock_id, d, ma5, ma20, None, pct))

                # 三模型预测: 带点噪声的随机置信度, 够 AI 对手决策用
                for d, _ in closes:
                    for m in MODELS:
                        prob = round(min(0.95, max(0.05, rng.gauss(0.5, 0.15))), 4)
                        cur.execute(
                            "INSERT INTO daily_predictions (stock_id, trade_date, model, predicted_direction, prob_up) "
                            "VALUES (%s, %s, %s, %s, %s) "
                            "ON DUPLICATE KEY UPDATE prob_up=VALUES(prob_up), "
                            "predicted_direction=VALUES(predicted_direction)",
                            (stock_id, d, m, "UP" if prob >= 0.5 else "DOWN", prob))
        conn.commit()
        print("ci_seed: %d stocks x %d days seeded" % (len(STOCKS), DAYS))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
