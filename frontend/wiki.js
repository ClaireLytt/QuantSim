// 量化知识库: 学堂的"课本"——左侧分类目录, 右侧图文文章卡 (配迷你示意图),
// 每篇底部联动「去研究所验证」与「打开对应小游戏」, 把知识点闭环到动手实验。
// 依赖 app.js 的 $ / switchView / cssVar, lab.js 的 openLabBlock, i18n 的 t / pick。
(() => {
  // 分类与文章 (内联双语, 同 BADGES/CASES 惯例)。chart: 迷你示意图类型。
  // lab: {block} 跳研究所并展开对应实验 / {view} 直接切视图; game: 对应小游戏视图。
  const CATS = [
    {
      id: "kline",
      name: { zh: "K 线基础", en: "Candlestick Basics" },
      articles: [
        {
          id: "k4price",
          title: { zh: "一根 K 线的四个价格", en: "The four prices inside one candle" },
          chart: "candle",
          body: [
            { zh: "一根 K 线浓缩了一天的战争：开盘价是起点，收盘价是终点，最高价和最低价是双方打出的边界。实体越长，说明当天多空分歧越被一边碾压；上下影线越长，说明盘中有人试探过更远的价格又被打了回来。", en: "One candle compresses a day of battle: open is the start, close is the end, high and low mark how far each side pushed. A long body means one side steamrolled the day; long wicks mean someone probed further and got pushed back." },
            { zh: "本站约定「涨红跌绿」：红色空心代表收盘高于开盘，绿色实心代表收盘更低。先学会只看一根 K 线讲出当天的故事，再去连起来看趋势。", en: "This site uses red-up / green-down: hollow red closes above the open, solid green below. Learn to narrate one candle first - then chain them into a trend." },
          ],
          lab: { block: "lab-b-compare" },
          game: "guess",
        },
        {
          id: "volume",
          title: { zh: "成交量：涨跌的「底气」", en: "Volume: the conviction behind a move" },
          chart: "volume",
          body: [
            { zh: "价格会骗人，成交量不会：放量上涨说明真金白银在追，缩量上涨则可能只是没人卖。同样一根大阳线，有量和没量是两种完全不同的故事。", en: "Price can lie; volume rarely does. A rally on heavy volume means real money is chasing; the same candle on thin volume may just mean nobody sold." },
            { zh: "经典口诀「量在价先」——趋势反转往往先在成交量上露出马脚。盯盘时让眼睛习惯先扫一眼量柱。", en: "'Volume leads price' - reversals often tip their hand in volume first. Train your eye to scan the volume bars before the candles." },
          ],
          lab: { block: "lab-b-overview" },
          game: "tape",
        },
      ],
    },
    {
      id: "indicator",
      name: { zh: "技术指标", en: "Technical Indicators" },
      articles: [
        {
          id: "macross",
          title: { zh: "均线与金叉死叉", en: "Moving averages and the crosses" },
          chart: "macross",
          body: [
            { zh: "MA5 是最近 5 天收盘价的平均，反应快；MA20 反应慢。快线上穿慢线叫「金叉」，常被解读为趋势转多；下穿叫「死叉」。", en: "MA5 averages the last five closes and reacts fast; MA20 is the slow line. The fast line crossing above the slow one is a 'golden cross' - often read as a turn bullish; crossing below is the 'death cross'." },
            { zh: "但金叉不是圣杯：本站全样本统计里金叉后 5 日胜率只有五成多，且牛市里灵、震荡市里反复打脸。把它当「注意力信号」，别当「下单按钮」。", en: "The cross is no holy grail: across our full sample it wins only ~54% of the time, works in bulls and whipsaws in ranges. Treat it as an attention signal, not a buy button." },
          ],
          lab: { block: "lab-b-signal" },
          game: "stratbox",
        },
        {
          id: "rsimacd",
          title: { zh: "RSI 与 MACD：超买超卖和动能", en: "RSI & MACD: overbought, oversold, momentum" },
          chart: "rsi",
          body: [
            { zh: "RSI 把涨跌力量压缩到 0~100：常用 70 以上叫超买、30 以下叫超卖。MACD 用快慢均线之差描述动能，柱状图由正转负往往伴随动能衰竭。", en: "RSI squeezes momentum into 0-100: above 70 reads overbought, below 30 oversold. MACD measures momentum via the gap between fast and slow EMAs; the histogram flipping sign often marks momentum exhaustion." },
            { zh: "指标都是价格的「二次加工」，天生滞后。对局图表里就内置了 RSI 与 MACD 副图，边玩边观察它们什么时候灵、什么时候钝。", en: "All indicators are derivatives of price and inherently lag. The game chart ships RSI and MACD panes - watch in play when they bite and when they're blunt." },
          ],
          lab: { block: "lab-b-signal" },
          game: "guess",
        },
      ],
    },
    {
      id: "trap",
      name: { zh: "量化陷阱", en: "Quant Traps" },
      articles: [
        {
          id: "cherry",
          title: { zh: "精选区间：任何策略都能画成神话", en: "Cherry-picked windows make any strategy a legend" },
          chart: "cherry",
          body: [
            { zh: "「十年年化 40%」的回测图，十有八九只截了最顺风的那段。把区间拉长到全样本、算上手续费，神话常常缩水成平庸。", en: "Nine of ten '40% annualized' backtests only show the luckiest stretch. Extend to the full sample and add costs, and legends shrink into mediocrity." },
            { zh: "识别方法很简单：看到任何惊艳曲线，先问三个问题——区间谁选的？费用算了吗？换个区间还成立吗？", en: "The defense is simple. For any dazzling curve ask three things: who chose the window? Were costs included? Does it survive a different window?" },
          ],
          lab: { block: "lab-b-signal" },
          game: "qdetect",
        },
        {
          id: "survivor",
          title: { zh: "幸存者偏差：墓地不会发帖", en: "Survivorship bias: the graveyard doesn't post" },
          chart: "survivor",
          body: [
            { zh: "「拿住这十只大牛股就有二十倍」——名单是按结果倒着筛出来的。同期还有几百只明星股退市、腰斩，它们被从故事里剪掉了。", en: "'Hold these ten superstocks for 20x' - the list was screened backwards from the outcome. Hundreds of one-time stars delisted or halved in the same decade, all edited out of the story." },
            { zh: "事前视角才是真实世界：用十年前当时的热门名单买入持有，大概率跑输指数。看到任何「长期必赚」名单，先问它是什么时候写下的。", en: "The ex-ante view is the real world: buy-and-hold the names that were hot ten years ago and you likely trail the index. For any 'guaranteed long-term' list, ask when it was written." },
          ],
          lab: { block: "lab-b-overview" },
          game: "qdetect",
        },
      ],
    },
    {
      id: "backtest",
      name: { zh: "回测知识", en: "Backtesting" },
      articles: [
        {
          id: "holdbase",
          title: { zh: "买入持有：所有策略的及格线", en: "Buy & hold: the passing grade for every strategy" },
          chart: "hold",
          body: [
            { zh: "评价任何策略，第一个问题永远是：它跑赢「什么都不做」了吗？买入持有不花手续费、不犯择时错误，是最难缠的对手。", en: "The first question for any strategy: did it beat doing nothing? Buy & hold pays no fees and makes no timing mistakes - the toughest baseline there is." },
            { zh: "本站所有回测与对局结算都自带买入持有基准线。一个策略若长期跑不赢它，再花哨也只是昂贵的娱乐。", en: "Every backtest and settlement here ships with the buy-and-hold benchmark. A strategy that can't beat it long-term is just expensive entertainment." },
          ],
          lab: { block: "lab-b-timing" },
          game: "buydip",
        },
        {
          id: "overfit",
          title: { zh: "样本内外：调参的照妖镜", en: "In-sample vs out-of-sample: the overfitting mirror" },
          chart: "split",
          body: [
            { zh: "把参数调到历史最优很容易——难的是它在没见过的数据上还灵。把历史切成「样本内调参、样本外验证」，是识破过拟合的最朴素办法。", en: "Tuning parameters to fit history is easy - the hard part is surviving data the model never saw. Splitting history into in-sample tuning and out-of-sample validation is the simplest overfitting test." },
            { zh: "竞技场的「自动调参」会同时给出参数敏感性热力图：最优点孤零零立在悬崖上的，多半是拟合出来的海市蜃楼。", en: "The arena's auto-tune also draws a parameter-sensitivity heatmap: an optimum standing alone on a cliff is usually a fitted mirage." },
          ],
          lab: { view: "arena" },
          game: "stratbox",
        },
      ],
    },
    {
      id: "risk",
      name: { zh: "风险风控", en: "Risk Control" },
      articles: [
        {
          id: "drawdown",
          title: { zh: "最大回撤与夏普：收益的另一半", en: "Drawdown & Sharpe: the other half of returns" },
          chart: "drawdown",
          body: [
            { zh: "「赚多少」只是半句话，完整的问题是「中途最多亏多少、亏多久」。最大回撤 58% 的年化 35%，和回撤 10% 的年化 20%，是两种完全不同的人生。", en: "'How much did it make' is half a sentence. The full question adds 'how deep and how long underwater'. A 35% annualized with 58% drawdowns is a different life from 20% with 10%." },
            { zh: "夏普比率回答「每承担一分风险换到多少收益」。策略擂台的综合评分就是这么算的——收益、夏普、回撤三者一起上秤。", en: "The Sharpe ratio answers 'return earned per unit of risk'. The Strategy Ring's composite score weighs exactly that trio: return, Sharpe, drawdown." },
          ],
          lab: { view: "duel" },
          game: "duel",
        },
        {
          id: "stoploss",
          title: { zh: "止损与仓位：活下来的两只手", en: "Stops and sizing: the two hands that keep you alive" },
          chart: "stop",
          body: [
            { zh: "止损单的意义不是预测，而是提前锁定「最多亏多少」；仓位决定同样的判断错误会伤到皮肉还是伤到骨头。两者都是在行情发生之前做的决定。", en: "A stop-loss doesn't predict - it pre-commits your maximum loss. Position size decides whether the same mistake bruises you or breaks you. Both are decisions made before the market moves." },
            { zh: "名场面里的地狱关卡都带「回撤红线」，就是逼你练这两只手：先想清楚退路，再谈进攻。", en: "The hell-tier Famous Moments all carry a drawdown red line - precisely to train these two hands: plan the exit before the attack." },
          ],
          lab: { view: "arena" },
          game: "famous",
        },
      ],
    },
  ];

  let curCat = CATS[0].id;
  let curArt = CATS[0].articles[0].id;
  let chart = null;

  const allArticles = () => CATS.flatMap((c) => c.articles.map((a) => ({ ...a, cat: c })));

  // ---------- 迷你示意图: 每篇配一张, 纯本地确定性数据 ----------
  function demoSeries(kind) {
    const n = 40;
    const xs = Array.from({ length: n }, (_, i) => i + 1);
    const wave = (i, p, a, base) => base + a * Math.sin(i / p);
    switch (kind) {
      case "candle": {
        const candles = xs.map((i) => {
          const o = wave(i, 6, 6, 100) + (i % 3) - 1;
          const c = o + ((i * 7) % 5) - 2;
          return [o, c, Math.min(o, c) - 2, Math.max(o, c) + 2];
        });
        return { type: "candlestick", data: candles };
      }
      case "volume":
        return { type: "bar", data: xs.map((i) => 40 + 30 * Math.abs(Math.sin(i / 5)) + (i > 28 ? 50 : 0)) };
      case "macross":
        return [
          { type: "line", name: "MA5", data: xs.map((i) => wave(i, 5, 8, 100)) },
          { type: "line", name: "MA20", data: xs.map((i) => wave(i, 14, 5, 100)) },
        ];
      case "rsi":
        return { type: "line", data: xs.map((i) => 50 + 28 * Math.sin(i / 4.5)), yMinMax: [0, 100], refs: [30, 70] };
      case "cherry":
        return { type: "line", data: xs.map((i) => (i < 22 ? 100 * Math.pow(1.03, i) : 100 * Math.pow(1.03, 22) * Math.pow(0.985, i - 22))) };
      case "survivor":
        return [
          { type: "line", name: "list", data: xs.map((i) => 100 * Math.pow(1.055, i / 2)) },
          { type: "line", name: "real", data: xs.map((i) => wave(i, 9, 6, 104) + i * 0.3) },
        ];
      case "hold":
        return [
          { type: "line", name: "strat", data: xs.map((i) => wave(i, 7, 9, 104) + i * 0.4) },
          { type: "line", name: "hold", data: xs.map((i) => 100 + i * 0.8) },
        ];
      case "split":
        return { type: "line", data: xs.map((i) => (i < 24 ? 100 + i * 2 : 148 - (i - 24) * 1.2)), splitAt: 24 };
      case "drawdown":
        return { type: "line", data: xs.map((i) => (i < 15 ? 100 + i * 3 : i < 26 ? 145 - (i - 15) * 5.5 : 85 + (i - 26) * 4)) };
      case "stop":
        return { type: "line", data: xs.map((i) => (i < 18 ? wave(i, 6, 4, 100) : 100 - (i - 18) * 2.2)), refs: [92], refAxis: "y" };
      default:
        return null;
    }
  }

  function renderChart(kind) {
    const box = $("wiki-chart");
    const spec = demoSeries(kind);
    box.hidden = !spec;
    if (!spec) return;
    if (!chart) chart = echarts.init(box);
    const specs = Array.isArray(spec) ? spec : [spec];
    const colors = [cssVar("--lab-blue"), cssVar("--text-muted"), cssVar("--up")];
    const series = specs.map((s, i) => ({
      type: s.type,
      data: s.data,
      showSymbol: false,
      smooth: s.type === "line",
      barWidth: "55%",
      itemStyle: s.type === "candlestick"
        ? { color: "transparent", color0: cssVar("--down"), borderColor: cssVar("--up"), borderColor0: cssVar("--down") }
        : { color: colors[i % colors.length], opacity: s.type === "bar" ? 0.6 : 1 },
      lineStyle: s.type === "line" ? { width: 2, color: colors[i % colors.length], type: i === 1 ? "dashed" : "solid" } : undefined,
      markLine: specs[0].refs ? {
        silent: true, symbol: "none", label: { show: false },
        lineStyle: { type: "dotted", color: cssVar("--warn") },
        data: specs[0].refs.map((v) => ({ yAxis: v })),
      } : (specs[0].splitAt ? {
        silent: true, symbol: "none",
        label: { show: false },
        lineStyle: { type: "dashed", color: cssVar("--warn") },
        data: [{ xAxis: specs[0].splitAt }],
      } : undefined),
    }));
    chart.setOption({
      animation: false,
      grid: { left: 40, right: 10, top: 10, bottom: 20 },
      xAxis: { type: "category", data: Array.from({ length: 40 }, (_, i) => i + 1), axisLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { show: false } },
      yAxis: {
        scale: true,
        min: specs[0].yMinMax ? specs[0].yMinMax[0] : undefined,
        max: specs[0].yMinMax ? specs[0].yMinMax[1] : undefined,
        splitLine: { lineStyle: { color: cssVar("--border"), opacity: 0.4 } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      series,
    }, true);
    chart.resize();
  }

  // ---------- 渲染: 目录 / 文章列表 / 文章卡 ----------
  function renderCats() {
    const ul = $("wiki-cats");
    ul.innerHTML = "";
    CATS.forEach((c) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "wiki-cat" + (c.id === curCat ? " active" : "");
      btn.textContent = pick(c.name);
      btn.addEventListener("click", () => {
        curCat = c.id;
        curArt = c.articles[0].id;
        $("wiki-search").value = "";
        renderAll();
      });
      li.appendChild(btn);
      ul.appendChild(li);
      if (c.id === curCat) {
        c.articles.forEach((a) => {
          const li2 = document.createElement("li");
          const b2 = document.createElement("button");
          b2.className = "wiki-item" + (a.id === curArt ? " active" : "");
          b2.textContent = pick(a.title);
          b2.addEventListener("click", () => {
            curArt = a.id;
            renderAll();
          });
          li2.appendChild(b2);
          ul.appendChild(li2);
        });
      }
    });
  }

  function currentArticle() {
    return allArticles().find((a) => a.id === curArt) || allArticles()[0];
  }

  function renderArticle() {
    const a = currentArticle();
    $("wiki-title").textContent = pick(a.title);
    $("wiki-cat-tag").textContent = pick(a.cat.name);
    const bodyBox = $("wiki-body");
    bodyBox.innerHTML = "";
    a.body.forEach((p) => {
      const el = document.createElement("p");
      el.textContent = pick(p);
      bodyBox.appendChild(el);
    });
    renderChart(a.chart);
  }

  function renderAll() {
    renderCats();
    renderArticle();
  }

  // ---------- 搜索: 标题+正文全文匹配, 命中即跳转该篇 ----------
  function doSearch() {
    const q = $("wiki-search").value.trim().toLowerCase();
    if (!q) return;
    const hit = allArticles().find((a) =>
      pick(a.title).toLowerCase().includes(q)
      || a.body.some((p) => pick(p).toLowerCase().includes(q)));
    if (hit) {
      curCat = hit.cat.id;
      curArt = hit.id;
      renderAll();
    } else {
      toast(t("wiki.noHit"));
    }
  }
  $("wiki-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
  $("btn-wiki-search").addEventListener("click", doSearch);

  // ---------- 联动: 去研究所验证 / 打开小游戏 ----------
  $("btn-wiki-lab").addEventListener("click", () => {
    const a = currentArticle();
    if (a.lab.block) {
      switchView("lab");
      if (typeof openLabBlock === "function") openLabBlock(a.lab.block);
    } else {
      switchView(a.lab.view);
    }
  });
  $("btn-wiki-game").addEventListener("click", () => switchView(currentArticle().game));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "wiki") {
      renderAll();
      if (chart) chart.resize();
    }
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-wiki").hidden) renderAll();
  });
  document.addEventListener("qs:theme", () => {
    if (chart && !$("view-wiki").hidden) renderChart(currentArticle().chart);
  });
  window.addEventListener("resize", () => {
    if (chart) chart.resize();
  });
  renderAll();
})();
