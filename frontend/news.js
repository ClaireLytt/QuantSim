// 市场快讯: tick 揭示的历史事件横幅 (不显示日历日期, 防剧透)。依赖 $ / t / LANG。

(() => {
  function show(newsList, dayNo) {
    const banner = $("news-banner");
    if (!newsList || !newsList.length) return;
    const item = newsList[0]; // 同日多条取最重要的一条展示, 其余略
    const title = LANG === "en" ? item.titleEn : item.titleZh;
    const body = (LANG === "en" ? item.bodyEn : item.bodyZh) || "";
    banner.className = "news-banner sev-" + (item.severity || "LOW");
    banner.innerHTML = `<span class="news-tag"></span><strong></strong><span class="news-body"></span>`;
    // 新闻语义层 (联动设计 1/2/4): 传闻/方向/预期消化度/所属腿 标签
    const tags = [];
    if (item.sourceTier === "RUMOR") tags.push(t("news.rumor"));
    if (item.direction > 0) tags.push(t("news.bull"));
    else if (item.direction < 0) tags.push(t("news.bear"));
    if (item.expectation != null && Number(item.expectation) >= 0.7) tags.push(t("news.pricedIn"));
    if (item.stockCode) tags.push(item.stockCode);
    banner.querySelector(".news-tag").textContent = `📰 ${t("news.title")} · ${t("news.day", dayNo)}`
      + (tags.length ? " · " + tags.join(" · ") : "");
    banner.querySelector("strong").textContent = title;
    banner.querySelector(".news-body").textContent = body;
    banner.hidden = false;
    banner._last = { newsList, dayNo };
  }

  window.qsShowNews = show;

  document.addEventListener("qs:lang", () => {
    const banner = $("news-banner");
    if (!banner.hidden && banner._last) show(banner._last.newsList, banner._last.dayNo);
  });
})();
