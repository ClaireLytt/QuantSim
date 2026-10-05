// 战绩分享卡: 结算后用 canvas 生成 1080×1350 图片, 支持下载与复制。
// 依赖 $ / t / state / cssVar / stockName / fmtPct / toast。

(() => {
  const W = 1080;
  const H = 1350;

  function drawCard() {
    const settle = state.lastSettle;
    if (!settle) return null;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const dark = document.documentElement.dataset.theme !== "light";
    // 与 style.css 的 iOS 系主题 token 同值 (canvas 不吃 CSS 级联, 只能镜像一份)
    const bg = dark ? "#000000" : "#f2f2f7";
    const panel = dark ? "#1c1c1e" : "#ffffff";
    const text = dark ? "#f5f5f7" : "#1d1d1f";
    const muted = dark ? "#a1a1aa" : "#6e6e73";
    const up = cssVar("--up") || "#e05260";
    const down = cssVar("--down") || "#2fae8f";
    const accent = cssVar("--accent") || "#4f8cff";

    // 背景与卡片
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = panel;
    roundRect(ctx, 40, 40, W - 80, H - 80, 32);
    ctx.fill();

    // 标题
    ctx.fillStyle = accent;
    ctx.font = "bold 56px 'Microsoft YaHei', sans-serif";
    ctx.fillText(t("share.card.title"), 90, 150);
    ctx.fillStyle = muted;
    ctx.font = "32px 'Microsoft YaHei', sans-serif";
    const stockLine = `${stockName(state.stockName, state.stockCode)} (${state.stockCode})`;
    ctx.fillText(t("share.card.days", stockLine), 90, 210);

    // 大数字收益率
    const rate = Number(settle.returnRate);
    ctx.fillStyle = rate >= 0 ? up : down;
    ctx.font = "bold 150px 'Microsoft YaHei', sans-serif";
    ctx.fillText(fmtPct(rate), 90, 400);
    ctx.fillStyle = muted;
    ctx.font = "34px 'Microsoft YaHei', sans-serif";
    ctx.fillText(t("share.card.return"), 92, 455);

    // 收盘价折线 (揭示区间)
    drawSpark(ctx, 90, 510, W - 180, 330, dark, rate >= 0 ? up : down, muted);

    // 四方对比
    const cmp = [
      [t("cmp.you"), settle.returnRate],
      [t("cmp.ai"), settle.aiReturnRate],
      [t("cmp.hold"), settle.holdReturnRate],
      [t("cmp.ma"), settle.maCrossReturnRate],
    ];
    let y = 950;
    ctx.font = "36px 'Microsoft YaHei', sans-serif";
    cmp.forEach(([label, v]) => {
      ctx.fillStyle = text;
      ctx.fillText(label, 90, y);
      if (v == null) {
        ctx.fillStyle = muted;
        ctx.fillText("--", W - 350, y);
      } else {
        const val = Number(v);
        ctx.fillStyle = val >= 0 ? up : down;
        ctx.fillText(fmtPct(val), W - 350, y);
      }
      y += 62;
    });

    // 是否赢过 AI + 风格标签
    ctx.font = "bold 40px 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = accent;
    let verdict = "";
    if (settle.aiReturnRate != null) {
      verdict = Number(settle.returnRate) >= Number(settle.aiReturnRate)
        ? t("share.card.beatAi") : t("share.card.loseAi");
    }
    const style = settle.styleTag ? t("style." + settle.styleTag) : "";
    ctx.fillText([verdict, style].filter(Boolean).join(" · "), 90, 1250);

    // 页脚
    ctx.fillStyle = muted;
    ctx.font = "28px 'Microsoft YaHei', sans-serif";
    ctx.fillText(t("share.card.foot"), 90, 1290);
    return canvas;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 起始日到结算日的收盘价折线。 */
  function drawSpark(ctx, x, y, w, h, dark, color, muted) {
    const startIdx = state.klines.findIndex((k) => k.tradeDate === state.startDate);
    const ks = startIdx >= 0 ? state.klines.slice(startIdx) : state.klines;
    if (ks.length < 2) return;
    const closes = ks.map((k) => Number(k.close));
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    ctx.strokeStyle = dark ? "#38383a" : "#d9d9de";
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    closes.forEach((c, i) => {
      const px = x + (i / (closes.length - 1)) * w;
      const py = y + h - ((c - min) / span) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
    // 买卖点
    state.trades.forEach((tr) => {
      const i = tr.idx - (startIdx >= 0 ? startIdx : 0);
      if (i < 0 || i >= closes.length) return;
      const px = x + (i / (closes.length - 1)) * w;
      const py = y + h - ((closes[i] - min) / span) * h;
      ctx.fillStyle = tr.dir === "BUY" ? cssVar("--up") : cssVar("--down");
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = muted;
  }

  async function share() {
    const canvas = drawCard();
    if (!canvas) return;
    // 优先复制到剪贴板, 不支持时退回下载
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast(t("share.copied"));
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `quantsim-${state.stockCode}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast(t("share.copyFail"));
    }
  }

  $("btn-sharecard").addEventListener("click", share);
  document.addEventListener("qs:settled", () => {
    $("btn-sharecard").hidden = false;
  });
})();
