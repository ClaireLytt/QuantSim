package com.quantsim.entity;

/** AI 对手难度: 每档对应一个预测模型 (daily_prediction.model)。 */
public enum AiLevel {
    EASY("LOGISTIC"),
    NORMAL("FOREST"),
    HARD("BOOST");

    private final String model;

    AiLevel(String model) {
        this.model = model;
    }

    public String getModel() {
        return model;
    }
}
