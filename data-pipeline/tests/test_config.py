"""config 的关键约定: END_DATE 必须动态取今天 (数据保鲜守则), 股票池结构完整。"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402


def test_end_date_is_today():
    """曾写死过期日期导致行情停更 (CLAUDE.md 上线设施), 回归锁死动态取值。"""
    assert config.END_DATE == date.today().strftime("%Y%m%d")


def test_stock_pool_shape():
    assert len(config.STOCK_POOL) > 0
    codes = [row[0] for row in config.STOCK_POOL]
    assert len(codes) == len(set(codes)), "股票代码不得重复 (入库 upsert 以 code 为键)"
    markets = {row[3] for row in config.STOCK_POOL}
    assert markets <= {"STOCK", "US", "CRYPTO"}, f"未知市场类型: {markets}"
    assert all(len(row) == 4 for row in config.STOCK_POOL)


def test_volatility_window_positive():
    assert config.VOLATILITY_WINDOW > 1
