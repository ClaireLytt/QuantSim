package com.quantsim.service;

import org.springframework.stereotype.Service;

import com.quantsim.entity.GameSession;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * 对局视角的行情入口: 盲局 (每日/房间/战书/事件回放) 返回不可逆扰动后的数据
 * (BlindPerturb, 审计创意24), 其余原样。独立出一个 bean 是为了让
 * MarketDataService 的两个 @Cacheable 方法走代理而非自调用。
 * 规矩: 对局读写路径 (交易/撮合/结算/重放/复盘上下文) 一律从这里取数,
 * 混用 marketData.load 会让盲局的图表与成交价分叉。元数据 (股票名/代码/市场) 两边一致。
 */
@Service
@RequiredArgsConstructor
public class SessionMarketData {

    private final MarketDataService marketData;

    public StockData of(GameSession session, Long stockId) {
        return BlindDates.blind(session)
                ? marketData.loadBlind(stockId, session.getStartDate())
                : marketData.load(stockId);
    }
}
