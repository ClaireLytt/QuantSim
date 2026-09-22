"""生成模拟日线数据 (几何布朗运动), 输出格式与 fetch_data.py 相同。

AKShare 不可用或无网络时, 用它跑通整条链路: python mock_data.py
"""
import os

import numpy as np
import pandas as pd

from config import RAW_DIR, STOCK_POOL

TRADING_DAYS = 480
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


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    for i, (code, name, _, market) in enumerate(STOCK_POOL):
        df = generate_one(code, SEED + i, market)
        out_path = os.path.join(RAW_DIR, f"{code}.csv")
        df.to_csv(out_path, index=False, encoding="utf-8")
        print(f"[mock] {code} {name} {len(df)} 行 -> {out_path}")
    print("\n模拟数据生成完成")


if __name__ == "__main__":
    main()
