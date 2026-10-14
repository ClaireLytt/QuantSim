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

    /** 按预测模型名反查难度档 (对局只存 aiModel 不存档位), 未知模型回退 NORMAL。 */
    public static AiLevel fromModel(String model) {
        for (AiLevel level : values()) {
            if (level.model.equals(model)) {
                return level;
            }
        }
        return NORMAL;
    }
}
