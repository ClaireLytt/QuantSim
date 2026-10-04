package com.quantsim.entity;

/** AI 对手难度: 每档对应一个预测模型 (daily_prediction.model)。 */
public enum AiLevel {
    EASY("LOGISTIC"),
    NORMAL("FOREST"),
    HARD("BOOST"),
    /** 地狱难度: 多层感知机, 且按置信度调仓 */
    HELL("MLP");

    private final String model;

    AiLevel(String model) {
        this.model = model;
    }

    public String getModel() {
        return model;
    }
}
