package com.quantsim.service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.quantsim.config.GameProperties;
import com.quantsim.entity.Account;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.Position;
import com.quantsim.entity.SessionStock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.repository.PositionRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * 成交引擎: 玩家手动交易与挂单撮合共用的校验/执行逻辑。
 * 单股模式仓位在 Account 上, 组合模式在 positions 表;
 * 进阶模式允许负持仓 (做空) 与负现金 (杠杆), 以净值/敞口约束风险。
 */
@Service
@RequiredArgsConstructor
public class TradeEngine {

    private final MarketDataService marketData;
    private final FeeCalculator feeCalculator;
    private final PositionRepository positionRepository;
    private final SessionStockRepository sessionStockRepository;
    private final TransactionRepository transactionRepository;
    private final GameProperties props;

    /** 会话内全部标的 (slot 顺序); 单股模式即主标的一项。 */
    public List<Long> stockIds(GameSession session) {
        if (!"PORTFOLIO".equals(session.getMode())) {
            return List.of(session.getStockId());
        }
        return sessionStockRepository.findBySessionIdOrderBySlotAsc(session.getSessionId()).stream()
                .map(SessionStock::getStockId)
                .toList();
    }

    /** 读某标的当前持仓 (shares, avgCost)。 */
    public PositionMath.Fill position(GameSession session, Account account, Long stockId) {
        if (!"PORTFOLIO".equals(session.getMode())) {
            return new PositionMath.Fill(account.getHoldingShares(), account.getHoldingCost());
        }
        return positionRepository.findWithLockBySessionIdAndStockId(session.getSessionId(), stockId)
                .map(p -> new PositionMath.Fill(p.getShares(), p.getAvgCost()))
                .orElse(new PositionMath.Fill(0, BigDecimal.ZERO));
    }

    private void writePosition(GameSession session, Account account, Long stockId, PositionMath.Fill fill) {
        if (!"PORTFOLIO".equals(session.getMode())) {
            account.setHoldingShares(fill.shares());
            account.setHoldingCost(fill.avgCost());
            return;
        }
        Position pos = positionRepository.findWithLockBySessionIdAndStockId(session.getSessionId(), stockId)
                .orElseGet(() -> {
                    Position np = new Position();
                    np.setSessionId(session.getSessionId());
                    np.setStockId(stockId);
                    return np;
                });
        pos.setShares(fill.shares());
        pos.setAvgCost(fill.avgCost());
        positionRepository.save(pos);
    }

    /**
     * 各标的现价 (当前交易日收盘)。
     * 组合模式副标的当日可能停牌/无 bar: 退回到该日之前最近一根收盘估值,
     * 绝不能拿 0 估值——否则多头仓位凭空蒸发, 进阶模式还会被误强平。
     */
    public Map<Long, BigDecimal> currentCloses(GameSession session) {
        Map<Long, BigDecimal> closes = new HashMap<>();
        for (Long sid : stockIds(session)) {
            closes.put(sid, lastCloseOnOrBefore(marketData.load(sid), session.getCurrentTradeDate()));
        }
        return closes;
    }

    /** date 当天有 bar 取当天收盘; 否则二分找之前最近一根; 全无则 0。 */
    private BigDecimal lastCloseOnOrBefore(StockData sd, java.time.LocalDate date) {
        var bar = sd.bar(date);
        if (bar != null) {
            return bar.getClose();
        }
        var prices = sd.prices();
        int lo = 0;
        int hi = prices.size() - 1;
        int ans = -1;
        while (lo <= hi) {
            int mid = (lo + hi) >>> 1;
            if (prices.get(mid).getTradeDate().isAfter(date)) {
                hi = mid - 1;
            } else {
                ans = mid;
                lo = mid + 1;
            }
        }
        return ans < 0 ? BigDecimal.ZERO : prices.get(ans).getClose();
    }

    /** 净值 = 现金 + Σ 持仓×现价 (空头为负贡献)。 */
    public BigDecimal equity(GameSession session, Account account, Map<Long, BigDecimal> closes) {
        BigDecimal eq = account.getCashBalance();
        for (Map.Entry<Long, Integer> e : sharesByStock(session, account).entrySet()) {
            eq = eq.add(closes.getOrDefault(e.getKey(), BigDecimal.ZERO)
                    .multiply(BigDecimal.valueOf(e.getValue())));
        }
        return eq;
    }

