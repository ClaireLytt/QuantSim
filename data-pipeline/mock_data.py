"""生成模拟日线数据 (几何布朗运动), 输出格式与 fetch_data.py 相同。

AKShare 不可用或无网络时, 用它跑通整条链路: python mock_data.py
"""
import os

import numpy as np
import pandas as pd

from config import DELISTED_POOL, RAW_DIR, STOCK_POOL

TRADING_DAYS = 480
DELISTED_DAYS = 300  # 退市标的序列更短: 跌完就从市场上消失 (E11 的素材本体)
SEED = 42
START_DATE = "2024-01-02"


def generate_one(code: str, seed: int, market: str = "STOCK") -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    if market == "CRYPTO":
        # 币圈 7x24 交易 (自然日), 波动率显著高于 A 股
        dates = pd.date_range(START_DATE, periods=TRADING_DAYS)
        base_price = rng.uniform(100, 5000)
        mu, sigma = 0.0006, rng.uniform(0.035, 0.07)
    elif market == "US":
        # 美股工作日交易, 价位偏高, 波动率介于 A 股与币圈之间
        dates = pd.bdate_range(START_DATE, periods=TRADING_DAYS)
        base_price = rng.uniform(50, 500)
        mu, sigma = 0.0004, rng.uniform(0.015, 0.04)
    else:
        dates = pd.bdate_range(START_DATE, periods=TRADING_DAYS)
        base_price = rng.uniform(10, 200)
        mu, sigma = 0.0003, rng.uniform(0.012, 0.03)
    returns = rng.normal(mu, sigma, TRADING_DAYS)
    close = base_price * np.exp(np.cumsum(returns))

    open_ = close * (1 + rng.normal(0, 0.005, TRADING_DAYS))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.008, TRADING_DAYS)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.008, TRADING_DAYS)))
    volume = rng.integers(1_000_000, 50_000_000, TRADING_DAYS)

    return pd.DataFrame({
        "trade_date": dates.strftime("%Y-%m-%d"),
        "open": np.round(open_, 2),
        "high": np.round(high, 2),
        "low": np.round(low, 2),
        "close": np.round(close, 2),
        "volume": volume,
        "code": code,
    })


def generate_delisted(code: str, seed: int) -> pd.DataFrame:
    """退市标的: 前段正常, 后 40% 阴跌加速 (日均 -1.2%), 序列止于退市日。"""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(START_DATE, periods=DELISTED_DAYS)
    base_price = rng.uniform(10, 60)
    cliff = int(DELISTED_DAYS * 0.6)
    mu = np.where(np.arange(DELISTED_DAYS) < cliff, 0.0002, -0.012)
    returns = rng.normal(mu, 0.03, DELISTED_DAYS)
    close = base_price * np.exp(np.cumsum(returns))
    open_ = close * (1 + rng.normal(0, 0.005, DELISTED_DAYS))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.008, DELISTED_DAYS)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.008, DELISTED_DAYS)))
    volume = rng.integers(1_000_000, 50_000_000, DELISTED_DAYS)
    return pd.DataFrame({
        "trade_date": dates.strftime("%Y-%m-%d"),
        "open": np.round(open_, 2),
        "high": np.round(high, 2),
        "low": np.round(low, 2),
        "close": np.round(close, 2),
        "volume": volume,
        "code": code,
    })


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    for i, (code, name, _, market) in enumerate(STOCK_POOL):
        df = generate_one(code, SEED + i, market)
        out_path = os.path.join(RAW_DIR, f"{code}.csv")
        df.to_csv(out_path, index=False, encoding="utf-8")
        print(f"[mock] {code} {name} {len(df)} 行 -> {out_path}")
    for i, (code, name, _, _market) in enumerate(DELISTED_POOL):
        df = generate_delisted(code, SEED + 1000 + i)
        out_path = os.path.join(RAW_DIR, f"{code}.csv")
        df.to_csv(out_path, index=False, encoding="utf-8")
        print(f"[mock][delisted] {code} {name} {len(df)} 行 -> {out_path}")
    print("\n模拟数据生成完成")


if __name__ == "__main__":
    main()
