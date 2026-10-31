package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.quantsim.dto.GameDtos.NewsItem;
import com.quantsim.service.MarketDataService.StockData;

/**
 * 财报子系统 (联动设计 7-10): 行情是真实历史、价格不可被事件改变, 财报层因此是
 * "解释层"——财报日取每个季月 (1/4/7/10) 的第 10 个交易日; 超预期幅度、市场预期
 * 消化度与指引口吻全部由该日前后的真实走势确定性反推, 保证叙事与 K 线永远自洽:
 *   卖事实 (#8): 财报前 20 日涨幅 ≥8% 且发布后 3 日下跌 → 标为"超预期但高预期";
 *   指引救场 (#9): 3 日下跌但 5 日收复 → miss + 乐观指引;
 * 纯函数无存储, 盲局不提供 (与新闻同一防剧透口径, 调用方把关)。
 */
@Service
public class EarningsService {

    private static final int PRE_WINDOW = 20;   // 预期消化度的回看窗
    private static final int POST_SHORT = 3;    // 市场即时反应窗
    private static final int POST_LONG = 5;     // 指引验证窗
    private static final double HOT_RUNUP = 0.08;

    public record Earnings(LocalDate date, BigDecimal epsSurprise, BigDecimal expectation,
                           String guidanceTone, String explainKey) {}

    /** #7 财报日历: 窗口内的财报日 (只给日期不给内容)。 */
    public List<LocalDate> daysIn(StockData sd, int startIdx, int endIdx) {
        List<LocalDate> out = new ArrayList<>();
        for (int i = Math.max(startIdx, PRE_WINDOW); i <= endIdx; i++) {
            if (isReportIdx(sd, i) && i + POST_LONG < sd.prices().size()) {
                out.add(sd.prices().get(i).getTradeDate());
            }
        }
        return out;
    }

    /** 财报揭晓: date 非财报日或前后数据不足时为空。 */
    public Optional<Earnings> on(StockData sd, LocalDate date) {
        Integer i = sd.indexOf(date);
        if (i == null || i < PRE_WINDOW || i + POST_LONG >= sd.prices().size() || !isReportIdx(sd, i)) {
            return Optional.empty();
        }
        double pre = ratio(sd, i - PRE_WINDOW, i);
        double post3 = ratio(sd, i, i + POST_SHORT);
        double post5 = ratio(sd, i, i + POST_LONG);
        BigDecimal expectation = BigDecimal.valueOf(Math.max(0, Math.min(1, 0.5 + pre * 2)))
                .setScale(2, RoundingMode.HALF_UP);
        double surprise;
        String explain;
        if (post3 >= 0) {
            surprise = 0.05 + Math.min(0.10, Math.abs(post3));
            explain = "beat";
        } else if (pre >= HOT_RUNUP) {
            surprise = 0.08; // 卖事实: 业绩超预期, 但涨幅已提前兑现 (#8)
            explain = "priced_in";
        } else {
            surprise = -(0.05 + Math.min(0.10, Math.abs(post3)));
            explain = "miss";
        }
        String guidance = "INLINE";
        if (post3 < 0 && post5 > post3) {
            guidance = "UPBEAT"; // 指引救场 (#9)
            if ("miss".equals(explain)) {
                explain = "guidance_saved";
            }
        } else if (post3 > 0 && post5 < post3) {
            guidance = "CAUTIOUS";
        }
        return Optional.of(new Earnings(date,
                BigDecimal.valueOf(surprise).setScale(4, RoundingMode.HALF_UP),
                expectation, guidance, explain));
    }

    /** 揭晓文案打包成 NewsItem (双语服务端拼好), 走既有新闻横幅/复盘通道。 */
    public NewsItem toNews(Earnings e) {
        String pct = e.epsSurprise().multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP).toPlainString() + "%";
        boolean beat = e.epsSurprise().signum() >= 0;
        String zh = "财报发布：业绩" + (beat ? "超预期 " : "不及预期 ") + pct
                + ("UPBEAT".equals(e.guidanceTone()) ? "，但管理层给出乐观指引"
                        : "CAUTIOUS".equals(e.guidanceTone()) ? "，且指引偏谨慎" : "");
        String en = "Earnings: " + (beat ? "beat by " : "missed by ") + pct
                + ("UPBEAT".equals(e.guidanceTone()) ? ", with upbeat guidance"
                        : "CAUTIOUS".equals(e.guidanceTone()) ? ", with cautious guidance" : "");
        String bodyZh = switch (e.explainKey()) {
            case "priced_in" -> "超预期的数字遇上超前的涨幅——市场买的是预期，卖的是事实。";
            case "guidance_saved" -> "数字难看，但指引把下跌接住了：市场信了后面的故事。";
            case "beat" -> "业绩兑现，市场顺势定价。";
            default -> "不及预期，市场用脚投票。";
        };
        String bodyEn = switch (e.explainKey()) {
            case "priced_in" -> "A beat that met a bigger run-up - the market bought the rumor, sold the fact.";
            case "guidance_saved" -> "Ugly numbers, but guidance caught the knife: the market bought the story.";
            case "beat" -> "Delivered as promised; the market priced it in stride.";
            default -> "A miss, and the market voted with its feet.";
        };
        return new NewsItem("HIGH", zh, en, bodyZh, bodyEn,
                beat ? 1 : -1, e.expectation(), "OFFICIAL", null);
    }

    /** 季月 (1/4/7/10) 的第 10 个交易日 = 财报日。 */
    private static boolean isReportIdx(StockData sd, int i) {
        LocalDate d = sd.prices().get(i).getTradeDate();
        int m = d.getMonthValue();
        if (m != 1 && m != 4 && m != 7 && m != 10) {
            return false;
        }
        int nth = 0;
        for (int j = i; j >= 0; j--) {
            LocalDate dj = sd.prices().get(j).getTradeDate();
            if (dj.getYear() != d.getYear() || dj.getMonthValue() != m) {
                break;
            }
            nth++;
        }
        return nth == 10;
    }

    private static double ratio(StockData sd, int from, int to) {
        double base = sd.prices().get(from).getClose().doubleValue();
        return base <= 0 ? 0 : sd.prices().get(to).getClose().doubleValue() / base - 1;
    }
}
