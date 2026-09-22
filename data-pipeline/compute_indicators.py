"""Spark 批处理: 读取 data/raw/*.csv, 计算 MA5/MA20/波动率/涨跌幅, 输出到 data/indicators/。

用法: python compute_indicators.py
支持批量重跑: 每次全量覆盖输出目录。
"""
import glob
import os
import shutil

from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F

from config import RAW_DIR, INDICATOR_DIR

VOLATILITY_WINDOW = 20


def main():
    raw_files = glob.glob(os.path.join(RAW_DIR, "*.csv"))
    if not raw_files:
        raise SystemExit(f"未找到原始数据, 请先运行 fetch_data.py 或 mock_data.py ({RAW_DIR})")

    spark = (
        SparkSession.builder
        .appName("QuantSim-Indicators")
        .master("local[*]")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df = (
        spark.read.option("header", True)
        .csv(raw_files)
        .select(
            F.col("code"),
            F.to_date("trade_date").alias("trade_date"),
            F.col("close").cast("double"),
        )
    )

    w_order = Window.partitionBy("code").orderBy("trade_date")
    w_ma5 = w_order.rowsBetween(-4, 0)
    w_ma20 = w_order.rowsBetween(-19, 0)
    w_vol = w_order.rowsBetween(-(VOLATILITY_WINDOW - 1), 0)

    # 窗口内数据不足时输出 NULL, 避免把不完整窗口的均值当作真实均线
    result = (
        df
        .withColumn("prev_close", F.lag("close").over(w_order))
        .withColumn("pct_change", F.round((F.col("close") - F.col("prev_close")) / F.col("prev_close"), 4))
        .withColumn("ma5", F.when(
            F.count("close").over(w_ma5) >= 5,
            F.round(F.avg("close").over(w_ma5), 2)))
        .withColumn("ma20", F.when(
            F.count("close").over(w_ma20) >= 20,
            F.round(F.avg("close").over(w_ma20), 2)))
        .withColumn("volatility", F.when(
            F.count("pct_change").over(w_vol) >= VOLATILITY_WINDOW,
            F.round(F.stddev("pct_change").over(w_vol), 4)))
        .select("code", "trade_date", "ma5", "ma20", "volatility", "pct_change")
    ).persist()  # write 和 count 各触发一次 action, 缓存避免整个 DAG 重算两遍

    if os.path.exists(INDICATOR_DIR):
        shutil.rmtree(INDICATOR_DIR)
    result.coalesce(1).write.option("header", True).csv(INDICATOR_DIR)

    print(f"指标计算完成, 共 {result.count()} 行 -> {INDICATOR_DIR}")
    spark.stop()


if __name__ == "__main__":
    main()