    /** 总敞口 = Σ |持仓|×现价。 */
    public BigDecimal exposure(GameSession session, Account account, Map<Long, BigDecimal> closes) {
        BigDecimal ex = BigDecimal.ZERO;
        for (Map.Entry<Long, Integer> e : sharesByStock(session, account).entrySet()) {
            ex = ex.add(closes.getOrDefault(e.getKey(), BigDecimal.ZERO)
                    .multiply(BigDecimal.valueOf(Math.abs(e.getValue()))));
        }
        return ex;
    }

    public Map<Long, Integer> sharesByStock(GameSession session, Account account) {
        Map<Long, Integer> map = new HashMap<>();
        if (!"PORTFOLIO".equals(session.getMode())) {
            map.put(session.getStockId(), account.getHoldingShares());
            return map;
        }
        for (Position p : positionRepository.findBySessionId(session.getSessionId())) {
            map.put(p.getStockId(), p.getShares());
        }
        return map;
    }

    /**
     * 校验一笔成交是否可行。可行返回 null, 否则返回错误信息。
     * 普通模式: 买入受现金限制、卖出受持仓限制;
     * 进阶模式: 允许做空/透支, 但成交后需 净值>0 且 敞口 ≤ maxLeverage×净值。
     */
    public String validate(GameSession session, Account account, Long stockId,
                           TradeTransaction.Direction direction, BigDecimal price, int shares) {
        Market market = marketData.load(stockId).stock().getMarket();
        BigDecimal gross = price.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, direction, gross);

        if (!session.isAdvanced()) {
            if (direction == TradeTransaction.Direction.BUY) {
                if (account.getCashBalance().compareTo(gross.add(fee)) < 0) {
                    return "现金余额不足（含手续费 " + fee + "）";
                }
            } else {
                PositionMath.Fill pos = position(session, account, stockId);
                if (pos.shares() < shares) {
                    return "持仓股数不足";
                }
            }
            return null;
        }

        // 进阶模式: 用成交后的仓位/现金做净值与杠杆约束 (按现价估值)
        Map<Long, BigDecimal> closes = currentCloses(session);
        Map<Long, Integer> byStock = sharesByStock(session, account);
        int delta = direction == TradeTransaction.Direction.BUY ? shares : -shares;
        byStock.merge(stockId, delta, Integer::sum);
        BigDecimal cashAfter = account.getCashBalance()
                .subtract(direction == TradeTransaction.Direction.BUY ? gross : gross.negate())
                .subtract(fee);
        BigDecimal eq = cashAfter;
        BigDecimal ex = BigDecimal.ZERO;
        for (Map.Entry<Long, Integer> e : byStock.entrySet()) {
            BigDecimal close = closes.getOrDefault(e.getKey(), price);
            eq = eq.add(close.multiply(BigDecimal.valueOf(e.getValue())));
            ex = ex.add(close.multiply(BigDecimal.valueOf(Math.abs(e.getValue()))));
        }
        if (eq.signum() <= 0) {
            return "成交后净值将归零, 拒绝交易";
        }
        BigDecimal maxLeverage = BigDecimal.valueOf(props.getMaxLeverage());
        if (ex.compareTo(eq.multiply(maxLeverage)) > 0) {
            return "超出最大杠杆 " + props.getMaxLeverage() + "x 限制";
        }
        return null;
    }

    /** 执行成交 (调用方已完成校验): 扣现金/费用、更新仓位、写交易流水。返回本笔费用。 */
    public BigDecimal execute(GameSession session, Account account, Long stockId,
                              TradeTransaction.Direction direction, BigDecimal price, int shares) {
        Market market = marketData.load(stockId).stock().getMarket();
        BigDecimal gross = price.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, direction, gross);

        BigDecimal cashDelta = direction == TradeTransaction.Direction.BUY
                ? gross.negate() : gross;
        account.setCashBalance(account.getCashBalance().add(cashDelta).subtract(fee));

        PositionMath.Fill cur = position(session, account, stockId);
        writePosition(session, account, stockId,
                PositionMath.apply(cur.shares(), cur.avgCost(), direction, price, shares));

        TradeTransaction tx = new TradeTransaction();
        tx.setSessionId(session.getSessionId());
        tx.setTradeDate(session.getCurrentTradeDate());
        tx.setDirection(direction);
        tx.setPrice(price);
        tx.setShares(shares);
        tx.setFee(fee);
        transactionRepository.save(tx);
        return fee;
    }
}
