// 极简 Service Worker: 只为满足 PWA 可安装条件, 全部请求网络优先直通,
// 不做离线缓存 (API 是动态数据, HTML 已有 no-cache 策略, 缓存只会帮倒忙)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* 直通网络, 不拦截 */ });
