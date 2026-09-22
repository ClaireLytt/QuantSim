package com.quantsim.entity;

/** 交易市场: 决定最小交易单位 (整手股数)。 */
public enum Market {
    /** A股: 一手 100 股 */
    STOCK(100),
    /** 美股: 按 1 股起买 */
    US(1),
    /** 加密货币: 按 1 枚起买 */
    CRYPTO(1);

    private final int lotSize;

    Market(int lotSize) {
        this.lotSize = lotSize;
    }

    public int getLotSize() {
        return lotSize;
    }
}
