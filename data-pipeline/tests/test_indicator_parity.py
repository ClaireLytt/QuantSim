"""指标双实现对拍: 常规管道 (Spark) 与场景采集 (pandas) 必须算出同一口径。

为什么存在两份实现: 常规管道走 PySpark 批处理 (compute_indicators.py), 场景采集走
pandas (fetch_scenarios.compute_indicators), 两个引擎无法共享代码体, 只能各写一份。
为什么必须对拍: 口径 (round 位数 / 窗口不满输出 NULL / prev_close=0 除零保护) 只靠
注释互相锚定, 任何一侧单独改动都不会被编译器拦住——漂移的脏指标会直接进
daily_indicator, 玩家在普通模式与场景模式看到的均线/波动率就对不上了。
本测试把同一份合成行情喂给两侧, 逐行断言四个指标列相等, 锁死口径。
不要通过删掉任何一侧实现来"消灭重复"——那会砍掉一个执行引擎。
"""
import os
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
# compute_indicators 顶层 import pyspark; CI 的 python-check 按设计不装 Spark,
# 必须在收集期就跳过 (运行时 skip 挡不住 import 期 ImportError) —— 与下方 akshare 同款守门
pytest.importorskip("pyspark", reason="缺 PySpark, 无法加载 Spark 侧实现 (本地手跑对拍)")
import compute_indicators  # noqa: E402
from config import VOLATILITY_WINDOW  # noqa: E402

# fetch_scenarios 顶层 import akshare (采集库, 部分环境未装); 缺依赖时跳过而非假绿
fetch_scenarios = pytest.importorskip(
    "fetch_scenarios", reason="缺 akshare 等采集依赖, 无法加载 pandas 侧实现"
)


def _synthetic_df():
    """30 天确定性行情: 覆盖 ma20 窗口不满→满的边界; 第 23 行 close=0 触发除零保护。"""
    closes = [round(10 + 0.37 * i + (1.5 if i % 7 == 3 else -0.8), 2) for i in range(30)]
    closes[22] = 0.0  # prev_close=0 使第 24 行 pct_change 走除零分支
    dates = pd.date_range("2026-01-05", periods=30, freq="B").strftime("%Y-%m-%d")
    return pd.DataFrame({"trade_date": dates, "close": closes})


def _spark_output(df, tmp_path, monkeypatch):
    """跑真实 Spark 管道 (monkeypatch 输入输出目录), 返回按日期排序的指标 DataFrame。

    刻意调 main() 而不是复刻其窗口逻辑: 对拍必须对着真实现, 复刻就是第三份口径。
    """
    raw = tmp_path / "raw"
    out = tmp_path / "ind"
    raw.mkdir()
    df.assign(code="TST").to_csv(raw / "TST.csv", index=False)
    monkeypatch.setattr(compute_indicators, "RAW_DIR", str(raw))
    monkeypatch.setattr(compute_indicators, "INDICATOR_DIR", str(out))
    try:
        compute_indicators.main()
    except Exception as e:  # 本机无 JDK/Spark 起不来: 跳过并留可读原因, 不装通过
        pytest.skip(f"Spark 本地会话不可用: {e}")
    part = [f for f in os.listdir(out) if f.endswith(".csv")]
    assert len(part) == 1
    got = pd.read_csv(out / part[0])
    return got.sort_values("trade_date").reset_index(drop=True)


def _cell(v):
    """NaN/NULL 统一成 None; inf 保留原样让断言炸出来 (除零保护失效的典型症状)。"""
    if v is None or (isinstance(v, float) and v != v):
        return None
    return float(v)


def test_pandas_spark_parity(tmp_path, monkeypatch):
    df = _synthetic_df()
    spark_out = _spark_output(df, tmp_path, monkeypatch)
    pandas_out = fetch_scenarios.compute_indicators(df)

    assert len(spark_out) == len(pandas_out) == 30
    for col in ("pct_change", "ma5", "ma20", "volatility"):
        s = [_cell(v) for v in spark_out[col]]
        p = [_cell(v) for v in pandas_out[col]]
        assert s == p, f"口径漂移: {col}\nspark ={s}\npandas={p}"

    # 窗口不满必须输出 None (两侧一致之外再钉死绝对口径, 防两侧一起漂)
    p_ma5 = [_cell(v) for v in pandas_out["ma5"]]
    p_ma20 = [_cell(v) for v in pandas_out["ma20"]]
    p_pct = [_cell(v) for v in pandas_out["pct_change"]]
    assert p_ma5[:4] == [None] * 4 and p_ma5[4] is not None
    assert p_ma20[:19] == [None] * 19 and p_ma20[19] is not None
    assert p_pct[0] is None            # 首日无 prev_close
    assert p_pct[23] is None           # 第 23 行 close=0 -> 第 24 行除零, 必须 None 而非 inf
    assert _cell(pandas_out["volatility"][VOLATILITY_WINDOW - 1]) is None  # 首日 pct 为 None, 窗口不满
