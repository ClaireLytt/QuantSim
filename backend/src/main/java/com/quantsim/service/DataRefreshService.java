package com.quantsim.service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.quantsim.config.RefreshProperties;

import lombok.RequiredArgsConstructor;

/**
 * 行情自动更新: 按 cron 调用数据管道 (fetch --incremental -> indicators -> predict -> load),
 * 成功后清空行情缓存, 玩家下一局即可用到最新数据。默认关闭 (quantsim.refresh.enabled=false),
 * 手动跑管道的路径完全不受影响。
 */
@Service
@RequiredArgsConstructor
public class DataRefreshService {

    private static final Logger log = LoggerFactory.getLogger(DataRefreshService.class);

    private final RefreshProperties props;
    private final CacheManager cacheManager;

    @Scheduled(cron = "${quantsim.refresh.cron:0 30 2 * * *}", zone = "Asia/Shanghai")
    public void scheduledRefresh() {
        if (!props.isEnabled()) {
            return;
        }
        refreshNow();
    }

    /** 同步执行一次管道刷新, 返回是否成功 (供测试与手动触发)。 */
    public boolean refreshNow() {
        log.info("[refresh] 开始执行数据管道: {} (workdir={})", props.getCommand(), props.getWorkdir());
        try {
            ProcessBuilder pb = new ProcessBuilder(props.getCommand().split("\\s+"));
            pb.directory(new File(props.getWorkdir()));
            pb.redirectErrorStream(true);
            Process process = pb.start();
            // 输出在独立线程消费: 否则挂死的管道会堵在 readLine 上, 超时永远轮不到,
            // 还会卡死 Spring 默认单线程的调度器
            Thread pump = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        log.info("[refresh] {}", line);
                    }
                } catch (Exception e) {
                    // 进程被终止时流关闭属正常
                }
            }, "refresh-output");
            pump.setDaemon(true);
            pump.start();
            if (!process.waitFor(props.getTimeoutMinutes(), TimeUnit.MINUTES)) {
                process.destroyForcibly();
                log.error("[refresh] 管道执行超时 ({} 分钟), 已终止", props.getTimeoutMinutes());
                return false;
            }
            pump.join(TimeUnit.SECONDS.toMillis(5));
            if (process.exitValue() != 0) {
                log.error("[refresh] 管道退出码 {}", process.exitValue());
                return false;
            }
            // 数据已更新: 清空行情缓存, 后续请求重新读库
            var stockData = cacheManager.getCache("stockData");
            if (stockData != null) {
                stockData.clear();
            }
            var news = cacheManager.getCache("newsByDate");
            if (news != null) {
                news.clear();
            }
            log.info("[refresh] 管道执行成功, 行情缓存已刷新");
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("[refresh] 管道执行被中断");
            return false;
        } catch (Exception e) {
            log.error("[refresh] 管道执行失败: {}", e.getMessage());
            return false;
        }
    }
}
