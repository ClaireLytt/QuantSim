"""mock 行情生成的不变式测试: 任何市场、任何种子, OHLC 关系与数据形状都不能破。

为什么测这些: 回测/对局引擎默认 high>=max(open,close)>=min(open,close)>=low,
mock 数据一旦违反, 挂单撮合 (按 OHLC) 会出现"成交价不在当日区间"的假 bug, 极难排查。
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mock_data import TRADING_DAYS, generate_one  # noqa: E402


@pytest.mark.parametrize("market", ["STOCK", "US", "CRYPTO"])
@pytest.mark.parametrize("seed", [1, 42, 20261016])
def test_ohlc_invariants(market, seed):
    df = generate_one("TST", seed, market)
    assert (df["high"] >= df[["open", "close"]].max(axis=1)).all()
    assert (df["low"] <= df[["open", "close"]].min(axis=1)).all()
    assert (df["low"] > 0).all(), "价格必须为正"
    assert (df["volume"] > 0).all()


@pytest.mark.parametrize("market", ["STOCK", "US", "CRYPTO"])
def test_shape_and_columns(market):
    df = generate_one("TST", 42, market)
    assert len(df) == TRADING_DAYS
    assert list(df.columns) == ["trade_date", "open", "high", "low", "close", "volume", "code"]
    assert df["trade_date"].is_unique and df["trade_date"].is_monotonic_increasing
    assert (df["code"] == "TST").all()


def test_deterministic_by_seed():
    """同种子同输出: 幂等重灌数据库不会产生漂移。"""
    a = generate_one("TST", 42)
    b = generate_one("TST", 42)
    assert a.equals(b)
    assert not a.equals(generate_one("TST", 43))


def test_crypto_trades_all_days():
    """币圈 7x24: 自然日连续; A 股/美股只有工作日。"""
    import pandas as pd
    crypto = pd.to_datetime(generate_one("TST", 1, "CRYPTO")["trade_date"])
    assert (crypto.diff().dropna() == pd.Timedelta(days=1)).all()
    stock = pd.to_datetime(generate_one("TST", 1, "STOCK")["trade_date"])
    assert (stock.dt.dayofweek < 5).all()
