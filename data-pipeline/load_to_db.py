"""将原始行情 + Spark 指标结果写入 MySQL (stocks / daily_price / daily_indicator)。

用法: python load_to_db.py
幂等: 重复运行按 (stock_id, trade_date) 覆盖更新。
"""
import glob
import os

import pandas as pd
import pymysql

from config import DB_CONFIG, DELISTED_POOL, INDICATOR_DIR, PREDICTION_DIR, RAW_DIR, STOCK_POOL


def get_conn():
    return pymysql.connect(**DB_CONFIG, charset="utf8mb4", autocommit=False)


def upsert_stocks(cursor) -> dict:
    for code, name, industry, market in STOCK_POOL:
        cursor.execute(
            "INSERT INTO stocks (code, name, industry, market) VALUES (%s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE name=VALUES(name), industry=VALUES(industry), "
            "market=VALUES(market)",
            (code, name, industry, market),
        )
    # 退市标的 (E11): hidden=1 隔离对局/榜单, delisted=1 供实验室调取
    for code, name, industry, market in DELISTED_POOL:
        cursor.execute(
            "INSERT INTO stocks (code, name, industry, market, hidden, delisted) "
            "VALUES (%s, %s, %s, %s, 1, 1) "
            "ON DUPLICATE KEY UPDATE name=VALUES(name), industry=VALUES(industry), "
            "market=VALUES(market), hidden=1, delisted=1",
            (code, name, industry, market),
        )
    cursor.execute("SELECT code, stock_id FROM stocks")
    return {row[0]: row[1] for row in cursor.fetchall()}


def mark_delist_dates(cursor):
    """退市日 = 该标的行情末行日期 (mock 与真实源同口径, 幂等)。"""
    cursor.execute(
        "UPDATE stocks s JOIN (SELECT stock_id, MAX(trade_date) d FROM daily_price "
        "GROUP BY stock_id) p ON p.stock_id = s.stock_id "
        "SET s.delist_date = p.d WHERE s.delisted = 1"
    )


def load_prices(cursor, code_to_id: dict):
    total = 0
    for path in glob.glob(os.path.join(RAW_DIR, "*.csv")):
        df = pd.read_csv(path, dtype={"code": str})
        # 入库前最后一道质量门 (fetch 已清过一轮, 这里防手工 CSV / 旧快照): 非正价拒入
        rows = [
            (code_to_id[r.code], r.trade_date, r.open, r.high, r.low, r.close, int(r.volume))
            for r in df.itertuples()
            if r.code in code_to_id
            and min(r.open, r.high, r.low, r.close) > 0
        ]
        cursor.executemany(
            "INSERT INTO daily_price (stock_id, trade_date, open, high, low, close, volume) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE open=VALUES(open), high=VALUES(high), "
            "low=VALUES(low), close=VALUES(close), volume=VALUES(volume)",
            rows,
        )
        total += len(rows)
    print(f"daily_price 写入 {total} 行")


def load_indicators(cursor, code_to_id: dict):
    files = glob.glob(os.path.join(INDICATOR_DIR, "*.csv"))
    if not files:
        raise SystemExit(f"未找到指标数据, 请先运行 compute_indicators.py ({INDICATOR_DIR})")
    total = 0
    for path in files:
        df = pd.read_csv(path, dtype={"code": str})
        df = df.astype(object).where(pd.notnull(df), None)
        rows = [
            (code_to_id[r.code], r.trade_date, r.ma5, r.ma20, r.volatility, r.pct_change)
            for r in df.itertuples()
            if r.code in code_to_id
        ]
        cursor.executemany(
            "INSERT INTO daily_indicator (stock_id, trade_date, ma5, ma20, volatility, pct_change) "
            "VALUES (%s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE ma5=VALUES(ma5), ma20=VALUES(ma20), "
            "volatility=VALUES(volatility), pct_change=VALUES(pct_change)",
            rows,
        )
        total += len(rows)
    print(f"daily_indicator 写入 {total} 行")


def load_predictions(cursor, code_to_id: dict):
    files = glob.glob(os.path.join(PREDICTION_DIR, "*.csv"))
    if not files:
        print(f"未找到预测数据, 跳过 (可先运行 train_predictor.py 生成 -> {PREDICTION_DIR})")
        return
    total = 0
    for path in files:
        df = pd.read_csv(path, dtype={"code": str})
        rows = [
            (code_to_id[r.code], r.trade_date, r.model, r.prob_up, r.predicted_direction)
            for r in df.itertuples()
            if r.code in code_to_id
        ]
        cursor.executemany(
            "INSERT INTO daily_prediction (stock_id, trade_date, model, prob_up, predicted_direction) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE prob_up=VALUES(prob_up), "
            "predicted_direction=VALUES(predicted_direction)",
            rows,
        )
        total += len(rows)
    print(f"daily_prediction 写入 {total} 行")


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            code_to_id = upsert_stocks(cursor)
            load_prices(cursor, code_to_id)
            mark_delist_dates(cursor)
            load_indicators(cursor, code_to_id)
            load_predictions(cursor, code_to_id)
        conn.commit()
        print("入库完成")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
