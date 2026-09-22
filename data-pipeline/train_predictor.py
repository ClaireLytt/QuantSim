"""训练"次日涨跌"预测模型, 输出每股每日的上涨概率 (AI 操盘手的大脑)。

用法: python train_predictor.py   (需先运行 compute_indicators.py)
输出: data/predictions/predictions.csv  (code, trade_date, model, prob_up, predicted_direction)

三档模型对应游戏内 AI 难度: LOGISTIC(简单) / FOREST(普通) / BOOST(困难)。
防未来泄漏: 滚动窗口 —— 按日期切成 20 天一块, 预测第 k 块时只用该块之前的数据训练。
最早 60 天只做训练不做预测 (游戏开局至少有 60 天历史, 不受影响)。
"""
import glob
import os
import shutil

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config import RAW_DIR, INDICATOR_DIR, PREDICTION_DIR

MIN_TRAIN_DAYS = 60
BLOCK_DAYS = 20
FEATURES = ["pct_change", "volatility", "close_ma5", "ma5_ma20", "vol_ratio"]

MODELS = {
    "LOGISTIC": lambda: make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)),
    "FOREST": lambda: RandomForestClassifier(
        n_estimators=120, min_samples_leaf=20, random_state=42, n_jobs=-1),
    "BOOST": lambda: GradientBoostingClassifier(random_state=42),
}


def read_dir(path: str) -> pd.DataFrame:
    files = glob.glob(os.path.join(path, "*.csv"))
    if not files:
        raise SystemExit(f"未找到数据: {path}, 请先运行前置步骤")
    return pd.concat([pd.read_csv(f, dtype={"code": str}) for f in files], ignore_index=True)


def build_dataset() -> pd.DataFrame:
    prices = read_dir(RAW_DIR)[["code", "trade_date", "close", "volume"]]
    inds = read_dir(INDICATOR_DIR)
    df = prices.merge(inds, on=["code", "trade_date"], how="inner")
    df = df.sort_values(["code", "trade_date"]).reset_index(drop=True)

    g = df.groupby("code", group_keys=False)
    df["close_ma5"] = df["close"] / df["ma5"] - 1
    df["ma5_ma20"] = df["ma5"] / df["ma20"] - 1
    df["vol_ratio"] = df["volume"] / g["volume"].transform(
        lambda s: s.rolling(5, min_periods=5).mean()) - 1
    # 标签: 次日收盘是否高于今日收盘 (最后一天无标签, 只预测不参与训练)
    df["label"] = (g["close"].shift(-1) > df["close"]).astype(float)
    df.loc[g.cumcount(ascending=False) == 0, "label"] = np.nan
    # 标签来源日期: 训练时据此排除标签取自测试期的样本 (防未来泄漏)
    df["next_date"] = g["trade_date"].shift(-1).fillna("9999-12-31")
    return df


def main():
    df = build_dataset()
    dates = np.sort(df["trade_date"].unique())
    if len(dates) <= MIN_TRAIN_DAYS:
        raise SystemExit(f"数据不足 {MIN_TRAIN_DAYS} 天, 无法训练")

    feature_ok = df[FEATURES].notna().all(axis=1)
    trainable = feature_ok & df["label"].notna()
    preds = []
    hits = {name: 0 for name in MODELS}
    total = {name: 0 for name in MODELS}
    for b in range(MIN_TRAIN_DAYS, len(dates), BLOCK_DAYS):
        block = set(dates[b:b + BLOCK_DAYS])
        # 训练样本的标签须来自测试块之前 (next_date < 块首日), 否则泄漏未来信息
        train = df[trainable & (df["next_date"] < dates[b])]
        test = df[df["trade_date"].isin(block) & feature_ok]
        if train["label"].nunique() < 2 or test.empty:
            continue
        labeled = test["label"].notna().values
        for name, factory in MODELS.items():
            model = factory()
            model.fit(train[FEATURES], train["label"])
            prob_up = model.predict_proba(test[FEATURES])[:, 1]
            preds.append(pd.DataFrame({
                "code": test["code"].values,
                "trade_date": test["trade_date"].values,
                "model": name,
                "prob_up": np.round(prob_up, 4),
            }))
            hits[name] += int((((prob_up >= 0.5) == (test["label"] == 1.0)) & labeled).sum())
            total[name] += int(labeled.sum())

    if not preds:
        raise SystemExit("未产出任何预测, 请检查数据")
    out = pd.concat(preds, ignore_index=True)
    out["predicted_direction"] = np.where(out["prob_up"] >= 0.5, "UP", "DOWN")

    if os.path.exists(PREDICTION_DIR):
        shutil.rmtree(PREDICTION_DIR)
    os.makedirs(PREDICTION_DIR)
    out.to_csv(os.path.join(PREDICTION_DIR, "predictions.csv"), index=False)
    print(f"预测完成: {len(out)} 行 -> {PREDICTION_DIR}")
    for name in MODELS:
        acc = hits[name] / total[name] if total[name] else float("nan")
        print(f"  {name}: 滚动外推方向准确率 {acc:.2%} ({hits[name]}/{total[name]})")


if __name__ == "__main__":
    main()
