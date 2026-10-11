// 剧本杀案件数据 (纯数据, 零逻辑): CASES 全部市场悬案剧本。
// 被 academy.js 的办案引擎消费; 必须在 academy.js 之前加载。
// 新增案件只改本文件, 结构约定: roles/intro/suspects(dialog+clue)/finale/culprit/win/lose。

// ---------- 剧本杀: 市场悬案 ----------

const CASES = [
  {
    id: "flashcrash",
    title: { zh: "第一案 · 闪崩疑云", en: "Case 1 · The Flash Crash" },
    desc: { zh: "龙腾科技 30 分钟暴跌 30%，四个嫌疑人各执一词——谁点的火？", en: "Longteng Tech lost 30% in 30 minutes. Four suspects, four stories — who lit the fuse?" },
    award: { zh: "金牌侦探", en: "Ace Detective" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      zhang: { name: { zh: "张小散", en: "Retail Zhang" }, color: "--ma5" },
      wang: { name: { zh: "王总", en: "Boss Wang" }, color: "--up" },
      li: { name: { zh: "李研究", en: "Analyst Li" }, color: "--down" },
      zhao: { name: { zh: "赵主播", en: "Streamer Zhao" }, color: "--ma20" },
    },
    intro: [
      { who: "k", text: { zh: "龙腾科技今天上午突然闪崩，30 分钟暴跌 30%，几万散户被闷在里面。", en: "Longteng Tech flash-crashed this morning — down 30% in half an hour, tens of thousands of retail traders trapped inside." } },
      { who: "k", text: { zh: "交易所调了四个人来问话——每个人都有嫌疑，每个人都说自己冤枉。", en: "The exchange pulled in four people for questioning. Everyone's a suspect, and everyone swears they're innocent." } },
      { who: "k", text: { zh: "把他们挨个问一遍，收集线索，然后告诉我：这场闪崩，是谁点的火。", en: "Question them all, gather the clues, then tell me: who lit the fuse?" } },
    ],
    suspects: [
      {
        id: "zhang",
        dialog: [
          { who: "zhang", text: { zh: "跟我没关系啊！我就 5 万块钱，全仓套在里面了！", en: "It wasn't me! I had 50 grand — all-in, and now it's buried!" } },
          { who: "zhang", text: { zh: "早上我看赵主播直播说「今天必有大事」，我还加仓了……结果十点就崩了。", en: "Streamer Zhao said 'something big today' on the morning stream, so I even added more... then it collapsed at ten." } },
        ],
        clue: { zh: "张小散只有 5 万本金，砸不出这种跌幅；但他提到赵主播盘前喊过「必有大事」。", en: "Zhang's 50k can't move a stock like that — but he says Zhao teased 'something big' before the open." },
      },
      {
        id: "wang",
        dialog: [
          { who: "wang", text: { zh: "我们王氏资本一股都没卖！去查我的交易记录啊！", en: "Wang Capital didn't sell a single share! Go check my trading records!" } },
          { who: "wang", text: { zh: "……质押的事你们也知道了？那是正常融资！跌破平仓线是券商强平的，不是我卖的！", en: "...You know about the pledge too? That was normal financing! When the price broke the liquidation line, the BROKER force-sold — not me!" } },
        ],
        clue: { zh: "王总把大量持股质押给券商换钱。跌破平仓线后券商会自动强制卖出——他「没卖」，但他的仓位在自己砸盘。", en: "Boss Wang pledged a huge block of shares for loans. Below the liquidation line the broker auto-sells — he 'didn't sell', but his position was dumping itself." },
      },
      {
        id: "li",
        dialog: [
          { who: "li", text: { zh: "我昨晚把龙腾的评级从「买入」下调到「中性」，报告凌晨发的，合规流程齐全。", en: "I downgraded Longteng from Buy to Neutral last night. The report went out pre-dawn, full compliance." } },
          { who: "li", text: { zh: "下调理由写得清清楚楚：大股东质押比例 78%，随时可能被强平。我只是提示风险。", en: "The reason is written plainly: the major shareholder has 78% of his stake pledged — forced liquidation could hit any time. I merely flagged the risk." } },
        ],
        clue: { zh: "李研究的报告揭了盖子：大股东质押率 78%。报告本身合法，但它成了导火索。", en: "Li's report lifted the lid: 78% of the major stake was pledged. The report was legal — but it was the spark." },
      },
      {
        id: "zhao",
        dialog: [
          { who: "zhao", text: { zh: "我喊「今天必有大事」怎么了？我天天都这么喊，节目效果嘛！", en: "So what if I said 'something big today'? I say that every day — it's called showbiz!" } },
          { who: "zhao", text: { zh: "再说我盘前就清仓了龙腾……咳，我是说，我风控意识强。", en: "Besides, I dumped my Longteng before the open... ahem, I mean, I have strong risk discipline." } },
        ],
        clue: { zh: "赵主播盘前清仓了自己的龙腾持股，还引导粉丝「关注大事」——他提前知道报告的事？", en: "Zhao cleared his own Longteng position before the open and steered fans toward 'big news' — did he know about the report in advance?" },
      },
    ],
    finale: [
      { who: "k", text: { zh: "线索齐了。报告是导火索，喊单是助燃剂，质押盘是炸药——但把下跌变成雪崩的，只有一个人。", en: "All clues are in. The report was the spark, the stream was the accelerant, the pledged shares were the dynamite — but only one person turned a dip into an avalanche." } },
      { who: "k", text: { zh: "记住：闪崩要问的不是「谁卖得多」，而是「谁的卖单停不下来」。指认吧。", en: "Remember: a flash crash isn't about who sold the most. It's about whose selling CANNOT STOP. Make the call." } },
    ],
    culprit: "wang",
    win: [
      { who: "k", text: { zh: "没错。报告点破质押风险，开盘抛压击穿平仓线，券商开始强平王总的质押股——强平砸出更低的价格，更低的价格触发更多强平。", en: "Correct. The report exposed the pledge risk, the opening sell-off broke the liquidation line, and the broker began force-selling Boss Wang's pledged shares — each forced sale pushed the price lower, triggering more forced sales." } },
      { who: "k", text: { zh: "这就是「质押爆仓螺旋」。真凶不是某一笔卖单，而是那台停不下来的自动清算机器——机器的主人，是王总。", en: "That's the pledge liquidation spiral. The culprit isn't any single sell order — it's the automatic selling machine that can't stop. And the machine belonged to Boss Wang." } },
      { who: "k", text: { zh: "至于赵主播提前清仓？内幕交易的事，监管会请他喝茶的。", en: "As for Zhao's early exit? The regulator will be inviting him to tea about insider trading." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。再想想：谁的卖单是「停不下来」的？回去把每个人的话再读一遍。", en: "Wrong. Think again: whose selling was IMPOSSIBLE to stop? Go back and reread what everyone said." } },
    ],
  },
  {
    id: "insider",
    title: { zh: "第二案 · 消失的内幕", en: "Case 2 · The Leaked Deal" },
    desc: { zh: "停牌前三天股价先涨了 20%——并购消息是谁漏出去的？", en: "The stock ran 20% in the three days before the halt. Who leaked the merger?" },
    award: { zh: "内幕猎手", en: "Insider Hunter" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      zhou: { name: { zh: "周董秘", en: "Secretary Zhou" }, color: "--down" },
      lin: { name: { zh: "小林", en: "Intern Lin" }, color: "--ma5" },
      liu: { name: { zh: "刘大户", en: "Whale Liu" }, color: "--up" },
      gao: { name: { zh: "高经理", en: "Manager Gao" }, color: "--ma20" },
    },
    intro: [
      { who: "k", text: { zh: "恒宇集团停牌前三天，股价莫名其妙涨了 20%，成交量翻了五倍。", en: "Three days before Hengyu Group's trading halt, the stock inexplicably rose 20% on five times the volume." } },
      { who: "k", text: { zh: "复牌公告一出——重大并购。监管的问题很简单：消息是谁提前漏出去的？", en: "Then the announcement dropped — a major merger. The regulator's question is simple: who leaked it early?" } },
      { who: "k", text: { zh: "四个人，每个人都碰过那份并购文件的边。开始问吧。", en: "Four people, and every one of them touched the edge of that merger file. Start asking." } },
    ],
    suspects: [
      {
        id: "zhou",
        dialog: [
          { who: "zhou", text: { zh: "并购文件全程加密，接触名单上只有七个人。我的嘴，比保险柜还严。", en: "The merger file was encrypted end to end — only seven people on the access list. My lips are tighter than a vault." } },
          { who: "zhou", text: { zh: "不过……上周五投行来核数据，带了个实习生，文件在会议室摊了一下午。", en: "Although... last Friday the investment bank came to verify numbers. They brought an intern, and the file lay open in the meeting room all afternoon." } },
        ],
        clue: { zh: "接触名单只有 7 人，但上周五文件在会议室敞开了一下午，在场还有个投行实习生。", en: "Only 7 people on the access list — but the file lay open all Friday afternoon, with a bank intern in the room." },
      },
      {
        id: "lin",
        dialog: [
          { who: "lin", text: { zh: "我就……发了条朋友圈，配图是恒宇楼下，文案是「见证历史的一周」……定位忘了关。", en: "I just... made one social post. A photo outside Hengyu HQ, caption 'a week that makes history'... and I forgot to turn off the geotag." } },
          { who: "lin", text: { zh: "然后我舅问我在忙什么大项目，我什么都没说！我就回了句「你懂的」。", en: "Then my uncle asked what big project I was on. I said NOTHING! I just replied 'you know what I mean'." } },
        ],
        clue: { zh: "小林的朋友圈定位暴露了投行驻场，还给舅舅回了句「你懂的」——他舅舅是谁？", en: "Lin's geotag exposed the bank's presence at Hengyu, and he told his uncle 'you know what I mean' — who is this uncle?" },
      },
      {
        id: "liu",
        dialog: [
          { who: "liu", text: { zh: "我做了二十年价值投资，看量价就知道有事，不需要谁给我递消息。", en: "Twenty years of value investing — I read volume and price. I don't need anyone feeding me tips." } },
          { who: "liu", text: { zh: "小林是我外甥怎么了？我们家饭桌上从不聊股票！那 8000 万是我自己的判断！", en: "So what if Lin is my nephew? We never talk stocks at dinner! That 80 million position was my own judgment!" } },
        ],
        clue: { zh: "刘大户是小林的舅舅，停牌前三天重仓买入 8000 万——他说「从不聊股票」。", en: "Whale Liu is Lin's uncle — and he piled 80 million into Hengyu three days before the halt. He says they 'never talk stocks'." },
      },
      {
        id: "gao",
        dialog: [
          { who: "gao", text: { zh: "我们基金停牌前确实加了恒宇，但那是季度调仓，投决会流程完备，纪要都能调出来。", en: "Yes, our fund added Hengyu before the halt — quarterly rebalancing, full committee process, minutes on file." } },
          { who: "gao", text: { zh: "加了多少？总仓位的 2% 而已，研究报告几个月前就覆盖这只票了。", en: "How much? Just 2% of the book. Our research had covered the name for months." } },
        ],
        clue: { zh: "高经理只加仓 2%，且有投决会纪要背书——更像正常调仓。", en: "Manager Gao's add was only 2%, backed by committee minutes — looks like routine rebalancing." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "链条拼齐了：敞开的文件、暴露的定位、一句「你懂的」、停牌前的 8000 万。", en: "The chain is complete: an open file, a geotag, one 'you know what I mean', and 80 million placed before the halt." } },
      { who: "k", text: { zh: "内幕交易的认定只有两条：知悉消息，利用消息交易。谁两条全占？指认吧。", en: "Insider trading needs exactly two things: knowing the information, and trading on it. Who checks both boxes? Make the call." } },
    ],
    culprit: "liu",
    win: [
      { who: "k", text: { zh: "没错。小林是泄密源头——蠢，但他没交易；把消息变成 8000 万仓位的，是他舅舅刘大户。", en: "Correct. Intern Lin was the source of the leak — foolish, but he never traded. The man who turned the whisper into an 80-million position was his uncle, Whale Liu." } },
      { who: "k", text: { zh: "知悉加交易，两条全占，罚没加市场禁入跑不掉。小林也逃不了处分——嘴不严，害人害己。", en: "Knowledge plus trading — both boxes checked. Fines, disgorgement and a market ban are coming. And Lin won't escape discipline either — loose lips hurt everyone." } },
      { who: "k", text: { zh: "记住这一课：在市场里，「你懂的」三个字，可以贵到八千万。", en: "Remember this lesson: in the market, 'you know what I mean' can cost eighty million." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。光知道消息不算，光买了股票也不算——要「既知道、又交易」。再想想谁两条都占。", en: "Wrong. Knowing alone isn't the crime, and buying alone isn't either — it takes BOTH. Think: who checks both boxes?" } },
    ],
  },
  {
    id: "rattrade",
    title: { zh: "第三案 · 抢跑的账户", en: "Case 3 · The Front-Running Account" },
    desc: { zh: "基金建仓前一周，一个账户精准潜伏，获利三千万——钱是谁的？", en: "A week before the fund bought in, one account quietly loaded up and made 30 million. Whose money is it?" },
    award: { zh: "鼠仓克星", en: "Rat Catcher" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      chen: { name: { zh: "陈经理", en: "Manager Chen" }, color: "--down" },
      sun: { name: { zh: "孙交易员", en: "Trader Sun" }, color: "--ma5" },
      ma: { name: { zh: "马阿姨", en: "Auntie Ma" }, color: "--ma20" },
      qian: { name: { zh: "钱研究员", en: "Researcher Qian" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "鑫达基金上个月重仓买入一只冷门小盘股，股价一个月拉了 60%。", en: "Last month Xinda Fund piled into an obscure small-cap, and the price ran 60% in a month." } },
      { who: "k", text: { zh: "蹊跷的是：基金建仓前整整一周，一个名叫「马秀兰」的个人账户先潜伏了进去，基金拉升途中精准清仓，获利三千万。", en: "The catch: a full week before the fund started buying, a personal account under 'Ma Xiulan' quietly loaded up — then sold precisely into the fund's ramp, pocketing 30 million." } },
      { who: "k", text: { zh: "用别人的账户，抢在自己管理的基金前面买，再让基民的钱给自己抬轿——这叫老鼠仓。", en: "Using someone else's account to buy ahead of the fund you manage, letting your investors' money carry you up — that's called rat trading." } },
      { who: "k", text: { zh: "四个人和这只票有关。把老鼠找出来。", en: "Four people touched this stock. Find me the rat." } },
    ],
    suspects: [
      {
        id: "chen",
        dialog: [
          { who: "chen", text: { zh: "我是基金经理，建仓是投委会集体决策，流程你们随便查。", en: "I'm the fund manager. The position was approved by the investment committee — audit the process all you like." } },
          { who: "chen", text: { zh: "马秀兰？不认识。同名同姓的人多了去了。", en: "Ma Xiulan? Never heard of her. Plenty of people share a name." } },
          { who: "chen", text: { zh: "……我丈母娘也叫马秀兰？巧合，纯属巧合。她一个跳广场舞的，懂什么股票。", en: "...My mother-in-law is ALSO named Ma Xiulan? Coincidence. Pure coincidence. She's a square-dancing granny — what would she know about stocks." } },
        ],
        clue: { zh: "陈经理是唯一能决定「买哪只、何时建仓」的人——而潜伏账户的户主马秀兰，正是他的丈母娘。", en: "Manager Chen alone decided WHAT to buy and WHEN — and the lurking account belongs to Ma Xiulan, his mother-in-law." },
      },
      {
        id: "sun",
        dialog: [
          { who: "sun", text: { zh: "我只是执行下单的。指令当天早上才到我手里，之前我连票的名字都不知道。", en: "I just execute orders. The ticket reached me the morning of — before that I didn't even know the name." } },
          { who: "sun", text: { zh: "交易室手机统一上交、通话全程录音，你们要查我随便查。", en: "Phones are surrendered in the dealing room and every call is recorded. Check whatever you want." } },
          { who: "sun", text: { zh: "不过有件事很怪：那个账户开在城西营业部——我记得陈经理家就住那一片。", en: "One odd thing though: that account was opened at the West City branch — and I remember Manager Chen lives right around there." } },
        ],
        clue: { zh: "孙交易员建仓当天才知道股票名字，时间上不可能提前一周潜伏——排除。他还提到：潜伏账户开在陈经理家附近的营业部。", en: "Trader Sun learned the name only on execution day — he couldn't have front-run by a week. He also notes: the account was opened at a branch near Chen's home." },
      },
      {
        id: "ma",
        dialog: [
          { who: "ma", text: { zh: "股票？我不懂呀。账户是女婿说帮我「理财」开的，身份证也是他拿去办的。", en: "Stocks? I don't understand them. My son-in-law opened the account to 'manage my savings' — he took my ID to do the paperwork." } },
          { who: "ma", text: { zh: "密码我从来不知道，我连那个什么交易软件都没下载过。", en: "I never knew the password. I've never even downloaded that trading app thing." } },
          { who: "ma", text: { zh: "赚了三千万？哎哟，那我是不是能换个大点的房子了？", en: "It made 30 million? Oh my — does that mean I can buy a bigger flat?" } },
        ],
        clue: { zh: "马阿姨连交易密码都不知道——账户是她的名字，操作的手却是别人的。下单 IP 经查与陈经理家的宽带一致。", en: "Auntie Ma doesn't even know the password — the account wears her name, but another hand placed the orders. The order IP traces to Chen's home broadband." },
      },
      {
        id: "qian",
        dialog: [
          { who: "qian", text: { zh: "这只票是我三个月前挖掘的，深度报告只发在公司内部系统里。", en: "I found this stock three months ago. The deep-dive report went only to the firm's internal system." } },
          { who: "qian", text: { zh: "报告谁看过后台都有记录：陈经理打开过十一次，还下载了一次。", en: "The system logs every reader: Manager Chen opened it eleven times and downloaded it once." } },
          { who: "qian", text: { zh: "我自己？研究员买自己覆盖的票要提前报备，我一股都没碰——不信查我账户。", en: "Me? Analysts must pre-clear trades in names they cover. I never touched a share — check my account." } },
        ],
        clue: { zh: "钱研究员的报告只在内部系统，且他本人账户干净。后台记录显示：陈经理反复阅读并下载过该报告。", en: "Qian's report never left the internal system and his own account is clean. The logs show Manager Chen read it repeatedly — and downloaded it." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "捋一遍：报告在内部系统里，只有基金经理能定建仓时点；账户开在他家小区对面，下单 IP 是他家宽带，户主是他丈母娘。", en: "Line it up: the report lived in the internal system; only the fund manager set the buying schedule; the account sits across from his home, the order IP is his broadband, the holder is his mother-in-law." } },
      { who: "k", text: { zh: "老鼠仓的要害是「先于基金买入、用基民的钱抬轿」。谁做得到？指认吧。", en: "Rat trading means buying BEFORE your own fund and letting investors' money lift you. Who could do that? Make the call." } },
    ],
    culprit: "chen",
    win: [
      { who: "k", text: { zh: "没错。陈经理先用丈母娘的账户潜伏，再动用基金几十亿建仓拉升，最后让「马秀兰」精准下车——基民买单，他数钱。", en: "Correct. Chen lurked first with his mother-in-law's account, then deployed billions of fund money to ramp the price, and let 'Ma Xiulan' step off at the top — investors paid, he counted." } },
      { who: "k", text: { zh: "这就是老鼠仓：管理人把本该属于基民的收益，先装进了自己的口袋。判罚从来不轻——没收违法所得，市场禁入，还可能坐牢。", en: "That's rat trading: a manager pocketing gains that belonged to his investors. The penalty is never light — disgorgement, market ban, possibly prison." } },
      { who: "k", text: { zh: "记住这一课：买基金不只看业绩，还要看人品。净值曲线可以画得很漂亮，鼠洞是藏在曲线底下的。", en: "Remember the lesson: when you buy a fund, you buy the manager's character. A NAV curve can look beautiful — the rat hole hides beneath it." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。想想老鼠仓的定义：谁既能决定基金「何时买什么」，又和那个潜伏账户脱不了干系？", en: "Wrong. Think about the definition: who both controlled WHEN the fund bought WHAT, and can't be separated from that lurking account?" } },
    ],
  },
  {
    id: "pumpdump",
    title: { zh: "第四案 · 妖股风云", en: "Case 4 · Anatomy of a Meme Stock" },
    desc: { zh: "十二连板后连续跌停，龙虎榜上全是同一个席位——庄家是谁？", en: "Twelve straight limit-ups, then a cliff. The exchange's top-trader list shows one branch over and over. Who ran the pump?" },
    award: { zh: "屠庄英雄", en: "Whale Hunter" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      tu: { name: { zh: "屠老板", en: "Boss Tu" }, color: "--down" },
      dai: { name: { zh: "戴老师", en: "Teacher Dai" }, color: "--ma20" },
      shi: { name: { zh: "施董", en: "Chairman Shi" }, color: "--up" },
      niu: { name: { zh: "牛小妹", en: "Little Niu" }, color: "--ma5" },
    },
    intro: [
      { who: "k", text: { zh: "ST 宏图，一只常年无人问津的壳股，一个月里十二个涨停，改名叫「宏图元宇宙」之后又来了五个。", en: "ST Hongtu — a shell company nobody touched for years — hit twelve limit-ups in a month, then five more after renaming itself 'Hongtu Metaverse'." } },
      { who: "k", text: { zh: "上周它开始连续一字跌停，几万追高的散户被封在里面，一秒都跑不掉。", en: "Last week it flipped to one-way limit-downs. Tens of thousands of chasers are sealed inside, unable to sell a single share." } },
      { who: "k", text: { zh: "龙虎榜上，同一家营业部的席位反复出现在买一和卖一——有人在坐庄。", en: "On the exchange's top-trader list, the same brokerage branch keeps appearing as both top buyer and top seller — someone was running the book." } },
      { who: "k", text: { zh: "四个人卷在这只妖股里。找出庄家。", en: "Four people are tangled in this meme stock. Find me the operator." } },
    ],
    suspects: [
      {
        id: "tu",
        dialog: [
          { who: "tu", text: { zh: "我就是个做短线的，看到强势股加入而已，这叫「打板」，合法的市场行为。", en: "I'm just a momentum trader. I join strong stocks — it's called limit-up chasing, perfectly legal." } },
          { who: "tu", text: { zh: "龙虎榜那个席位是我常用的营业部没错，但一个营业部几千个客户，凭什么说是我？", en: "Yes, that branch on the list is where I trade. But a branch has thousands of clients — why me?" } },
          { who: "tu", text: { zh: "自己买自己卖？你说的是「对倒」吧。呵，那得有几十个账户配合才做得到——我哪来那么多账户。", en: "Buying from myself? You mean wash trading. Ha — you'd need dozens of coordinated accounts for that. Where would I get so many." } },
        ],
        clue: { zh: "屠老板对「对倒」的手法脱口而出、门儿清。监控发现该席位下有 47 个不同身份证的账户，开户时间集中在拉升前一个月，资金同源。", en: "Boss Tu explained wash trading a little too fluently. Surveillance found 47 accounts under different IDs at that branch — all opened within a month before the ramp, all funded from the same source." },
      },
      {
        id: "dai",
        dialog: [
          { who: "dai", text: { zh: "我是知识付费！会员群 998 一个季度，我分享的是「盘面情绪学」，从不保证收益。", en: "I sell knowledge! Membership is 998 a quarter. I teach 'market sentiment studies' — no returns ever promised." } },
          { who: "dai", text: { zh: "宏图元宇宙是我喊的没错，但我喊的时候它已经涨起来了，我这叫顺势而为。", en: "Yes I called Hongtu Metaverse — but it was already flying when I called it. That's called riding the trend." } },
          { who: "dai", text: { zh: "屠老板?……认识，一起吃过几顿饭。他偶尔会「提示」我哪只票有资金关照，朋友之间聊聊天而已嘛。", en: "Boss Tu? ...We've shared a few dinners. He'd occasionally 'hint' which stock had money behind it. Just friends talking." } },
        ],
        clue: { zh: "戴老师每次喊单都在涨停板封死之后——散户第二天追进去，正好接屠老板的货。他承认屠老板会提前「提示」他。", en: "Teacher Dai's calls always came AFTER the limit-up sealed — his followers piled in next morning, right into Boss Tu's exits. He admits Tu 'hinted' stocks to him in advance." },
      },
      {
        id: "shi",
        dialog: [
          { who: "shi", text: { zh: "公司改名「元宇宙」怎么了？我们确实在探索战略转型，董事会决议齐全。", en: "So we renamed to 'Metaverse' — we ARE exploring a strategic pivot. Full board resolutions on file." } },
          { who: "shi", text: { zh: "那三份公告？「签署合作意向书」都是真实事件。意向嘛……后来没谈成，商业世界很正常。", en: "Those three announcements? Every 'letter of intent' was a real event. Intent... that later fell through. Business is like that." } },
          { who: "shi", text: { zh: "有人建议我「这段时间多发点利好」？我不记得了。就算有，发公告也是信披义务！", en: "Did someone suggest I 'release more good news around then'? I don't recall. And even so — announcements are my DISCLOSURE DUTY!" } },
        ],
        clue: { zh: "施董的三个「利好」全是无实质的意向书，且发布时点精准踩在拉升关键日。他暗示有人「建议」过他发公告——配合坐庄，但不是操盘的手。", en: "Chairman Shi's three 'good news' items were substance-free letters of intent, timed precisely to key ramp days. He hints someone 'suggested' the announcements — a collaborator, but not the hand on the wheel." },
      },
      {
        id: "niu",
        dialog: [
          { who: "niu", text: { zh: "我第八个板追进去的，三天赚了 40%！我当时觉得自己是天才。", en: "I chased in on the eighth limit-up and made 40% in three days! I thought I was a genius." } },
          { who: "niu", text: { zh: "戴老师群里说「主力锁仓，目标翻倍」，我就把赚的加本金全押回去了……", en: "Teacher Dai's group said 'the whale is locked in, target: double'. So I pushed my winnings AND my savings back in..." } },
          { who: "niu", text: { zh: "然后就是连续跌停。卖单排在两百万手后面，根本轮不到我。你们一定要抓住庄家啊！", en: "Then the limit-downs came. My sell order sat behind two million lots — it never got filled. Please, catch whoever did this!" } },
        ],
        clue: { zh: "牛小妹是纯受害者：追高、听喊单加仓、跌停里逃不出来——教科书式的接盘全过程。", en: "Little Niu is purely a victim: chased the ramp, doubled down on the guru's call, trapped in the limit-downs — a textbook bag-holding arc." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "看清这台机器了吗：47 个同源账户对倒拉板制造赚钱假象，董事长按时点配合放「利好」，大V封板后喊单送来接盘的人。", en: "See the machine now? 47 same-source accounts wash-trading the price up to fake a gold rush; a chairman releasing 'good news' on cue; a guru calling buys after each seal to deliver fresh bags." } },
      { who: "k", text: { zh: "喊单的、发公告的都有罪责，但坐庄要有三样东西：钱、账户、控盘的手。三样都在谁手里？指认吧。", en: "The caller and the chairman share the guilt. But running a pump needs three things: the money, the accounts, and the hand on the wheel. Who held all three? Make the call." } },
    ],
    culprit: "tu",
    win: [
      { who: "k", text: { zh: "没错。屠老板用 47 个账户先吸筹、再对倒拉出十二连板，让施董的「利好」和戴老师的喊单把散户接进来，自己在最高那几个板悄悄出货。", en: "Correct. Boss Tu accumulated quietly with 47 accounts, wash-traded twelve straight limit-ups, let Shi's 'news' and Dai's calls funnel retail money in — and unloaded silently into the highest boards." } },
      { who: "k", text: { zh: "操纵股价是证券市场最重的罪之一：没收所得、天价罚款、刑责一样不少。施董和戴老师，一个信披违规，一个非法荐股，也都跑不掉。", en: "Price manipulation is among the gravest market crimes: disgorgement, massive fines, criminal charges — all of it. Shi and Dai face their own reckonings for disclosure fraud and illegal touting." } },
      { who: "k", text: { zh: "记住这一课：妖股拉升时，龙虎榜比 K 线诚实。你看到的连板是画出来的，你听到的目标价是喊给你听的。", en: "Remember the lesson: when a meme stock flies, the top-trader list is more honest than the chart. The limit-ups you see were painted; the price target you heard was shouted FOR you." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。喊单的和发公告的都只是零件。坐庄需要钱、账户和控盘的手——三样齐的只有一个人。", en: "Wrong. The caller and the announcer are just parts of the machine. A pump needs money, accounts, and the hand on the wheel — only one person held all three." } },
    ],
  },
  {
    id: "scallop",
    title: { zh: "第五案 · 跑路的扇贝", en: "Case 5 · The Scallops That Swam Away" },
    desc: { zh: "账上 300 亿现金的公司，扇贝连续两年「跑了」——钱和扇贝，到底谁跑了？", en: "A company with 30 billion in cash says its scallops 'swam away' — twice. So who really ran: the scallops, or the money?" },
    award: { zh: "财报照妖镜", en: "Book Buster" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      he: { name: { zh: "贺董", en: "Chairman He" }, color: "--down" },
      feng: { name: { zh: "冯总监", en: "CFO Feng" }, color: "--ma20" },
      zheng: { name: { zh: "郑会计师", en: "Auditor Zheng" }, color: "--up" },
      bai: { name: { zh: "白研究员", en: "Analyst Bai" }, color: "--ma5" },
    },
    intro: [
      { who: "k", text: { zh: "海珍岛，一家养扇贝的上市公司。前年年报：扇贝跑了，减值 8 个亿。去年年报：扇贝又跑了，再减 11 个亿。", en: "Haizhen Island, a listed scallop farmer. Two years ago: 'the scallops swam away' — an 800 million write-down. Last year: they 'swam away' again — 1.1 billion more." } },
      { who: "k", text: { zh: "蹊跷的是，这家公司账上躺着 300 亿「货币资金」，却同时借着利率 8% 的高息债——有钱人会去借高利贷吗？", en: "The strange part: the books show 30 billion in 'cash' — yet the company keeps borrowing at 8% interest. Do the rich take out payday loans?" } },
      { who: "k", text: { zh: "上周股价闪崩跌停，监管进场核查。扇贝不会说话，但账本会。", en: "Last week the stock crashed limit-down and the regulator moved in. Scallops can't talk — but ledgers can." } },
      { who: "k", text: { zh: "四个人围着这本账。查出钱去了哪。", en: "Four people circle this ledger. Find out where the money went." } },
    ],
    suspects: [
      {
        id: "he",
        dialog: [
          { who: "he", text: { zh: "天灾！海水温度异常，扇贝大面积死亡洄游，我们渔民靠天吃饭，你们城里人不懂。", en: "An act of nature! Abnormal water temperatures — the scallops died and migrated en masse. We farmers live at the sea's mercy. City people wouldn't understand." } },
          { who: "he", text: { zh: "账上 300 亿是真金白银，银行函证都盖了章的。借高息债？那是……维持经营性现金流的正常安排。", en: "The 30 billion is real money — the bank confirmations are stamped. The high-interest debt? That's... normal working-capital arrangement." } },
          { who: "he", text: { zh: "我质押 96% 的持股套现 40 亿？企业家个人资金安排，与上市公司无关！", en: "I pledged 96% of my shares and cashed out 4 billion? An entrepreneur's personal finances — nothing to do with the listed company!" } },
        ],
        clue: { zh: "贺董质押了 96% 持股提前套现 40 亿——扇贝「跑路」的每个年份，恰好都是他质押到期要补钱的年份。存贷双高的账，只有做账的人和授意做账的人知道真相。", en: "Chairman He pledged 96% of his shares and cashed out 4 billion early — and each 'scallop escape' landed exactly in a year his pledges came due. Only the bookkeeper and the man who ordered the books know the truth behind cash-rich-yet-borrowing." },
      },
      {
        id: "feng",
        dialog: [
          { who: "feng", text: { zh: "报表是我编的，但每一笔调整都有贺董的批示。你们要看原始凭证吗？我……我留了备份。", en: "I prepared the statements — but every adjustment carries Chairman He's sign-off. Want the original vouchers? I... kept copies." } },
          { who: "feng", text: { zh: "那 300 亿「货币资金」，大部分年初转出去、审计前一周转回来，走的是海外子公司账户。", en: "Most of that 30 billion 'cash' leaves in January and returns the week before the audit — through the offshore subsidiary's accounts." } },
          { who: "feng", text: { zh: "每次扇贝盘点的前一夜，贺董都亲自安排船队「巡海」。巡完之后，盘点区域的扇贝就总是特别少。", en: "The night before every scallop count, Chairman He personally sent the fleet out 'on patrol'. After each patrol, the survey zones were always mysteriously empty." } },
        ],
        clue: { zh: "冯总监交出了底账：300 亿现金审计前一周才「回账」，盘点前夜船队总在「巡海」。他是执行者，也是留了后手的证人。", en: "CFO Feng surrendered the shadow books: the 30 billion 'returns' one week before each audit, and the fleet always 'patrols' the night before each count. He executed the scheme — and kept the receipts." },
      },
      {
        id: "zheng",
        dialog: [
          { who: "zheng", text: { zh: "我们连续三年出具标准无保留意见，程序上完全合规——函证、盘点、抽样，一样不少。", en: "We issued clean opinions three years running, fully by the book — confirmations, counts, sampling, all of it." } },
          { who: "zheng", text: { zh: "扇贝在海底怎么盘点？我们只能坐船抽样看海面……你别笑，行业惯例就这样。", en: "How do you count scallops on the seabed? We sample by boat and look at the water... don't laugh, that's industry practice." } },
          { who: "zheng", text: { zh: "今年我们辞任了。为什么？函证回函的银行网点，查无此址。我只能说到这了。", en: "This year we resigned the engagement. Why? The bank branch that answered our confirmation letters — the address doesn't exist. That's all I can say." } },
        ],
        clue: { zh: "郑会计师事务所连出三年干净意见后突然辞任——因为银行函证的回函网点根本不存在。函证是伪造的，审计被系统性欺骗。", en: "Auditor Zheng's firm quit abruptly after three clean opinions — because the bank branch replying to their confirmations doesn't exist. The confirmations were forged; the audit was systematically deceived." },
      },
      {
        id: "bai",
        dialog: [
          { who: "bai", text: { zh: "我承认我连续五篇「强烈推荐」，目标价还翻着倍上调。研究嘛，观点有对有错。", en: "Yes, I published five 'Strong Buy' notes in a row and kept doubling the target price. Research has hits and misses." } },
          { who: "bai", text: { zh: "去公司调研？去过，贺董带我们坐游艇看了海面，吃了顿扇贝宴，帆船上签的合作课题，经费 200 万。", en: "Site visits? Sure. Chairman He took us out on the yacht to view the sea, hosted a scallop banquet, and we signed a 2-million research grant on the sailboat." } },
          { who: "bai", text: { zh: "扇贝在不在海底，我一个写报告的怎么知道？我又不会潜水。", en: "Whether the scallops are down there — how would a report writer know? I can't dive." } },
        ],
        clue: { zh: "白研究员拿了 200 万「课题经费」后连发五篇强推——吹票有责，但他没碰过账本，不是造假的手。", en: "Analyst Bai took a 2-million 'research grant' and published five Strong Buys — guilty of touting, but he never touched the ledgers. Not the forging hand." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "拼起来了：现金审计前回账、函证网点不存在、盘点前夜「巡海」、减值年份对准质押到期——这是一台精密的造假机器。", en: "Assemble it: cash that returns just before audits, confirmation branches that don't exist, 'sea patrols' before every count, write-downs timed to pledge deadlines — a precision-built fraud machine." } },
      { who: "k", text: { zh: "CFO 做账、审计被骗、研究员吹票——但机器要有一个按开关的人：既有权力指挥船队和资金，又有质押爆仓的动机。指认吧。", en: "The CFO cooked, the auditor was deceived, the analyst touted — but every machine has one hand on the switch: someone with the power to command fleets and funds, and a pledge about to blow. Make the call." } },
    ],
    culprit: "he",
    win: [
      { who: "k", text: { zh: "没错。扇贝从来没跑——跑的是钱。贺董把上市公司资金通过海外子公司抽走填自己的质押窟窿，再用「扇贝死了」的减值把亏空洗成天灾。", en: "Correct. The scallops never ran — the money did. Chairman He siphoned company cash through the offshore subsidiary to plug his pledge holes, then laundered the shortfall into 'dead scallops' — an act of nature." } },
      { who: "k", text: { zh: "「存贷双高」就是照妖镜：真有 300 亿现金的公司，不会去借 8% 的高息债。财务造假、违规担保、掏空上市公司——退市加刑责，一样都少不了。", en: "'High cash, high debt' is the mirror that reveals the demon: a company truly holding 30 billion doesn't borrow at 8%. Fraud, illegal guarantees, tunneling — delisting and prison, the full menu." } },
      { who: "k", text: { zh: "记住这一课：看财报先看现金流。利润可以「编」，扇贝可以「跑」，但利息支出从来不会说谎。", en: "Remember the lesson: read the cash flow before the profit. Earnings can be authored and scallops can 'swim away' — but interest expense never lies." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。做账的、被骗的、吹票的都不是开关。想想：谁最需要那 300 亿「存在」，又最有权力让扇贝「消失」？", en: "Wrong. The bookkeeper, the deceived, the tout — none held the switch. Think: who NEEDED the 30 billion to 'exist', and had the power to make scallops 'vanish'?" } },
    ],
  },
  {
    id: "pigplate",
    title: { zh: "第六案 · 完美导师", en: "Case 6 · The Perfect Guru" },
    desc: { zh: "退休教师的 80 万养老钱，充进「国际盘」后再也提不出来——谁在杀猪？", en: "A retired teacher's 800k pension vanished into an 'international platform' that won't pay out. Who's butchering the pig?" },
    award: { zh: "反诈先锋", en: "Scam Slayer" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      tang: { name: { zh: "唐导师", en: "Guru Tang" }, color: "--down" },
      tian: { name: { zh: "甜甜", en: "Tiantian" }, color: "--ma5" },
      hao: { name: { zh: "阿豪", en: "Ah Hao" }, color: "--ma20" },
      jin: { name: { zh: "金链子", en: "Gold Chain" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "老周，退休中学教师，三个月里把 80 万养老钱分七次充进了一个叫「环球金汇」的交易平台。", en: "Old Zhou, a retired schoolteacher, wired his 800k pension into a platform called 'Global GoldFX' — seven deposits over three months." } },
      { who: "k", text: { zh: "前两个月他「赚」了 30%，提现秒到账。第三个月他加满仓位，账户一夜「爆仓」，平台连夜关停跑路。", en: "The first two months he 'earned' 30%, withdrawals instant. The third month he went all-in — his account 'blew up' overnight, and the platform vanished by morning." } },
      { who: "k", text: { zh: "这种局有个名字：杀猪盘。先养、再喂、后杀。警方顺着资金链抓回来四个人。", en: "This scheme has a name: pig butchering. Raise the pig, fatten the pig, kill the pig. Police followed the money and brought back four people." } },
      { who: "k", text: { zh: "把盘主找出来。老周的养老钱，就指望这个了。", en: "Find the one running the plate. Old Zhou's pension depends on it." } },
    ],
    suspects: [
      {
        id: "tang",
        dialog: [
          { who: "tang", text: { zh: "我是受害者！我自己在平台里也有 200 万提不出来！我们是「战友」啊！", en: "I'm a victim too! I have 2 million stuck on that platform myself! We were comrades-in-arms!" } },
          { who: "tang", text: { zh: "直播喊单怎么了？我分享的是「缠论战法」，学员自愿跟单。收益截图？那是……教学示意图。", en: "So I called trades on stream — I teach 'entanglement theory tactics', students follow of their own will. The profit screenshots? Those were... teaching illustrations." } },
          { who: "tang", text: { zh: "平台管理后台的注册邮箱是我的？不可能！那是有人盗用……我要请律师！", en: "The platform's admin account is registered to MY email? Impossible! Identity theft! I want my lawyer!" } },
        ],
        clue: { zh: "唐导师自称受害者，但平台管理后台的注册邮箱是他的，服务器租金从他控制的公司账户支付——「自己也被套」是杀猪盘标准剧本的最后一页。", en: "Guru Tang claims victimhood — but the platform's admin account uses his email, and the server rent flows from a company he controls. 'I'm trapped too' is the standard script's final page." },
      },
      {
        id: "tian",
        dialog: [
          { who: "tian", text: { zh: "我就是个聊天的。公司发我话术本，每天跟 40 个「叔叔」说早安晚安，聊孙子聊广场舞。", en: "I just chat. The company hands me a script book — every day I say good morning and good night to forty 'uncles', talk grandkids and square dancing." } },
          { who: "tian", text: { zh: "话术本第三章：处熟三个月才能提「我跟着唐老师赚了钱」。第四章：对方犹豫时发一张自己「盈利截图」。", en: "Script chapter three: only after three months of warmth may you mention 'I made money following Teacher Tang'. Chapter four: when they hesitate, send your own 'profit screenshot'." } },
          { who: "tian", text: { zh: "「甜甜」有 26 个，都用同一套照片。我提成千分之五……我也知道不对，我在攒钱退出的。", en: "There are 26 'Tiantians', all using the same photo set. My cut is 0.5%... I knew it was wrong. I was saving up to quit." } },
        ],
        clue: { zh: "「甜甜」是 26 人共用的人设，按话术本养熟目标再引向唐导师——诈骗链条的「养猪」环节，但她接触不到平台和资金。", en: "'Tiantian' is a persona shared by 26 operators, warming targets by script before steering them to Guru Tang — the 'pig raising' link, with no access to platform or funds." },
      },
      {
        id: "hao",
        dialog: [
          { who: "hao", text: { zh: "我管客服组。规矩很简单：前两个月提现「秒批」，客户加满仓后，提现按钮就要「系统维护」。", en: "I run customer service. The rules are simple: first two months, withdrawals approved instantly. Once a client is fully loaded, the withdraw button goes 'under maintenance'." } },
          { who: "hao", text: { zh: "行情？平台根本没接真实市场，K线是后台画的。让谁赚、让谁爆，一个参数的事。", en: "The market feed? The platform never connected to any real market. The candles are drawn by the back office — who wins, who blows up, it's one parameter." } },
          { who: "hao", text: { zh: "参数谁调？我没权限。全平台只有一个「总控」账号能碰,我只见过它半夜上线。", en: "Who sets the parameter? Above my clearance. Only one 'master control' account can touch it — I've only ever seen it log in past midnight." } },
        ],
        clue: { zh: "阿豪证实平台是「画 K线」的假盘，输赢由一个「总控」账号的参数决定——他执行话术，但碰不到总控。", en: "Ah Hao confirms the platform is a painted-candle fake — wins and losses set by one 'master control' account's parameters. He runs the scripts but can't touch the control." },
      },
      {
        id: "jin",
        dialog: [
          { who: "jin", text: { zh: "我就是「卡商」。收来的银行卡一张租金八百，钱进来我负责分散转出去，抽水 3 个点。", en: "I'm just the 'card man'. I rent bank cards at 800 apiece; money comes in, I scatter it out, and skim 3 points." } },
          { who: "jin", text: { zh: "钱最后去哪？换成 U 出境。上家是谁我真不知道，单线联系,对方代号「老师」。", en: "Where does it end up? Converted to crypto, moved offshore. My upstream? Single-line contact only — codename 'Teacher'." } },
          { who: "jin", text: { zh: "不过有一次「老师」发错了收款码——那个码，我在唐导师直播间的打赏链接里见过。", en: "But once, 'Teacher' sent the wrong payment code — and I'd seen that exact code before, in the tip jar of Guru Tang's livestream." } },
        ],
        clue: { zh: "金链子是洗钱的「卡商」，上家代号「老师」——一次发错的收款码，和唐导师直播间的打赏码是同一个。", en: "Gold Chain launders through rented cards for an upstream codenamed 'Teacher' — who once slipped and sent a payment code identical to the tip jar in Guru Tang's livestream." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "链条闭合了：26 个「甜甜」养猪，假盘画 K线喂猪，提现「维护」杀猪,卡商洗钱出境。", en: "The chain closes: 26 'Tiantians' raise the pigs, painted candles fatten them, 'maintenance' kills them, and rented cards wash the money offshore." } },
      { who: "k", text: { zh: "管理后台的邮箱、付服务器租金的公司、半夜上线的总控、发错的收款码——四条线指向同一个人。指认吧。", en: "The admin email, the company paying the servers, the midnight master control, the slipped payment code — four threads, one knot. Make the call." } },
    ],
    culprit: "tang",
    win: [
      { who: "k", text: { zh: "没错。唐导师就是盘主：白天直播喊单当「导师」，半夜登录总控当「屠夫」，让老周先赚 30% 养足信任，再一个参数收走全部。", en: "Correct. Guru Tang ran the plate: 'mentor' on stream by day, butcher at the master control by night — letting Old Zhou win 30% to fatten his trust, then harvesting everything with one parameter." } },
      { who: "k", text: { zh: "杀猪盘三步：养（小赚快提）、喂（加大投入）、杀（无法提现）。而它的破绽从第一天就在：真正的交易软件，不需要「甜甜」来教你下载。", en: "Pig butchering in three steps: raise (small wins, fast payouts), fatten (bigger deposits), kill (withdrawals frozen). And the tell was there from day one: real trading software never needs a 'Tiantian' to teach you how to install it." } },
      { who: "k", text: { zh: "记住这一课，也讲给家里人听：凡是「稳赚不赔」「导师带单」「内部通道」，一律是诈骗。收益越确定，骗局越确定。", en: "Remember this lesson — and teach it to your family: 'guaranteed profit', 'guru-led trades', 'insider channels' — every one of them is fraud. The more certain the return, the more certain the scam." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。聊天的、客服的、洗钱的都是刀，不是握刀的手。想想：管理后台、服务器租金、总控账号、收款码——都指向谁？", en: "Wrong. The chatters, the support desk, the launderers are blades — not the hand that holds them. Think: the admin email, the server rent, the master control, the payment code — where do they all point?" } },
    ],
  },
  {
    id: "fatfinger",
    title: { zh: "第七案 · 234亿的手滑", en: "Case 7 · The 23.4 Billion Slip" },
    desc: { zh: "套利系统 2 秒打出 234 亿买单，大盘瞬间拉升——乌龙是事故，但之后发生的事是犯罪。", en: "An arbitrage system fired 23.4 billion of buy orders in 2 seconds and the index spiked. The fat finger was an accident — what happened next was a crime." },
    award: { zh: "真相守门人", en: "Truth Keeper" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      gong: { name: { zh: "龚总裁", en: "President Gong" }, color: "--down" },
      qu: { name: { zh: "屈总监", en: "Director Qu" }, color: "--ma20" },
      guo: { name: { zh: "程序员小郭", en: "Coder Guo" }, color: "--ma5" },
      leng: { name: { zh: "冷风控", en: "Risk Chief Leng" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "8 月 16 日上午 11:05，某大型券商的程序化交易套利系统突然失控，2 秒内打出 234 亿元买单。", en: "August 16, 11:05 AM. A major broker's program-trading arbitrage system went rogue, firing 23.4 billion yuan of buy orders in two seconds." } },
      { who: "k", text: { zh: "权重股瞬间集体涨停，大盘一分钟拉升 5%。全市场都在问：发生了什么？是重大利好吗？", en: "Blue chips slammed limit-up in unison; the index spiked 5% in a minute. The whole market asked: what happened? Is this huge news?" } },
      { who: "k", text: { zh: "11:59，公司对媒体声明：「系统没有问题。」而下午开盘后，这家公司悄悄卖空了大量股指期货和 ETF。", en: "At 11:59 the firm told the press: 'Our systems are fine.' Yet right after the afternoon open, the same firm quietly shorted index futures and ETFs in size." } },
      { who: "k", text: { zh: "乌龙指是事故，不是罪。可有人把事故变成了犯罪。四个人，找出那只手。", en: "A fat finger is an accident, not a crime. But someone turned this accident into one. Four people — find the hand." } },
    ],
    suspects: [
      {
        id: "guo",
        dialog: [
          { who: "guo", text: { zh: "是我写的订单生成模块……重下单机制少了个状态检查，失败的单子会无限重试。测试环境里从来没触发过。", en: "I wrote the order-generation module... the retry logic was missing a state check, so failed orders retried forever. It never triggered in testing." } },
          { who: "guo", text: { zh: "那天系统直连交易所，230 亿的单子没经过任何资金校验就出去了。我看到成交回报的时候手都是抖的。", en: "That day the system was wired straight to the exchange — 23 billion went out without a single capital check. My hands were shaking when I saw the fills." } },
          { who: "guo", text: { zh: "我 11:10 就把事故报告发给了屈总监和龚总。之后他们开会，没让我参加。", en: "I sent the incident report to Director Qu and President Gong at 11:10. Then they held a meeting. I wasn't invited." } },
        ],
        clue: { zh: "小郭的 bug 是事故的起点，但他 11:10 就如实上报了。写错代码是过失，不是犯罪——之后的决定与他无关。", en: "Guo's bug started the accident, but he reported it honestly at 11:10. Bad code is negligence, not crime — the decisions that followed were not his." },
      },
      {
        id: "qu",
        dialog: [
          { who: "qu", text: { zh: "11:40 我开始下令卖空股指期货对冲敞口。234 亿的多头风险摆在那里，止损是交易员的本能！", en: "At 11:40 I started shorting index futures to hedge the exposure. We were sitting on 23.4 billion of unwanted longs — cutting risk is a trader's instinct!" } },
          { who: "qu", text: { zh: "我知道公司还没公告。但我问过上面：「现在对冲合规吗？」上面的原话是——「先把窟窿堵上，公告的事下午再说。」", en: "I knew we hadn't disclosed yet. But I asked upstairs: 'Is hedging now compliant?' The exact answer was — 'Plug the hole first. Disclosure can wait till afternoon.'" } },
          { who: "qu", text: { zh: "那句话是谁说的？会议纪要上有名字。我只是执行。", en: "Who said it? The name is in the meeting minutes. I only executed." } },
        ],
        clue: { zh: "屈总监在公告前执行了对冲，但会议纪要显示「先对冲后公告」的决定来自更高层——他是执行的手，不是拍板的人。", en: "Director Qu hedged before disclosure — but the minutes show 'hedge first, disclose later' was decided above him. He was the executing hand, not the deciding one." },
      },
      {
        id: "leng",
        dialog: [
          { who: "leng", text: { zh: "风控额度？系统里设了的。但套利系统走的是独立通道，直连交易所，我的阀门根本不在它的路径上。", en: "Risk limits? They were configured. But the arbitrage system ran its own channel, straight to the exchange — my valves weren't even on its path." } },
          { who: "leng", text: { zh: "我半年前就打过报告：程序化交易必须接入统一风控，否则出事就是天大的事。报告批复写着「成本过高，暂缓」。", en: "Six months ago I filed a report: program trading must route through unified risk control, or any failure would be catastrophic. The reply read: 'Too costly. Postponed.'" } },
          { who: "leng", text: { zh: "签「暂缓」的人，和中午拍板「先对冲」的，是同一支笔。", en: "The pen that signed 'Postponed' and the pen that ruled 'hedge first' at noon — same pen." } },
        ],
        clue: { zh: "冷风控的接入方案半年前被批「暂缓」——签字人与中午拍板对冲的是同一人。她有失察之责，但两次关键决定都不在她手里。", en: "Risk Chief Leng's integration plan was stamped 'Postponed' six months ago — by the same signature that ruled 'hedge first' at noon. Oversight failure, yes; but neither key decision was hers." },
      },
      {
        id: "gong",
        dialog: [
          { who: "gong", text: { zh: "11:59 我对媒体说「系统没有问题」，那是……为了避免市场恐慌！维稳！你懂吗？", en: "At 11:59 I told the press 'our systems are fine' — to avoid market panic! Stability! You understand?" } },
          { who: "gong", text: { zh: "对冲是正常的风险管理。全世界的交易台都会这么做。我不明白这有什么可查的。", en: "Hedging is normal risk management. Every trading desk in the world does it. I don't see what there is to investigate." } },
          { who: "gong", text: { zh: "会议纪要？内部文件也能当证据？……那句话不是那个意思。「先把窟窿堵上」是一种……管理学表达。", en: "The minutes? Internal documents as evidence? ...That's not what the words meant. 'Plug the hole first' is a... managerial figure of speech." } },
        ],
        clue: { zh: "龚总裁 11:59 对公众否认事故，同一时间在内部拍板「先对冲后公告」——用只有自己知道的重大信息反向交易，这正是内幕交易的定义。", en: "President Gong publicly denied the incident at 11:59 while internally ruling 'hedge first, disclose later' — trading on material information only he possessed. That is the textbook definition of insider trading." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "理清了：bug 是过失，执行对冲的是奉命，风控失守是被「暂缓」的。真正的罪发生在 11:59——对市场说「没有问题」的同时，下令反向交易。", en: "Clear now: the bug was negligence, the hedger followed orders, risk control was 'postponed' away. The real crime happened at 11:59 — telling the market 'all fine' while ordering the opposite trade." } },
      { who: "k", text: { zh: "乌龙指发生的那一刻，「我们出了 234 亿的事故」就成了内幕信息。在公告前利用它交易的人，就是罪人。指认吧。", en: "The moment the fat finger fired, 'we just had a 23.4 billion accident' became inside information. Whoever traded on it before disclosure is the criminal. Make the call." } },
    ],
    culprit: "gong",
    win: [
      { who: "k", text: { zh: "没错。乌龙指本身不是犯罪——把事故当成只有自己知道的底牌，一边对公众撒谎一边抢先交易，才是。龚总裁被罚没数亿，终身市场禁入。", en: "Correct. The fat finger itself was no crime — treating the accident as a private ace, lying to the public while front-running it, was. President Gong: hundreds of millions in fines, banned from the market for life." } },
      { who: "k", text: { zh: "这一案改写了行业：内幕信息不只是「别人公司的秘密」，你自己的重大事件在公告前同样不能交易。信息面前，必须众生平等。", en: "This case rewrote the rulebook: inside information isn't just 'other companies' secrets' — your own material events are equally untradeable before disclosure. Before information, all must stand equal." } },
      { who: "k", text: { zh: "记住这一课：程序化交易必须有风控熔断阀；而当事故发生时，最贵的不是那 234 亿——是说出「系统没有问题」的那句谎话。", en: "Remember the lesson: program trading needs a risk-control kill switch. And when the accident comes, the costliest thing isn't the 23.4 billion — it's the sentence 'our systems are fine.'" } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。写错代码的、奉命执行的、被「暂缓」的，都不是罪的源头。想想：谁一边对公众说「没有问题」，一边下令反向交易？", en: "Wrong. The coder, the order-follower, the 'postponed' — none was the source. Think: who told the public 'all fine' while ordering the opposite trade?" } },
    ],
  },
  {
    id: "ponzi",
    title: { zh: "第八案 · 15%的神话", en: "Case 8 · The 15% Miracle" },
    desc: { zh: "年化 15% 保本保息、广告铺满地铁、300 万投资人——直到某个周一，提现按钮变成了灰色。", en: "15% a year, principal guaranteed, ads in every subway car, three million investors — until one Monday, the withdraw button turned gray." },
    award: { zh: "庞氏终结者", en: "Ponzi Terminator" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      bao: { name: { zh: "鲍总", en: "Chairman Bao" }, color: "--down" },
      mu: { name: { zh: "慕总监", en: "CFO Mu" }, color: "--ma20" },
      tong: { name: { zh: "佟金牌", en: "Top Seller Tong" }, color: "--ma5" },
      hua: { name: { zh: "华姐", en: "Sister Hua" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "「鑫富宝」，一个号称做「供应链金融创新」的理财平台：年化 15%，保本保息，随存随取。", en: "'XinFuBao', a wealth platform claiming 'supply-chain finance innovation': 15% a year, principal and interest guaranteed, withdraw anytime." } },
      { who: "k", text: { zh: "广告上了地铁、电视和春晚倒计时。两年吸金 700 亿，投资人 300 万——多数是把养老钱搬进来的普通人。", en: "Its ads ran in subways, on TV, before the New Year countdown. Two years: 70 billion raised, three million investors — mostly ordinary people moving in their pensions." } },
      { who: "k", text: { zh: "上周一，提现开始「排队」。周三，排队变成「系统升级」。周五，办公楼人去楼空，服务器和账本一起消失了。", en: "Last Monday, withdrawals started 'queuing'. Wednesday, the queue became a 'system upgrade'. Friday, the offices were empty — servers and ledgers gone." } },
      { who: "k", text: { zh: "警方在一处工地的地下六米，挖出了 80 本账册。四个人到案。开始吧。", en: "Police dug 80 ledgers out of a construction site — six meters underground. Four people in custody. Begin." } },
    ],
    suspects: [
      {
        id: "bao",
        dialog: [
          { who: "bao", text: { zh: "我们是金融创新！供应链金融！把核心企业的应收账款做成理财产品，怎么就成骗局了？", en: "We are financial innovation! Supply-chain finance! Turning core enterprises' receivables into wealth products — how is that a scam?" } },
          { who: "bao", text: { zh: "平台上的借款企业都是真实注册的公司……注册资料齐全，公章、执照，一样不少。", en: "Every borrower on the platform is a genuinely registered company... full paperwork, seals, licenses, everything." } },
          { who: "bao", text: { zh: "游艇和庄园是公司形象投入！给助理发的 5 个亿是……人才激励！埋账本？我不知道什么账本！", en: "The yacht and the estate were corporate image investments! The 500 million to my assistant was... talent incentive! Buried ledgers? I know nothing about ledgers!" } },
        ],
        clue: { zh: "平台上 95% 的「借款企业」是鲍总用同一批公章注册的壳公司——钱从投资人手里进来，转一圈流回他自己的口袋，这叫「自融」。", en: "95% of the platform's 'borrowers' are shell companies Chairman Bao registered with the same batch of seals — investor money loops straight back into his own pocket. The word for it: self-dealing." },
      },
      {
        id: "mu",
        dialog: [
          { who: "mu", text: { zh: "账是我管的。说实话吧——平台从第一天起就没有真实盈利，付给老投资人的「利息」，全部来自新投资人的本金。", en: "I kept the books. The truth, then — the platform never earned a real profit from day one. Every 'interest payment' to old investors came from new investors' principal." } },
          { who: "mu", text: { zh: "两套账：给监管看的那套有底层资产，真实的那套只有一个资金池——钱进来，一半付利息，一半听鲍总安排。", en: "Two sets of books: the regulator's version had underlying assets; the real one had only a cash pool — half of inflows paid interest, half went wherever Chairman Bao directed." } },
          { who: "mu", text: { zh: "崩盘前一周，鲍总让我把服务器硬盘和账册装进麻袋，埋到他小舅子的工地下面。挖出来的那 80 本，就是我埋的。", en: "A week before the collapse, Chairman Bao had me bag the server drives and ledgers and bury them at his brother-in-law's construction site. Those 80 books they dug up — I buried them." } },
        ],
        clue: { zh: "慕总监交代：平台从无真实盈利，全靠借新还旧维持资金池；埋账本是奉鲍总之命——他是做账和埋账的手，不是设局的人。", en: "CFO Mu confessed: no real profits ever — the cash pool survived on new-for-old money, and the ledgers were buried on Chairman Bao's orders. He was the hand that cooked and buried the books, not the one who built the trap." },
      },
      {
        id: "tong",
        dialog: [
          { who: "tong", text: { zh: "我是销售冠军，一年卖出 9 个亿。话术是公司统一培训的：「国资背景」「电视台都在播」「跑得了和尚跑不了庙」。", en: "I was top seller — 900 million in one year. The pitch was standard company training: 'state backing', 'it's on national TV', 'a temple this big can't run away'." } },
          { who: "tong", text: { zh: "提成 3 个点。可我自己也信了啊——我把自己 50 万积蓄和我妈的 30 万都投进去了，现在一分都取不出来。", en: "My commission was 3%. But I believed it myself — I put in my own 500k savings and my mother's 300k. Now I can't withdraw a cent." } },
          { who: "tong", text: { zh: "底层资产？培训的时候问过。经理说：「你只管卖，资产的事总部有人管。」", en: "The underlying assets? I asked in training. The manager said: 'You just sell. Headquarters handles the assets.'" } },
        ],
        clue: { zh: "佟金牌按话术卖出 9 个亿，但自己和母亲的 80 万也埋在里面——被骗局雇佣、又被骗局吞掉的推销员，不是设局者。", en: "Top Seller Tong moved 900 million on scripted pitches — with his own and his mother's 800k buried inside. Hired by the scam, then swallowed by it. Not the architect." },
      },
      {
        id: "hua",
        dialog: [
          { who: "hua", text: { zh: "我就是接了个代言。8000 万，念了三句广告词：「鑫富宝，安心宝，财富稳稳涨」。", en: "I took an endorsement deal. 80 million, three lines of copy: 'XinFuBao, peace of mind, wealth that steadily grows.'" } },
          { who: "hua", text: { zh: "资质？经纪人说平台证照齐全，还上过财经频道。我一个演员，怎么核实金融产品？", en: "Due diligence? My agent said the licenses were complete and it had been on the finance channel. I'm an actress — how do I verify a financial product?" } },
          { who: "hua", text: { zh: "现在骂我的人比骂鲍总的还多。代言费我退，官司我认。但设局的不是我。", en: "These days more people curse me than curse Chairman Bao. I'll return the fee, I'll face the lawsuits. But I didn't build the trap." } },
        ],
        clue: { zh: "华姐收 8000 万代言费为骗局镀了金，未尽核实义务要担责——但她接触不到资金池，也不知道底层资产是空的。", en: "Sister Hua's 80-million endorsement gilded the scam, and she'll answer for skipping due diligence — but she never touched the cash pool, nor knew the assets were hollow." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "看清这台机器：壳公司造「资产」，资金池收钱，新钱付旧息，明星镀金，销售扩散——而唯一知道全貌、唯一花掉这些钱的，只有一个人。", en: "See the machine whole: shell companies forge 'assets', the cash pool takes the money, new money pays old interest, a star gilds it, sellers spread it — and only one person saw the whole picture and spent the money." } },
      { who: "k", text: { zh: "庞氏骗局的定义只有一句话：收益不来自资产，来自下一个投资人的本金。指认设局的人。", en: "A Ponzi scheme is defined in one sentence: returns come not from assets, but from the next investor's principal. Name the architect." } },
    ],
    culprit: "bao",
    win: [
      { who: "k", text: { zh: "没错。鲍总用同一批公章造出 95% 的假借款人，700 亿在资金池里转了一圈：一半付利息稳住人心，一半变成游艇、庄园和埋进地下的账本。", en: "Correct. Chairman Bao forged 95% of the borrowers with one batch of seals. 70 billion cycled through the pool: half paid interest to keep the faith, half became yachts, estates, and ledgers buried underground." } },
      { who: "k", text: { zh: "识别庞氏骗局的三个信号：保本保息的承诺、看不见的底层资产、只进不出的资金池。三样占齐，跑！", en: "Three signals of a Ponzi: guaranteed principal and interest, invisible underlying assets, a cash pool that only takes in. All three present — run!" } },
      { who: "k", text: { zh: "记住这一课：无风险利率只有 2-3%。收益率超过 6% 要打问号，超过 8% 很危险，超过 10%——就要做好损失全部本金的准备。", en: "Remember the lesson: the risk-free rate is 2-3%. Above 6%, raise an eyebrow; above 8%, danger; above 10% — prepare to lose every cent of principal." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。做账的、卖单的、念广告的都是机器的零件。想想：钱最后变成了谁的游艇？账本埋在谁小舅子的工地？", en: "Wrong. The bookkeeper, the seller, the ad reader — parts of the machine. Think: whose yacht did the money become? Whose brother-in-law's site hid the ledgers?" } },
    ],
  },
  {
    id: "spoofing",
    title: { zh: "第九案 · 幽灵买单", en: "Case 9 · The Phantom Bids" },
    desc: { zh: "每天尾盘，买一到买五突然堆起巨量买单，股价应声上涨——可这些买单在成交前总会凭空消失。", en: "Every day near the close, massive bids pile onto the order book and the price jumps — yet the bids always vanish before they can fill." },
    award: { zh: "幌骗终结者", en: "Spoof Buster" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      zhen: { name: { zh: "甄总监", en: "Director Zhen" }, color: "--down" },
      mao: { name: { zh: "毛做市", en: "Mao the Market Maker" }, color: "--ma5" },
      yue: { name: { zh: "岳大户", en: "Whale Yue" }, color: "--up" },
      he: { name: { zh: "何工", en: "Engineer He" }, color: "--ma20" },
    },
    intro: [
      { who: "k", text: { zh: "「久禾科技」，一只平平无奇的中盘股。但最近二十个交易日，它的尾盘出了怪事。", en: "'Jiuhe Tech', an unremarkable mid-cap. But for twenty sessions now, strange things have happened at the close." } },
      { who: "k", text: { zh: "每天 14:40 之后，买一到买五突然堆起几千万的买单。散户一看：大资金进场了！追。股价被推高 2-3%。", en: "Every day after 14:40, tens of millions in bids stack up on the book. Retail sees it: big money is in! They chase. The price gets pushed up 2-3%." } },
      { who: "k", text: { zh: "可交易所数据显示：这些巨量买单的撤单率高达 99.7%——几乎一股都没真正买入。而第二天，股价总是低开。", en: "Yet exchange data shows a 99.7% cancellation rate on those giant bids — almost not a single share was actually bought. And the next day, the stock always opens lower." } },
      { who: "k", text: { zh: "有人在挂假单画图，引人接盘。这叫「幌骗」(Spoofing)。四个嫌疑人，链上数据不会撒谎。开始吧。", en: "Someone is painting the tape with fake orders, luring buyers in. It's called spoofing. Four suspects — the order data doesn't lie. Begin." } },
    ],
    suspects: [
      {
        id: "zhen",
        dialog: [
          { who: "zhen", text: { zh: "我是量化私募的交易总监。挂单撤单是算法的正常行为——行情变了，撤单调仓，天经地义。", en: "I'm the trading director of a quant fund. Placing and canceling orders is normal algorithmic behavior — conditions change, orders adjust. Perfectly routine." } },
          { who: "zhen", text: { zh: "99.7% 的撤单率怎么了？高频策略的撤单率本来就高。你们不懂技术就不要指手画脚。", en: "So what if the cancel rate is 99.7%? High-frequency strategies cancel most orders by design. Don't lecture me on technology you don't understand." } },
          { who: "zhen", text: { zh: "至于我们同时在卖出……组合再平衡而已。买卖两边都有单，很正常。", en: "As for our simultaneous selling... portfolio rebalancing, that's all. Orders on both sides of the book — completely normal." } },
        ],
        clue: { zh: "交易所定位：巨量买单全部来自甄总监名下的算法账户，且挂单价永远比买一低一档——刚好显示在盘口、又永远轮不到成交。同一时段，他的另一账户在卖一持续真实卖出。", en: "The exchange traced every phantom bid to Director Zhen's algo account — always one tick below the best bid: visible on the book, never first in line to fill. In the same minutes, his other account was genuinely selling at the ask." },
      },
      {
        id: "mao",
        dialog: [
          { who: "mao", text: { zh: "我是持牌做市商。我的职责就是双边挂单，给市场提供流动性——买卖两边都有我的单子，这是义务，不是嫌疑。", en: "I'm a licensed market maker. My job is quoting both sides — providing liquidity. Orders on both sides of my book are an obligation, not a crime." } },
          { who: "mao", text: { zh: "我的挂单是对称的：买卖各五档，每档数量差不多，全天稳定。尾盘那种单边几千万的堆单，不是做市行为。", en: "My quotes are symmetric: five levels each side, similar size, steady all day. A one-sided tens-of-millions pile at the close is not market making." } },
          { who: "mao", text: { zh: "说实话，那个幽灵买单害我亏了钱——我的算法把它当成真实需求，调高了报价。", en: "Honestly, those phantom bids cost me money — my algorithm read them as real demand and lifted my quotes." } },
        ],
        clue: { zh: "毛做市全天双边对称报价、单笔数量小且成交率正常，是幌骗的受害者之一——做市商的挂单模式和幌骗完全相反。", en: "Mao quoted symmetrically all day in small clips with a normal fill rate — one of the spoof's victims. A market maker's order pattern is the exact opposite of a spoofer's." },
      },
      {
        id: "yue",
        dialog: [
          { who: "yue", text: { zh: "我确实撤过单。上周挂了三笔大买单又撤了——因为我盯着盘口，看见那堆巨量买单，觉得有大资金抢筹，想挂高一点。", en: "I did cancel some orders. Three big bids last week — because I was watching the book, saw that giant pile of bids, figured big money was accumulating, and wanted to bid higher." } },
          { who: "yue", text: { zh: "后来我真金白银买进去了 2000 万，现在套着 8 个点。我是被那些假单骗进来的！", en: "Then I actually bought in — 20 million of real money. I'm down 8% now. Those fake bids lured me in!" } },
          { who: "yue", text: { zh: "我的撤单是改价重挂，撤一笔挂一笔，最后都成交了。跟那种挂了就跑的不一样。", en: "My cancels were re-pricing — cancel one, place another, and every one eventually filled. Nothing like orders placed only to vanish." } },
        ],
        clue: { zh: "岳大户撤单 3 笔但随后全部真实成交、实际买入 2000 万并被套——有真实交易意图的改单，和只挂不买的幌骗有本质区别。", en: "Whale Yue canceled three orders but re-placed and filled every one, ending up 20 million long and underwater — re-pricing with genuine intent to trade is fundamentally different from bids never meant to fill." },
      },
      {
        id: "he",
        dialog: [
          { who: "he", text: { zh: "我是交易所监察系统的工程师。是我先发现异常的：同一账户组，连续 20 天在 14:40-14:55 挂撤巨量买单。", en: "I'm an engineer on the exchange surveillance system. I flagged it first: the same account group, twenty straight days, placing and pulling giant bids between 14:40 and 14:55." } },
          { who: "he", text: { zh: "模式高度机械：挂单后平均存活 11 秒，从不成交；撤单后 3 秒内，关联账户在对手方向卖出。", en: "The pattern is machine-regular: bids live 11 seconds on average, never fill; within 3 seconds of each cancel, a linked account sells into the strength." } },
          { who: "he", text: { zh: "完整的账户对照表和时间戳我都带来了。谁的账户，一查便知。", en: "I've brought the full account mapping and timestamps. Whose accounts they are — one look will tell you." } },
        ],
        clue: { zh: "何工提供了关键证据链：幽灵买单存活 11 秒从不成交，撤单 3 秒内关联账户反向卖出——挂单方向和真实交易方向相反，正是幌骗的铁证。", en: "Engineer He supplied the key evidence: phantom bids lived 11 seconds and never filled, and within 3 seconds of each cancel a linked account sold the other way — orders opposite to the real trading direction, the signature of spoofing." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "把证据串起来：巨量买单只在尾盘出现、永远差一档不成交、11 秒撤单、撤后 3 秒关联账户反向卖出——挂单是画给你看的，卖出才是真实目的。", en: "String the evidence together: giant bids only at the close, always one tick from filling, canceled in 11 seconds, followed 3 seconds later by selling from a linked account — the bids were painted for your eyes; the selling was the real business." } },
      { who: "k", text: { zh: "幌骗的定义：以诱导他人交易为目的挂单、且无成交意图。谁的账户在挂假单、又在真卖出？指认他。", en: "Spoofing defined: placing orders to lure others into trading, with no intent to fill. Whose account posted the fake bids while genuinely selling? Name them." } },
    ],
    culprit: "zhen",
    win: [
      { who: "k", text: { zh: "正确。甄总监的算法账户挂出 99.7% 撤单率的幽灵买单，制造抢筹假象拉高股价，另一账户则在高位持续出货——教科书级的幌骗。", en: "Correct. Director Zhen's algo account posted phantom bids with a 99.7% cancel rate to fake a buying frenzy, while his other account distributed into the strength — textbook spoofing." } },
      { who: "k", text: { zh: "记住幌骗三要素：巨量挂单吸引眼球、无成交意图（撤单率极高、永远差一档）、真实交易在反方向。三样齐了，盘口就是画出来的。", en: "Remember the three marks of a spoof: eye-catching size, no intent to fill (extreme cancel rate, always a tick away), and real trading on the opposite side. All three present — the order book is a painting." } },
      { who: "k", text: { zh: "这一课：盘口挂单可以撤，成交记录不会骗人。判断资金方向，看真实成交，不看挂单表演。", en: "The lesson: orders can be canceled; the tape of actual fills cannot lie. To read the money's direction, watch real transactions, not order-book theater." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。再看一遍数据：谁的挂单从不成交？谁在撤单之后 3 秒真实卖出？对称报价的、改价成交的、提供证据的，都不是画图的人。", en: "Wrong. Look at the data again: whose bids never filled? Who sold for real 3 seconds after each cancel? The symmetric quoter, the re-pricer who filled, the one who brought the evidence — none of them painted the tape." } },
    ],
  },
  {
    id: "shortrumor",
    title: { zh: "第十案 · 匿名做空报告", en: "Case 10 · The Anonymous Short Report" },
    desc: { zh: "一份匿名做空报告让「恒芯半导体」单日暴跌 25%。报告里的银行流水截图，后来被证明是 PS 的。", en: "An anonymous short report crashed 'Hengxin Semi' 25% in a day. The bank statements in it were later proven photoshopped." },
    award: { zh: "谣言粉碎机", en: "Rumor Crusher" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      kang: { name: { zh: "康总", en: "CEO Kang" }, color: "--up" },
      bai: { name: { zh: "白析师", en: "Analyst Bai" }, color: "--ma5" },
      wen: { name: { zh: "温博主", en: "Blogger Wen" }, color: "--ma20" },
      zheng: { name: { zh: "郑前总", en: "Ex-CFO Zheng" }, color: "--down" },
    },
    intro: [
      { who: "k", text: { zh: "周二早上 9:15，一份 87 页的匿名报告在网上炸开：《恒芯半导体：一场精心包装的骗局》，指控其虚增收入 40%。", en: "Tuesday, 9:15 a.m. An 87-page anonymous report detonated online: 'Hengxin Semi: A Carefully Packaged Fraud', alleging 40% inflated revenue." } },
      { who: "k", text: { zh: "报告有模有样：内部邮件、银行流水截图、离职员工「实名」爆料。开盘后股价直线跳水，收盘暴跌 25%，市值蒸发 300 亿。", en: "It looked convincing: internal emails, bank statement screenshots, 'named' whistleblowers. The stock went straight down at the open — minus 25% by the close, 30 billion in market cap gone." } },
      { who: "k", text: { zh: "三天后，银行出具证明：报告里的流水截图是伪造的，PS 痕迹明显。但股价再也没回去。", en: "Three days later the bank certified it: the statement screenshots were forged — obvious edit traces. But the price never came back." } },
      { who: "k", text: { zh: "先说清楚一件事：看空、做空本身是合法的。但「编造虚假信息 + 提前建仓交易」是操纵市场。谁造的谣？开始吧。", en: "First, be clear: bearish views and short selling are legal. But 'fabricating false information + trading on it beforehand' is market manipulation. Who forged the report? Begin." } },
    ],
    suspects: [
      {
        id: "kang",
        dialog: [
          { who: "kang", text: { zh: "我是最大的受害者！我的身家全在公司股票里，跌 25% 我账面损失几十亿！", en: "I'm the biggest victim here! My entire net worth is in company stock — that 25% cost me billions on paper!" } },
          { who: "kang", text: { zh: "有人说我「自导自演砸盘吸筹」？我倒是想问：暴跌当天我一股都没买——增持公告是一周后才发的，那是护盘！", en: "Some say I 'staged it to buy back cheap'? Then explain: I bought nothing on crash day — the buyback notice came a week later. That was defending the stock!" } },
          { who: "kang", text: { zh: "报告里的「内部邮件」格式是三年前的旧模板，现在公司邮件早就换系统了。这说明写报告的人离开公司很久了。", en: "The 'internal emails' in the report use a template from three years ago — we changed systems long since. Whoever wrote it left the company years ago." } },
        ],
        clue: { zh: "康总在暴跌当天及前后均无卖出或买入记录，损失真实存在；他指出的线索很关键——报告用的内部模板是三年前的旧版。", en: "CEO Kang neither bought nor sold around the crash, and his losses are real. His observation matters: the report's internal template is the three-year-old version." },
      },
      {
        id: "bai",
        dialog: [
          { who: "bai", text: { zh: "我是职业做空研究员，确实发过看空恒芯的报告——署名的、上个月、目标价下调 20%，逻辑是行业库存周期。", en: "I'm a professional short-side researcher, and yes, I published a bearish note on Hengxin — signed, last month, 20% price-target cut, based on the industry inventory cycle." } },
          { who: "bai", text: { zh: "我做空前公开披露持仓，报告里每个数据都有出处。这是合法的做空研究，跟那份 PS 流水的匿名报告是两回事。", en: "I disclose my short positions before publishing, and every number in my work is sourced. That's legitimate short research — nothing like an anonymous report with photoshopped statements." } },
          { who: "bai", text: { zh: "说难听点，那份假报告砸了我们全行业的招牌。以后谁还信真正的做空研究？", en: "Frankly, that fake report wrecked the reputation of my whole profession. Who will trust real short research now?" } },
        ],
        clue: { zh: "白析师的看空报告实名、注明持仓、数据有出处——合法做空研究的三个特征齐全；匿名报告发布时段他的持仓没有变动。", en: "Analyst Bai's bearish note was signed, position-disclosed, and fully sourced — all three marks of legitimate short research. His positions didn't move when the anonymous report dropped." },
      },
      {
        id: "wen",
        dialog: [
          { who: "wen", text: { zh: "我就是转发了一下！报告又不是我写的，我一个财经博主，看到猛料当然要第一时间发给粉丝。", en: "I only reposted it! I didn't write the report — I'm a finance blogger, of course I push hot material to my followers first." } },
          { who: "wen", text: { zh: "好吧……转发那条我收了 20 万「推广费」。钱是一家离岸公司打的，对接人只有一个微信号，现在已经注销了。", en: "Fine... I took 200k in 'promotion fees' for that repost. Paid by an offshore company; my only contact was a chat account that's since been deleted." } },
          { who: "wen", text: { zh: "但我只负责扩散！报告的内容、里面的流水截图，我碰都没碰过。我发的时候它已经在网上了。", en: "But I only amplified it! The content, the bank screenshots — I never touched them. It was already online when I posted." } },
        ],
        clue: { zh: "温博主收 20 万推广费扩散谣言、要承担传播责任，但资金来自离岸壳公司、报告发布前他并不知情——他是喇叭，不是写手。", en: "Blogger Wen took 200k from an offshore shell to amplify the rumor and will answer for spreading it — but he knew nothing before publication. He was the megaphone, not the author." },
      },
      {
        id: "zheng",
        dialog: [
          { who: "zheng", text: { zh: "我三年前从恒芯离职，跟公司早没有往来。看空报告？网上那么多人看空，怎么就查到我头上？", en: "I left Hengxin three years ago — no contact since. The short report? Half the internet is bearish, why come to me?" } },
          { who: "zheng", text: { zh: "旧邮件模板？离职员工谁手里没几封旧邮件。这能说明什么？", en: "The old email template? Every ex-employee has old emails lying around. What does that prove?" } },
          { who: "zheng", text: { zh: "我表弟的账户融券卖出？他成年人，自己炒股，跟我有什么关系。时间巧合而已。", en: "My cousin's account selling short? He's a grown man trading his own money. Nothing to do with me. A coincidence of timing." } },
        ],
        clue: { zh: "报告内嵌文档的作者信息指向郑前总的旧笔记本；他表弟的账户在报告发布前两天融券卖出 8000 万，发布当天全部买券还券平仓获利离场。", en: "Metadata in the report's embedded files points to Ex-CFO Zheng's old laptop. Two days before publication, his cousin's account shorted 80 million via margin — and covered the entire position at a profit on crash day." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "整理时间线：报告用三年前的内部模板和旧笔记本写成，发布前两天关联账户融券建空仓，发布当天暴跌平仓获利，离岸壳公司花钱雇喇叭扩散。", en: "The timeline: a report written on an old laptop with a three-year-old internal template; a linked account building a short via margin two days before release; the position covered at a profit on crash day; an offshore shell paying the megaphone." } },
      { who: "k", text: { zh: "记住：看空是权利，造谣是犯罪。编造虚假信息 + 提前反向建仓 = 操纵市场。谁既写了假报告、又赚了这笔钱？", en: "Remember: a bearish view is a right; fabrication is a crime. False information plus a pre-built opposite position equals market manipulation. Who wrote the fake and pocketed the profit?" } },
    ],
    culprit: "zheng",
    win: [
      { who: "k", text: { zh: "正确。郑前总用离职时带走的旧模板和旧邮件伪造「内幕材料」，PS 银行流水，提前让表弟的账户融券做空 8000 万，一份假报告净赚两千万。", en: "Correct. Ex-CFO Zheng forged 'insider material' from templates and emails he took when he left, photoshopped the bank statements, and had his cousin's account short 80 million in advance — one fake report, 20 million in profit." } },
      { who: "k", text: { zh: "分清两件事：白析师那样实名、披露持仓、数据有出处的看空研究是市场的免疫系统；匿名、造假、藏仓位的「报告」是投毒。", en: "Keep two things apart: signed, position-disclosed, fully sourced short research like Analyst Bai's is the market's immune system; anonymous, forged, position-hiding 'reports' are poison." } },
      { who: "k", text: { zh: "这一课：遇到惊悚报告先查三样——作者是否实名、证据可否验证、发布前有没有异常空单。三样都不过关的，先别急着割肉。", en: "The lesson: when a shock report drops, check three things — is the author named, can the evidence be verified, were there unusual short positions beforehand. If all three fail, don't rush to sell at the bottom." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。想想谁「既有旧模板、又有动机、还提前建了空仓」。真受害的、实名看空的、收钱转发的，都构不成完整的证据链。", en: "Wrong. Think: who had the old template, the motive, AND the pre-built short position? The real victim, the signed bear, the paid reposter — none of them completes the chain of evidence." } },
    ],
  },
  {
    id: "bondrat",
    title: { zh: "第十一案 · 消失的票息（地狱）", en: "Case 11 · The Vanished Coupon (Brutal)" },
    desc: { zh: "债基年年跑输基准两个点，钱顺着看不见的管道流走——这案子，表面答案都是错的", en: "A bond fund trails its benchmark by two points every year while the money drains through an invisible pipe. In this case, every obvious answer is wrong." },
    award: { zh: "债市捕鼠人", en: "Bond Rat Catcher" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      yan: { name: { zh: "严经理", en: "Manager Yan" }, color: "--down" },
      du: { name: { zh: "杜交易员", en: "Trader Du" }, color: "--ma20" },
      fu: { name: { zh: "付老板", en: "Boss Fu" }, color: "--up" },
      qiao: { name: { zh: "乔中介", en: "Broker Qiao" }, color: "--ma5" },
      shen: { name: { zh: "沈风控", en: "Risk Chief Shen" }, color: "--warn" },
    },
    intro: [
      { who: "k", text: { zh: "瑞安债券基金，持仓全是利率债和高等级信用债，按说躺着也能赚票息——可它连续三年跑输基准两个百分点。", en: "Ruian Bond Fund holds nothing but government paper and top-grade credit. It should earn its coupons in its sleep — yet it has trailed its benchmark by two points, three years running." } },
      { who: "k", text: { zh: "监管拉了全部成交回看：这只基金总是「低卖高买」——把债券便宜卖给同一批对手方，隔几天再加价买回来。差价一年一个多亿，全流进了一个开在农信社的「丙类户」。", en: "The regulator replayed every trade: this fund keeps selling low and buying high — offloading bonds cheap to the same counterparties, then buying them back days later at a premium. The spread, over a hundred million a year, all drained into a 'Class-C account' at a rural credit union." } },
      { who: "k", text: { zh: "债市没有大厅没有散户，全是电话和聊天框里的一对一成交——这叫银行间市场。管道里的钱怎么流，只有摸过管道的人知道。", en: "The bond market has no trading floor and no retail crowd — just one-on-one deals cut over phones and chat windows. That's the interbank market. Only those with their hands on the pipe know how the money flows." } },
      { who: "k", text: { zh: "五个人围着这条管道。提醒你一句：这个案子，第一眼看到的答案都是错的。", en: "Five people surround this pipe. Fair warning: in this case, the first answer you see is the wrong one." } },
    ],
    suspects: [
      {
        id: "yan",
        dialog: [
          { who: "yan", text: { zh: "我是基金经理，我只管定策略：久期多长、仓位多重、买哪类券。每一笔都有投决纪要。", en: "I'm the fund manager. I set strategy — duration, weighting, which sectors. Every decision has committee minutes." } },
          { who: "yan", text: { zh: "丙类户的户主付老板？……我认识。大学同学群里加的，吃过两次饭。这能说明什么？", en: "Boss Fu, the Class-C account holder? ...I know him. Added from a college alumni group, two dinners together. What does that prove?" } },
          { who: "yan", text: { zh: "成交价格？我的指令单只写「卖出某券 5000 万」，从来不填价格——市场价多少就多少，具体是交易室谈的。", en: "The prices? My order tickets say 'sell 50 million of bond X' — never a price. It fills at market, negotiated by the dealing desk." } },
        ],
        clue: { zh: "严经理和丙类户户主付老板是大学同学，动机链看着完美——但他的指令单上从来没有价格栏，「低卖高买」的价差不是他填出来的。", en: "Manager Yan and account-holder Boss Fu are college classmates — the motive chain looks perfect. But his tickets never carry a price field: the sell-low-buy-high spread wasn't written by his hand." },
      },
      {
        id: "du",
        dialog: [
          { who: "du", text: { zh: "我就是个执行的。经理让卖我就卖，让买我就买，十年了没出过一次差错。", en: "I just execute. The manager says sell, I sell; says buy, I buy. Ten years without a single error." } },
          { who: "du", text: { zh: "成交价偏离估值？银行间市场一对一谈价，偏个一两百个基点很正常，流动性不好嘛。", en: "Deviations from valuation? Interbank prices are negotiated one-on-one. A hundred, two hundred basis points off is normal — liquidity is thin." } },
          { who: "du", text: { zh: "付老板我不熟，就是乔中介介绍的一个对手方。我们交易室和客户，隔着防火墙呢。", en: "I barely know Boss Fu — just a counterparty Broker Qiao introduced. There's a firewall between the desk and clients." } },
        ],
        clue: { zh: "指令单上没有价格，价格是杜交易员谈的——和丙类户的每笔成交都「恰好」偏离中债估值 200 个基点，方向永远对丙类户有利。另查：付老板公司的监事，登记名字是杜交易员的配偶。", en: "The tickets carry no price — Trader Du negotiates it. Every trade with the Class-C account deviates from the official valuation by 'exactly' 200 basis points, always in the account's favor. One more finding: the registered supervisor of Boss Fu's company is Trader Du's spouse." },
      },
      {
        id: "fu",
        dialog: [
          { who: "fu", text: { zh: "我做建材生意的，债券？看不懂哟。账户是朋友说「走走量，一年给你六十万好处费」才开的。", en: "I'm in building materials. Bonds? Can't read them. A friend said 'let some volume pass through, sixty grand a year for your trouble' — so I opened the account." } },
          { who: "fu", text: { zh: "哪个朋友？乔中介牵的线。钱进来又出去，我一分没动过，密码都不在我手里。", en: "Which friend? Broker Qiao made the introduction. Money comes in, money goes out — I never touched a cent. I don't even hold the password." } },
          { who: "fu", text: { zh: "公司监事？那是我表妹夫家的……哎呀记不清了，注册的事都是代办的。", en: "My company's supervisor? That's my cousin-in-law's... ah, I forget. The registration was all done by an agent." } },
        ],
        clue: { zh: "付老板是「人头」：收固定好处费出借账户，密码不在手、资金没碰过——和闪崩案里的马阿姨一样，是管道的壳，不是管道的手。", en: "Boss Fu is a straw man: a flat fee to lend his name, no password, never touched the funds — like Auntie Ma in the flash-crash case, he's the pipe's shell, not the hand on the valve." },
      },
      {
        id: "qiao",
        dialog: [
          { who: "qiao", text: { zh: "我是货币中介，搓合成交收佣金，天经地义。那几笔单子是我报的价没错——但价格是交易员口述给我的！", en: "I'm a money broker — matching trades for commission is the whole job. Yes, I quoted those deals — but the prices were dictated to me by the trader!" } },
          { who: "qiao", text: { zh: "介绍付老板开户也是我，介绍严经理进同学群也是我。牵线搭桥，中介不就干这个的吗？", en: "I introduced Boss Fu's account, and yes, I also got Manager Yan into that alumni chat group. Making connections — that's literally the job description." } },
          { who: "qiao", text: { zh: "每笔我抽千分之一「辛苦费」，走的我女朋友账户……这个，算我合作态度好，主动交代的啊。", en: "I skim one-tenth of a percent 'hardship fee' per trade, routed through my girlfriend's account... look, I'm volunteering this. Cooperation, noted?" } },
        ],
        clue: { zh: "乔中介是润滑剂：报价是替人传话，抽成是小鱼小虾。注意他交代的细节——把严经理拉进同学群、认识付老板，两头的「巧合」都是他安排的。有人在借他的手，给严经理「画」一条动机链。", en: "Broker Qiao is the lubricant: quotes relayed for others, skim money small fry. But note his detail — he planted Yan in the alumni group AND introduced Boss Fu. Both 'coincidences' were arranged. Someone used his hands to paint a motive chain pointing at Manager Yan." },
      },
      {
        id: "shen",
        dialog: [
          { who: "shen", text: { zh: "偏离估值的成交，系统每周都出预警报表。我……签过字，备注「流动性原因，可解释」。", en: "Off-valuation trades trigger a weekly exception report. I... signed them off. Noted 'explainable — liquidity conditions'." } },
          { who: "shen", text: { zh: "连续三年、同一批对手方、方向永远一边倒，我不是没起过疑心。但交易室说「债市惯例如此」，我就信了。", en: "Three years, the same counterparties, deviations always one-way — I had my doubts. But the desk said 'that's just how bond markets work', and I believed it." } },
          { who: "shen", text: { zh: "我失职，我认。但我一分钱没拿过——你们可以查我所有账户。", en: "Dereliction, yes, I own that. But I never took a cent — audit every account I have." } },
        ],
        clue: { zh: "沈风控连续三年在预警报表上签「可解释」，是睡着的哨兵——失职该罚，但他不碰成交、不碰资金，构不成利益输送的那只手。", en: "Risk Chief Shen signed 'explainable' on three years of warnings — a sentry asleep at his post. Punishable negligence, but he touched neither trades nor funds. His is not the hand that moved the money." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "这案子有两条链。明链：基金经理认识户主，同学关系，动机完美——但他的指令单从来不带价格。暗链：有人能决定每一笔「卖多便宜、买多贵」，而户主公司的监事栏里，写着一个耐人寻味的名字。", en: "Two chains run through this case. The bright one: the fund manager knows the account holder, old classmates, a perfect motive — but his tickets never carry a price. The dark one: someone decided exactly how cheap each sale and how dear each buyback would be — and the supervisor line of the holder's company bears a very interesting name." } },
      { who: "k", text: { zh: "记住利益输送的铁律：动机可以伪造，关系可以安排，但价差只会流向定价的那只手。别被「谁认识谁」带偏——问「谁定的价」。指认吧。", en: "Remember the iron law of tunneling: motives can be forged and relationships arranged, but the spread only ever flows to the hand that sets the price. Don't follow 'who knows whom' — ask 'who set the price'. Make the call." } },
    ],
    culprit: "du",
    win: [
      { who: "k", text: { zh: "没错。十年「零差错」的杜交易员才是管道的主人：指令单不带价格，每一笔和丙类户的成交价都由他谈——低卖 200 个基点、高买 200 个基点，价差落进挂在付老板名下、监事是他配偶的壳公司。", en: "Correct. Trader Du, ten years of 'flawless execution', owned the pipe: the tickets carried no price, so every deal with the Class-C account filled at HIS number — 200 basis points low on the way out, 200 high on the way back, the spread landing in a shell held in Boss Fu's name with Du's spouse as supervisor." } },
      { who: "k", text: { zh: "最毒的一步是他借乔中介的手布置烟雾弹：把严经理拉进同学群、安排两顿饭，给监管递上一条现成的「动机链」。真正的老鼠，往往躲在你第一眼怀疑的人身后。", en: "His most venomous move: using Broker Qiao to lay the smoke screen — planting Manager Yan in the alumni group, arranging two dinners, handing the regulator a ready-made 'motive chain'. The real rat hides behind the person you suspect first." } },
      { who: "k", text: { zh: "这一课：债市的钱不响，利益输送全在成交价的小数点里。查案如此，买基金也如此——别只看谁挂名，要看谁定价。", en: "The lesson: bond-market money makes no sound — tunneling lives in the decimals of the fill price. True for investigations, true for picking funds: don't ask whose name is on it, ask who sets the price." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。你顺着「谁认识谁」走进了别人铺好的路。回到铁律：价差只会流向定价的那只手——这五个人里，谁有权写下每一笔的成交价？", en: "Wrong. You followed 'who knows whom' straight down a road someone paved for you. Back to the iron law: the spread flows only to the hand that sets the price. Of these five — who had the power to write the fill on every ticket?" } },
    ],
  },
  {
    id: "lasteight",
    title: { zh: "第十二案 · 最后八分钟（地狱）", en: "Case 12 · The Final Eight Minutes (Brutal)" },
    desc: { zh: "收盘前八分钟的天量卖单砸穿结算价——下单的账户，户主们根本不知情", en: "A monster sell order crushed the settlement price in the last eight minutes — and the accounts that placed it didn't know they did" },
    award: { zh: "尾盘守门人", en: "Closing Bell Warden" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      guan: { name: { zh: "关总", en: "Boss Guan" }, color: "--down" },
      lu: { name: { zh: "卢总监", en: "Director Lu" }, color: "--up" },
      deng: { name: { zh: "小邓", en: "Deng" }, color: "--ma20" },
      fei: { name: { zh: "费经理", en: "Manager Fei" }, color: "--warn" },
      yanj: { name: { zh: "言记者", en: "Reporter Yan" }, color: "--ma5" },
    },
    intro: [
      { who: "k", text: { zh: "国债期货主力合约，收盘前八分钟突然涌出天量卖单，结算价被砸低了 1.2 元。别小看这 1.2 元——按这个结算价，重仓多头今晚就要被追缴保证金。", en: "Eight minutes before the close, a monster sell order flooded the lead bond-futures contract and knocked the settlement price down 1.2 yuan. Don't scoff at 1.2 yuan — at that settlement, heavy longs face margin calls tonight." } },
      { who: "k", text: { zh: "卖单来自三个长期不动的「套保户」。交易所连夜核查：三个户主都说，自己根本没下过这笔单。", en: "The orders came from three long-dormant 'hedging accounts'. The exchange checked overnight: all three holders swear they never placed them." } },
      { who: "k", text: { zh: "有人借了别人的手砸盘。五个人在名单上——注意，最想砸盘的那个人，未必砸得动。", en: "Someone borrowed other hands to smash the close. Five names on the list — and mind you, the one who most wanted it down may not have been able to do it." } },
    ],
    suspects: [
      {
        id: "guan",
        dialog: [
          { who: "guan", text: { zh: "我是空头没错，我天天盼它跌！但盼归盼——我上周爆过一次仓，保证金早被冻结了，我连一手都开不出来。", en: "Yes I'm short, and yes I pray for it to fall daily! But praying is all I can do — I blew up last week, my margin is frozen, I can't open a single lot." } },
          { who: "guan", text: { zh: "收盘那八分钟我在直播间骂行情，几千人看着呢，录像你们自己调。", en: "During those eight minutes I was ranting on a livestream with thousands watching. Pull the recording yourselves." } },
        ],
        clue: { zh: "关总动机最足——结算价砸低直接救他的空头仓。但他的账户保证金当日全程冻结，技术上下不了单，直播记录也坐实了人不在场。", en: "Boss Guan has the fattest motive — a lower settlement directly rescues his shorts. But his margin was frozen all day: technically unable to place an order, and the livestream confirms his whereabouts." },
      },
      {
        id: "lu",
        dialog: [
          { who: "lu", text: { zh: "我们是多头，今晚要被追保的就是我们！我像是会砸自己仓位的人吗？", en: "We're the LONGS — we're the ones facing margin calls tonight! Do I look like someone who'd smash his own book?" } },
          { who: "lu", text: { zh: "不过有件事……砸盘前半小时，言记者发了篇「传闻某机构巨亏」的稿子，点名的就是我们。消息是谁喂给他的？", en: "One thing though... half an hour before the smash, Reporter Yan ran a 'rumored massive loss at an institution' piece — naming us. Who fed him that?" } },
        ],
        clue: { zh: "卢总监的机构是砸盘的直接受害者。他指出关键时间线：砸盘前半小时，先有一篇配合造势的「巨亏传闻」稿。", en: "Director Lu's firm is the smash's direct victim. He flags the key timeline: half an hour before the orders, a 'massive loss' rumor piece set the stage." },
      },
      {
        id: "deng",
        dialog: [
          { who: "deng", text: { zh: "我就是席位上管结算和账户维护的，工资八千，哪有本事搅动结算价。", en: "I just handle settlement and account maintenance at the seat. Eight grand a month — how would I move a settlement price?" } },
          { who: "deng", text: { zh: "套保户的交易密钥？是放在我这保管……但用密钥下单要配合复核的呀，流程上有两道关。", en: "The hedging accounts' trading keys? Yes, they're kept with me... but orders need a second review. Two checkpoints, by procedure." } },
          { who: "deng", text: { zh: "我最近是买了辆车，二十多万。我……我炒股赚的，不行吗？", en: "Yes, I recently bought a car, two hundred grand plus. I... made it trading stocks. Is that a crime?" } },
        ],
        clue: { zh: "小邓保管着休眠套保户的交易密钥，而「第二道复核」恰好在那天「系统维护」停用。另查：砸盘前三天，一个新开的个人账户建了大笔空单，开户营业部就在小邓住处楼下。", en: "Deng keeps the dormant accounts' trading keys — and the 'second review' happened to be down for 'system maintenance' that day. Also: three days before the smash, a newly opened personal account built a large short position, at a branch right below Deng's apartment." },
      },
      {
        id: "fei",
        dialog: [
          { who: "fei", text: { zh: "超限单是我放行的，我认。但单子带着「套保」标识，套保额度本来就宽，流程上我没违规。", en: "I waved the oversized orders through, I admit it. But they carried the hedging flag, and hedging limits are generous. By the book, I broke no rule." } },
          { who: "fei", text: { zh: "要说不对劲——三个休眠两年的户头同一分钟激活下单，我当时确实犹豫了一下。就一下。", en: "What DID feel off — three accounts dormant for two years, all activating in the same minute. I hesitated. For one second." } },
        ],
        clue: { zh: "费经理放行了异常单，是睡着的闸门——失职，但他既不掌握密钥，也没有关联获利账户。", en: "Manager Fei waved the anomaly through — a sleeping gate. Negligent, but he held no keys and no linked profiting account." },
      },
      {
        id: "yanj",
        dialog: [
          { who: "yanj", text: { zh: "稿子是我写的，信源是个匿名邮件，附了几张看着挺真的持仓截图。我核实过……呃，我给对方回了邮件确认，对方确认了。", en: "I wrote the piece. The source was an anonymous email with convincing-looking position screenshots. I verified it... that is, I emailed the sender back, and the sender confirmed." } },
          { who: "yanj", text: { zh: "发稿时间是对方指定的「下午两点半前」，说过时效性就没了。现在想想……是有点怪。", en: "The sender specified 'before 2:30 pm', said it would go stale otherwise. In hindsight... that is a little odd." } },
        ],
        clue: { zh: "言记者被当成了扩音器：匿名邮件、伪造截图、指定发稿时间——造势的人要的就是砸盘前那半小时的恐慌。邮件经溯源来自一个网吧，监控拍到的人戴着口罩，身形瘦小。", en: "Reporter Yan was used as a megaphone: anonymous email, forged screenshots, a dictated publication time — the planner wanted exactly that half hour of fear. The email traces to an internet café; the camera shows a masked, slight figure." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "拼图：最想砸盘的人下不了单；被砸的人在喊冤；放行的人只是睡着了；发稿的人是枚棋子。剩下的问题只有一个——三个休眠户的密钥在谁手里，复核为什么恰好那天停用，楼下营业部那个新空单账户又是谁的。", en: "The pieces: the man who most wanted the smash couldn't trade; the victim is crying foul; the gatekeeper merely slept; the reporter was a pawn. One question remains — who held the dormant keys, why was the review down that exact day, and whose new short account sits below whose apartment." } },
      { who: "k", text: { zh: "操纵结算价不需要最大的动机，只需要一把能打开别人账户的钥匙。指认吧。", en: "Rigging a settlement doesn't take the biggest motive — just a key to someone else's account. Make the call." } },
    ],
    culprit: "deng",
    win: [
      { who: "k", text: { zh: "没错。月薪八千的小邓才是全案唯一同时握有「账户钥匙、复核开关、获利仓位」的人：先用新账户建空单，再伪造邮件借记者造势，最后在复核「维护」的窗口里用三个休眠户的密钥砸出天量卖单。", en: "Correct. Deng, on eight grand a month, was the only one holding all three: the account keys, the review switch, and a profiting position. First the new short account, then the forged email to arm the reporter, then — in the review's 'maintenance' window — the dormant keys unleashed the monster sell." } },
      { who: "k", text: { zh: "动机最大的关总反而是清白的——他连下单资格都没有。查操纵案，别问「谁最想」，要问「谁最能」。", en: "Boss Guan, with the fattest motive, was clean — he couldn't even place an order. In manipulation cases, don't ask who wanted it most. Ask who COULD." } },
      { who: "k", text: { zh: "这一课：权限比动机危险。离钱最近的位置，往往工资最低、监督最少。", en: "The lesson: access is more dangerous than motive. The seat closest to the money often has the lowest salary — and the least supervision." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。动机最大的人未必砸得动，被砸的人不会砸自己。问一句：下单要密钥，密钥在谁手里？", en: "Wrong. The biggest motive couldn't trade, and the victim wouldn't smash himself. Ask one thing: orders need keys — who held them?" } },
    ],
  },
  {
    id: "facelift",
    title: { zh: "第十三案 · 净值美容师（地狱）", en: "Case 13 · The NAV Beautician (Brutal)" },
    desc: { zh: "季末最后半小时，五只票同时诡异拉升——冲排名的嫌疑人反而是干净的", en: "Five stocks spiked in the quarter's last half hour — and the suspect with the ranking motive is the clean one" },
    award: { zh: "卸妆专家", en: "Makeup Remover" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      ji: { name: { zh: "季经理", en: "Manager Ji" }, color: "--down" },
      mu: { name: { zh: "穆经理", en: "Manager Mu" }, color: "--ma20" },
      xiaoc: { name: { zh: "小蔡", en: "Cai" }, color: "--ma5" },
      pan: { name: { zh: "潘总监", en: "Director Pan" }, color: "--up" },
      bo: { name: { zh: "博主老魏", en: "Blogger Wei" }, color: "--warn" },
    },
    intro: [
      { who: "k", text: { zh: "季度最后一个交易日，收盘前半小时，五只流动性一般的票被连续大买单拉了 4% 到 7%，次日全部跌回原形。", en: "Last trading day of the quarter, final half hour: five illiquid names got walked up 4-7% by relentless buy orders. Next morning, all five fell right back." } },
      { who: "k", text: { zh: "买单来自鸿远基金公司的公募产品。尾盘拉自家重仓股冲净值排名——这叫「做收盘价」，监管的老熟人了。", en: "The orders came from Hongyuan Fund's public mutual products. Marking up your own holdings to dress the quarter-end NAV — 'banging the close', an old friend of regulators." } },
      { who: "k", text: { zh: "但这案子有个疙瘩：拉的五只票里，有四只公募只拿着不痛不痒的底仓。替别人的仓位抬轿子？查查轿子里坐的是谁。", en: "But here's the knot: of the five names, the public funds held only token positions in four. Who dresses up SOMEONE ELSE'S book? Find out who was riding in the sedan chair." } },
    ],
    suspects: [
      {
        id: "ji",
        dialog: [
          { who: "ji", text: { zh: "我管公募，季末排名压力是大，但我疯了才去拉这五只票——四只我仓位不到 1%，拉上天对我净值也没影响。", en: "I run the public funds. Yes, quarter-end ranking pressure is real — but I'd be insane to mark up these five. In four of them I hold under 1%; the spike barely moves my NAV." } },
          { who: "ji", text: { zh: "下单指令？季末那天我在外地路演，手机信号都时断时续。回来才知道交易室按一份「重点关注清单」加了仓。", en: "The orders? I was on a roadshow out of town that day with patchy signal. Only on return did I learn the desk had bought along a 'priority watch list'." } },
        ],
        clue: { zh: "季经理有冲排名的动机，但拉的票对他的净值几乎没贡献，人也在外地。他提到一份来路不明的「重点关注清单」——清单是谁递进交易室的？", en: "Manager Ji has the ranking motive, but the marked-up names barely touch his NAV, and he was away. He mentions a 'priority watch list' of unclear origin — who slipped it to the desk?" },
      },
      {
        id: "mu",
        dialog: [
          { who: "mu", text: { zh: "我管专户，服务几个大客户，和公募隔着墙呢。他们拉什么票，关我什么事？", en: "I run the separate accounts for a few big clients. There's a wall between us and the public funds. What they buy is none of my business." } },
          { who: "mu", text: { zh: "那份清单？投研共享很正常，我只是把看好的票同步给投研平台，谁都能看。", en: "That list? Research sharing is routine. I merely posted names I liked to the research platform — anyone can read it." } },
          { who: "mu", text: { zh: "我专户季末确实赎回了一批……客户自己的决定，时点巧合而已。", en: "Yes, my accounts did see redemptions at quarter-end... the clients' own decisions. The timing is coincidence." } },
        ],
        clue: { zh: "五只被拉的票全是穆经理专户的重仓股，重合度 95%。更要命的时序：拉升当天尾盘，他的专户按被拉高的收盘价集中赎回离场——公募的钱抬轿，他的客户下轿。", en: "All five marked-up names are heavy positions in Manager Mu's separate accounts — 95% overlap. Deadlier still, the sequence: his accounts redeemed en masse that very close, priced at the inflated marks. Public money lifted the chair; his clients stepped off it." },
      },
      {
        id: "xiaoc",
        dialog: [
          { who: "xiaoc", text: { zh: "单是我下的。尾盘集中买、只买不卖、专挑流动性差的时段——我知道难看，但指令链是完整的。", en: "I placed the orders. Concentrated at the close, buy-only, in the thinnest liquidity — I know how it looks, but the instruction chain is intact." } },
          { who: "xiaoc", text: { zh: "依据就是那份「重点关注清单」，走的内部投研系统，签发人栏……是空的，但平台消息是穆经理的账号推送的。", en: "The basis was the 'priority watch list' on the internal research system. The issuer field... was blank. But the platform notification came from Manager Mu's account." } },
        ],
        clue: { zh: "小蔡只是执行，没有任何获利关联。他提供了关键电子痕迹：清单由穆经理的内部账号推送，签发人栏被刻意留空。", en: "Cai merely executed, with no profiting link. But he supplies the key digital trace: the list was pushed from Mu's internal account, its issuer field deliberately blank." },
      },
      {
        id: "pan",
        dialog: [
          { who: "pan", text: { zh: "我管销售，季末排名好看，我的奖金才好看，这我不否认。", en: "I run sales. A pretty quarter-end ranking means a pretty bonus for me — I won't deny that." } },
          { who: "pan", text: { zh: "但我连交易系统的门都摸不着。我顶多……催过季经理「季末冲一冲」。催一催也有罪吗？", en: "But I can't even touch the trading system. At most I... urged Manager Ji to 'push a little' at quarter-end. Is urging a crime now?" } },
        ],
        clue: { zh: "潘总监嗓门大、动机明显，但没有下单权限，拉的票也和销售奖金测算基本无关——是个好用的烟雾弹。", en: "Director Pan is loud and visibly motivated, but holds no trading access, and the marked-up names barely affect his bonus math — a convenient smokescreen." },
      },
      {
        id: "bo",
        dialog: [
          { who: "bo", text: { zh: "我季末那天发了条「鸿远系资金异动，五股尾盘有戏」，怎么，分析盘面也犯法？", en: "Yes, I posted 'Hongyuan money on the move, watch five names into the close' that day. Since when is reading the tape illegal?" } },
          { who: "bo", text: { zh: "消息源？一个粉丝私信给我的「内部消息」，我看他说得有鼻子有眼就发了。账号现在注销了，找不到人。", en: "My source? A follower DM'd me 'inside info', and it sounded detailed enough to post. The account has since been deleted. Untraceable." } },
        ],
        clue: { zh: "老魏的帖子把散户的跟风盘引了进来，给尾盘拉升做了放大器。爆料私信的注册手机号是张虚拟卡——又一枚被人使用的棋子。", en: "Wei's post funneled retail followers in, amplifying the close. The tipster DM came from a burner number — another pawn in someone's hand." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "看这台戏的分工：公募的钱出力拉抬，销售的嗓门做烟雾，博主的帖子引散户，交易员的手只是工具。而幕布后面，专户的重仓按拉高的价格精准离场。", en: "See the casting: public money did the lifting, the sales director's noise made the smoke, the blogger herded retail in, the trader's hands were mere tools. And behind the curtain, the separate accounts exited heavy positions at the inflated marks." } },
      { who: "k", text: { zh: "尾盘操纵案，别只问「谁想排名好看」——要问「谁的钱在拉高的价格上落袋了」。指认吧。", en: "In a banging-the-close case, don't just ask who wanted a pretty ranking — ask whose money cashed out at the inflated price. Make the call." } },
    ],
    culprit: "mu",
    win: [
      { who: "k", text: { zh: "没错。穆经理用一份匿名「重点关注清单」借公募的钱拉高自己专户的重仓股，再让客户在虚高的收盘价上集中赎回——公募基民出钱抬轿，他的大客户稳稳下轿，他收业绩报酬。", en: "Correct. With one anonymous 'watch list', Manager Mu used public-fund money to mark up his own accounts' heavy holdings, then redeemed his clients out at the inflated close — mutual-fund holders paid for the sedan chair, his big clients stepped off it, and he collected the performance fee." } },
      { who: "k", text: { zh: "最有排名动机的季经理反而是受害者：他的基民买了别人的单。利益输送案里，动机喊得最响的人，往往只是舞台上的道具。", en: "Manager Ji, with the loudest ranking motive, was in fact a victim — his holders footed someone else's bill. In tunneling cases, the loudest motive on stage is often just a prop." } },
      { who: "k", text: { zh: "这一课：看懂一笔异常拉升，盯住两个时间戳——谁在拉之前布的局，谁在拉之后的高位走的货。", en: "The lesson: to read an anomalous markup, watch two timestamps — who set the board before the lift, and who walked out at the top after it." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。排名、奖金、流量都只是桌面上的动机。桌子底下只有一个问题：拉高的那个收盘价，最后结算给了谁的赎回单？", en: "Wrong. Rankings, bonuses, clicks — motives on the table. Under the table there is one question: whose redemption orders settled at that inflated close?" } },
    ],
  },
  {
    id: "basket",
    title: { zh: "第十四案 · 抢跑的篮子（地狱）", en: "Case 14 · The Front-Run Basket (Brutal)" },
    desc: { zh: "指数调样名单公布前，总有资金先行埋伏——看得到篮子的人，未必是漏篮子的人", en: "Money keeps lurking ahead of every index rebalance — but the one who SEES the basket isn't the one who leaked it" },
    award: { zh: "篮子封印者", en: "Basket Sealer" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      hang: { name: { zh: "杭主管", en: "Chief Hang" }, color: "--up" },
      yue: { name: { zh: "岳编制员", en: "Compiler Yue" }, color: "--ma20" },
      shui: { name: { zh: "水总", en: "Boss Shui" }, color: "--down" },
      gu: { name: { zh: "顾经理", en: "Manager Gu" }, color: "--ma5" },
      ding: { name: { zh: "丁工", en: "Engineer Ding" }, color: "--warn" },
    },
    intro: [
      { who: "k", text: { zh: "指数基金的规则是透明的：每半年调一次样本股，名单公布后，几千亿跟踪资金必须按名单买入新进、卖出剔除。", en: "Index funds play by open rules: samples rebalance every six months, and once the list is public, hundreds of billions in tracking money MUST buy the entrants and dump the deletions." } },
      { who: "k", text: { zh: "最近三期调样，每次名单公布前一周，总有一路资金精准埋伏进全部新进股，公布日兑现离场，三期合计获利近两亿。", en: "In each of the last three rebalances, the same money lurked into EVERY entrant a week before publication, cashing out on announcement day — nearly 200 million across three rounds." } },
      { who: "k", text: { zh: "调样名单从编制到公布要经过五双手。注意：离篮子最近的手，不一定是漏篮子的手。", en: "From compilation to publication, the list passes through five pairs of hands. Mind you: the hand nearest the basket isn't necessarily the one that leaked it." } },
    ],
    suspects: [
      {
        id: "hang",
        dialog: [
          { who: "hang", text: { zh: "我是 ETF 做市主管，申赎篮子天天从我眼前过——但篮子是按「已公布」的名单配的，我看到时全市场都看到了。", en: "I head ETF market-making. Creation baskets cross my desk daily — but baskets follow the PUBLISHED list. By the time I see it, the whole market has." } },
          { who: "hang", text: { zh: "我们在调样股上有持仓很正常，做市对冲嘛。每一笔都能对上公开名单的时间戳。", en: "Of course we hold rebalance names — that's hedging, the job itself. Every position matches the public list's timestamp." } },
        ],
        clue: { zh: "杭主管天天摸篮子，嫌疑看着最大——但做市持仓全部建立在名单公布之后，时间戳洗清了他。真正的泄露发生在更上游。", en: "Chief Hang touches baskets daily — the obvious suspect. But every market-making position postdates publication; the timestamps clear him. The leak happened further upstream." },
      },
      {
        id: "yue",
        dialog: [
          { who: "yue", text: { zh: "初选名单是我跑的模型，但那只是草稿，要过专家委员会才定稿。我一个编制员，说了不算的。", en: "I run the model that drafts the preliminary list — but it's a draft, finalized only by the expert committee. A compiler like me decides nothing." } },
          { who: "yue", text: { zh: "保密协议我年年签。对了，我业余给一家咨询公司写「指数方法论」专栏，稿费……一期两万。", en: "I sign the confidentiality agreement every year. Oh — on the side I write an 'index methodology' column for a consultancy. The fee is... twenty grand per issue." } },
          { who: "yue", text: { zh: "专栏内容绝对不涉及名单！就是讲讲规则、聊聊哪类股票「理论上」符合条件而已。", en: "The column NEVER touches the list! I just explain the rules — which kinds of stocks 'theoretically' qualify, that sort of thing." } },
        ],
        clue: { zh: "岳编制员的「方法论专栏」一期两万，远超市价，买主是水总关联的咨询公司。专栏从不点名——但把筛选规则和参数讲到那个细度，等于把名单的钥匙拆成零件递了出去。", en: "Compiler Yue's 'methodology column' pays twenty grand an issue — far above market — to a consultancy tied to Boss Shui. The column never names names. But explaining the screening rules and parameters at that depth hands over the list's key, disassembled into parts." },
      },
      {
        id: "shui",
        dialog: [
          { who: "shui", text: { zh: "我们私募做「指数事件策略」，公开规则加公开数据，自己复现调样模型，这是本事，不是内幕。", en: "My fund runs an 'index event strategy': public rules plus public data to replicate the rebalance model. That's skill, not inside information." } },
          { who: "shui", text: { zh: "三期全中？模型准呗。订咨询报告怎么了，研究投入也要花钱的。", en: "Three perfect rounds? A good model. And yes, we subscribe to consultancy research — diligence costs money." } },
        ],
        clue: { zh: "水总的「复现模型」三期命中率 100%，连委员会手工微调的两只票都「算」中了——纯公开规则不可能做到。他的研究订阅费，最后流向岳编制员的专栏稿费。", en: "Boss Shui's 'replication model' hit 100% across three rounds — including two names the committee adjusted BY HAND, which no public rule could produce. His research subscription fees flow, ultimately, into Compiler Yue's column payments." },
      },
      {
        id: "gu",
        dialog: [
          { who: "gu", text: { zh: "我管指数基金，调样日我们是被动的买单机器，是被抢跑伤得最重的人——跟踪误差全算在我头上。", en: "I run the index funds. On rebalance day we're a forced buying machine — the front-running's biggest victim. The tracking error lands on MY record." } },
          { who: "gu", text: { zh: "我向协会投诉过两次了，不信去查记录。", en: "I've filed two complaints with the association. Check the records." } },
        ],
        clue: { zh: "顾经理的基金被迫在被抬高的价格上接货，是明确的受害方，投诉记录属实。", en: "Manager Gu's funds were forced to buy at marked-up prices — a clear victim, complaints verified." },
      },
      {
        id: "ding",
        dialog: [
          { who: "ding", text: { zh: "我维护指数公司的数据系统。名单定稿后加密存放，访问全有日志，我查过了，没有外部入侵。", en: "I maintain the index company's data systems. The finalized list is encrypted, every access logged. I've checked — no external breach." } },
          { who: "ding", text: { zh: "倒是有个细节：定稿前的「草稿版」不在加密区，编制部门自己的共享盘就能看。", en: "One detail though: the PRE-final draft isn't in the encrypted zone. It sits on the compilation team's own shared drive." } },
        ],
        clue: { zh: "丁工排除了黑客路径，并指出关键漏洞：泄露不需要碰定稿——草稿加规则微调的「讲解」就足够拼出名单。", en: "Engineer Ding rules out hacking and exposes the real hole: the leak never needed the final file — a draft plus a 'tutorial' on the manual tweaks is enough to rebuild the list." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "这案子没有一份被偷走的文件：做市的时间戳干净，系统没有入侵，基金是受害者。泄露是以「方法论专栏」的形体发生的——规则、参数、连手工微调的思路都讲了，就差没写股票代码。", en: "No file was ever stolen in this case: the market-maker's timestamps are clean, the systems unbreached, the fund a victim. The leak took the shape of a 'methodology column' — rules, parameters, even the logic of the manual tweaks. Everything but the ticker symbols." } },
      { who: "k", text: { zh: "内幕信息不一定长得像名单，拆成零件卖也是泄露。谁把钥匙拆开递了出去？指认吧。", en: "Inside information doesn't have to look like a list — sold as parts, it's still a leak. Who disassembled the key and handed it over? Make the call." } },
    ],
    culprit: "yue",
    win: [
      { who: "k", text: { zh: "没错。岳编制员用「专栏」做管道：每期两万的稿费是对价，讲解的「理论筛选条件」精确到能复现名单，连委员会的手工调整都借「个人观点」提前吹风。水总的模型不是准，是抄了答案。", en: "Correct. Compiler Yue used the 'column' as a pipe: twenty grand an issue was the consideration, the 'theoretical screens' were precise enough to rebuild the list, and even the committee's manual tweaks got previewed as 'personal views'. Boss Shui's model wasn't brilliant — it copied the answer key." } },
      { who: "k", text: { zh: "水总作为利用方同样有责；天天摸篮子的杭主管反而最干净。离信息最近的人未必泄密，把信息「合法化包装」的人才最难抓。", en: "Boss Shui, as the user of the leak, shares the liability. Chief Hang — nearest the basket daily — turned out cleanest. The person closest to the information isn't always the leaker; the one who launders it into 'legitimate' packaging is the hardest to catch." } },
      { who: "k", text: { zh: "这一课：判断泄密，别只盯文件的流向，要盯「还原能力」的流向——够拼出答案的零件凑齐之时，就是内幕成立之日。", en: "The lesson: to trace a leak, follow not the file but the ABILITY TO RECONSTRUCT — the moment enough parts assemble the answer, the inside information exists." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。文件没被偷，系统没被黑，看篮子的人时间戳干净。想想：名单不出门，什么东西出了门，就足够在外面拼出名单？", en: "Wrong. No file stolen, no system hacked, clean timestamps on the basket watcher. Think: the list never left the building — what DID leave that was enough to rebuild it outside?" } },
    ],
  },
  {
    id: "mirrorbook",
    title: { zh: "第十五案 · 镜子里的行情（地狱）", en: "Case 15 · The Mirror Market (Brutal)" },
    desc: { zh: "三千个账户在同一秒「穿仓」，而他们的单子从未进过真正的交易所", en: "Three thousand accounts 'blew through zero' in the same second — and their orders never reached a real exchange" },
    award: { zh: "破镜人", en: "Mirror Breaker" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      ta: { name: { zh: "塔老板", en: "Boss Ta" }, color: "--down" },
      long: { name: { zh: "龙工", en: "Engineer Long" }, color: "--ma20" },
      mei: { name: { zh: "美美", en: "Meimei" }, color: "--ma5" },
      hong: { name: { zh: "洪哥", en: "Brother Hong" }, color: "--up" },
      su: { name: { zh: "苏会计", en: "Accountant Su" }, color: "--warn" },
    },
    intro: [
      { who: "k", text: { zh: "「百倍配资、极速下单」的鑫塔平台，上周三凌晨「行情闪断」十九秒。恢复时，三千个客户账户在同一根分时线上全部触发强平，穿仓损失由客户「自担」。", en: "Xinta, the '100x leverage, lightning execution' platform, suffered a nineteen-second 'feed outage' last Wednesday before dawn. When it recovered, three thousand client accounts hit forced liquidation on the same tick — losses beyond zero 'borne by the client'." } },
      { who: "k", text: { zh: "取证发现更大的事：平台是个「虚拟盘」——客户的单子从没发往交易所，他们面对的所谓行情，是一面被人握在手里的镜子。", en: "Forensics found something bigger: the platform was a MIRROR BOOK — client orders never went to any exchange. The 'market' they traded against was a mirror held in someone's hand." } },
      { who: "k", text: { zh: "开虚拟盘的人有罪，这没有悬念。悬念是：那十九秒的「闪断」和精准到分的集体强平线，是谁的手笔。", en: "Running the mirror book is a crime — no mystery there. The mystery: whose hand wrote the nineteen-second 'outage' and the to-the-penny mass liquidation line?" } },
    ],
    suspects: [
      {
        id: "ta",
        dialog: [
          { who: "ta", text: { zh: "虚拟盘是我开的，我认罪。但我是「养客模式」：客户活得越久充得越多，我靠手续费和点差细水长流。", en: "The mirror book was mine — I plead to that. But my model was FARMING: the longer clients survive, the more they deposit. I lived off fees and spread, slow and steady." } },
          { who: "ta", text: { zh: "那天凌晨我在赌桌上，手机都没碰。一夜收割三千户？那是杀鸡取卵，不是我的生意经。", en: "That night I was at a casino table, phone untouched. Harvesting three thousand accounts in one night? That's killing the golden goose — not my business model." } },
        ],
        clue: { zh: "塔老板开虚拟盘罪责确凿，但「闪断收割」砸了他的长期生意，当晚他也不在场。有人用他的刀，切了他养的客。", en: "Boss Ta's mirror-book guilt is beyond doubt. But the outage-harvest torched his own long game, and he was away that night. Someone used his knife to carve the flock he was farming." },
      },
      {
        id: "long",
        dialog: [
          { who: "long", text: { zh: "系统是我一个人写的，行情源、撮合、风控参数，都在我的代码里。闪断？机房网络抖动，日志我可以给你们。", en: "I wrote the whole system alone — feed, matching, risk parameters, all my code. The outage? Network jitter at the data center. I'll hand over the logs." } },
          { who: "long", text: { zh: "强平线是配置表定的，谁都能改……当然，改动要有后台权限。后台权限嘛，我和塔老板有。", en: "Liquidation lines live in a config table anyone could edit... anyone with back-office access, that is. Which would be me and Boss Ta." } },
          { who: "long", text: { zh: "我上个月提过离职，塔老板压着不放，说年底再谈分红。我凭技术吃饭，犯不着犯罪。", en: "I tendered my resignation last month; Ta sat on it, said we'd 'discuss the bonus at year-end'. I live on my skills — crime isn't worth it." } },
        ],
        clue: { zh: "龙工交出的「网络抖动」日志经核验是事后伪造：闪断那十九秒，行情源进程被一条手工指令挂起，操作令牌属于他的运维账号。另查：闪断前一周，他在境外新注册了一家「量化科技」公司。", en: "Engineer Long's 'network jitter' logs were forged after the fact: during those nineteen seconds, the feed process was suspended by a MANUAL command under his ops token. Also: a week before the outage, he registered an offshore 'quant tech' company." },
      },
      {
        id: "mei",
        dialog: [
          { who: "mei", text: { zh: "我是客服主管，闪断那晚工单爆了，我带着组里人回了一整夜「系统维护，请稍候」。话术是上面发的模板。", en: "I head client support. The night of the outage, tickets exploded and my team spent all night replying 'system maintenance, please wait'. The script came down from above." } },
          { who: "mei", text: { zh: "模板谁发的？运营群里「技术部」发的，几点发的我可以翻记录——是闪断前四十分钟。", en: "Who sent the script? 'Tech department', in the ops group. I can pull the timestamp — forty minutes BEFORE the outage." } },
        ],
        clue: { zh: "美美的聊天记录是本案最硬的时间证据：安抚话术在「事故」发生前四十分钟就已下发——闪断不是事故，是日程。", en: "Meimei's chat log is the case's hardest timestamp: the reassurance script was distributed forty minutes BEFORE the 'incident'. The outage wasn't an accident — it was an agenda item." },
      },
      {
        id: "hong",
        dialog: [
          { who: "hong", text: { zh: "我做引流的，直播间喊人来「体验百倍杠杆」，按入金抽成。平台是真是假，我哪知道？", en: "I do traffic. My livestream pulls people in to 'experience 100x leverage', and I take a cut of deposits. Real platform or fake — how would I know?" } },
          { who: "hong", text: { zh: "闪断前那周我是加了几场直播，喊得凶了点……那是运营给我加钱了，让我「冲一波新客」。", en: "Yes, I added extra streams that week and pushed harder... operations paid me extra to 'surge new clients'." } },
        ],
        clue: { zh: "洪哥是付费的扩音器：收割前一周被加钱冲新客，把更多保证金赶进了镜子里。加钱的指令同样来自「技术部」的群账号。", en: "Brother Hong is a paid megaphone: boosted fees the week before the harvest drove more margin into the mirror. The payment instruction came from the same 'tech department' group account." },
      },
      {
        id: "su",
        dialog: [
          { who: "su", text: { zh: "我管平台的钱。客户入金走第三方支付进资金池，出金我批。那周出金审核突然收紧，说是「技术部风控升级」的要求。", en: "I manage the money. Deposits pool in via third-party payment; withdrawals need my sign-off. That week withdrawal checks suddenly tightened — 'tech risk-control upgrade', they said." } },
          { who: "su", text: { zh: "还有笔怪账：闪断次日，资金池划了一笔「服务器采购款」到境外，收款方是家刚注册的科技公司。单据是齐的，塔老板的章。", en: "And one odd entry: the day after the outage, a 'server procurement' payment left the pool for an offshore account — a freshly registered tech company. Paperwork complete, Boss Ta's seal." } },
        ],
        clue: { zh: "苏会计供出资金去向：收割次日，一笔大额「采购款」流向境外新公司——正是龙工闪断前一周注册的那家。塔老板的章，在后台权限下可以电子代签。", en: "Accountant Su reveals the money trail: the day after the harvest, a large 'procurement' payment went to the freshly registered offshore firm — the very company Engineer Long set up a week earlier. Boss Ta's seal can be e-signed by anyone with back-office access." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "分开两件事。开镜子的是塔老板，罪责跑不掉。但那一夜的收割另有导演：话术提前四十分钟下发、行情进程被手工挂起、强平线被改到精准收割、赃款次日流向境外新公司。", en: "Separate two things. Boss Ta built the mirror — that guilt is sealed. But the night's harvest had another director: a script sent forty minutes early, a feed manually suspended, liquidation lines retuned for a clean sweep, and the proceeds offshore by the next day." } },
      { who: "k", text: { zh: "导演需要三样东西：改参数的权限、挂起行情的手、收钱的壳。三样都齐的是谁？指认吧。", en: "The director needed three things: access to the parameters, a hand on the feed, and a shell to catch the money. Who had all three? Make the call." } },
    ],
    culprit: "long",
    win: [
      { who: "k", text: { zh: "没错。被拖欠分红的龙工决定自己「结算」：注册境外壳公司、提前下发安抚话术、加钱让主播冲一波新客做肥料，然后挂起行情十九秒、改低强平线，一夜收割三千户，次日以「采购款」名义把钱洗出境——连塔老板的电子章都是他代签的。", en: "Correct. Engineer Long, stiffed on his bonus, settled the account himself: an offshore shell, the pre-sent script, extra streamer fees to fatten the flock — then nineteen seconds of suspended feed, lowered liquidation lines, three thousand accounts harvested overnight, and the money laundered out as 'procurement' the next day, Boss Ta's e-seal signed by his own hand." } },
      { who: "k", text: { zh: "塔老板照样入狱——虚拟盘本身就是犯罪，他养的「客」本来也是待宰的羊。这个案子没有好人，只有两种罪。", en: "Boss Ta goes to prison all the same — the mirror book itself is the crime, and his 'farmed' clients were always sheep awaiting slaughter. No good men in this case. Just two kinds of guilt." } },
      { who: "k", text: { zh: "这一课：遇到「百倍杠杆、极速成交、出金秒到」的平台，先问一句——我的单子，真的到过交易所吗？", en: "The lesson: when a platform offers 100x leverage, lightning fills and instant withdrawals, ask one question first — did my order ever reach an exchange at all?" } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。开镜子的罪和砸镜子的罪是两桩。砸镜子要同时有权限、有手、有收钱的壳——再看看谁三样俱全。", en: "Wrong. Building the mirror and smashing it are two different crimes. The smashing took access, a hand, and a shell for the money — look again for who held all three." } },
    ],
  },
  {
    id: "gurugroup",
    title: { zh: "第十六案 · 直播间双簧", en: "Case 16 · The Livestream Double Act" },
    desc: { zh: "「跟着老师稳赚」的荐股群里，赚钱的截图是真的——赚的是谁的钱？", en: "In a 'follow the master' stock group, the profit screenshots are real - but whose money is being made?" },
    award: { zh: "拆台专家", en: "Stage Wrecker" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      gan: { name: { zh: "甘老师", en: "Teacher Gan" }, color: "--down" },
      panc: { name: { zh: "盘哥", en: "Brother Pan" }, color: "--ma20" },
      zhuo: { name: { zh: "卓阿姨", en: "Auntie Zhuo" }, color: "--up" },
      miao: { name: { zh: "苗苗", en: "Miaomiao" }, color: "--ma5" },
    },
    intro: [
      { who: "k", text: { zh: "「跟着甘老师，三天回本七天翻倍」——一个两千人的荐股群，会费 1999，老师每天带单喊票。", en: "'Follow Teacher Gan: break even in three days, double in seven' - a 2,000-member stock group, 1,999 yuan membership, daily trade calls." } },
      { who: "k", text: { zh: "蹊跷的是：老师喊的票起初真的涨，群里晒单的「学员」天天盈利；等大家加大仓位，票就开始连续阴跌。", en: "The catch: the calls really did rise at first, and 'students' posted winning screenshots daily. Once everyone sized up, the picks began to bleed." } },
      { who: "k", text: { zh: "监控顺着资金和账号扒出了四个人。注意：台上唱戏的，未必是写剧本的。", en: "Following the money and the accounts, we pulled in four people. Mind you: the one on stage rarely wrote the script." } },
    ],
    suspects: [
      {
        id: "gan",
        dialog: [
          { who: "gan", text: { zh: "我就是个讲课的！课件是统一发我的，每天喊哪只票，也是上面定好发我照着念。", en: "I just lecture! The slides are sent to me, and which stock to call each day comes from above - I read the script." } },
          { who: "gan", text: { zh: "我连证券从业资格都没有……他们说没关系，口播加一句「不构成投资建议」就行。", en: "I don't even hold a securities license... they said it's fine, just add 'not investment advice' when I speak." } },
          { who: "gan", text: { zh: "工资？底薪八千加打赏分成。群是谁建的我真不知道，对接我的只有一个微信号叫「盘哥」。", en: "Pay? Eight grand base plus a cut of tips. Who owns the group, I honestly don't know - my only contact is a WeChat called 'Brother Pan'." } },
        ],
        clue: { zh: "甘老师是雇来的「嘴」：无从业资格、照稿念票、拿底薪和打赏。真正定「喊哪只票」的，是幕后发稿的人。", en: "Teacher Gan is a hired mouth: unlicensed, reading scripted picks for a base salary plus tips. Whoever sends the script decides the calls." },
      },
      {
        id: "panc",
        dialog: [
          { who: "panc", text: { zh: "我就是群管理，发发公告、拉拉人头，按人头拿提成，合法劳动。", en: "I'm just the group admin - posting notices, recruiting members, paid per head. Honest work." } },
          { who: "panc", text: { zh: "晒单？群里氛围组嘛，哪个群没有几个活跃的。截图是不是真的我哪知道。", en: "The screenshots? Every group has its cheerleaders. Whether they're real, how would I know." } },
          { who: "panc", text: { zh: "……你们查我名下十四个证券账户干什么？那是我帮亲戚管的，亲戚多不行吗？", en: "...Why are you looking at the fourteen brokerage accounts under my name? I manage them for relatives. Is having a big family a crime?" } },
        ],
        clue: { zh: "「群管理」盘哥名下关联 14 个账户：每次都在喊单前两天低位建仓，群员进场拉高后分批出货——晒单截图正是这些账户的真实盈利。课件的原始文档作者，也是他。", en: "Admin 'Brother Pan' is linked to 14 accounts that load up two days before each call and unload into the members' buying - the winning screenshots are those accounts' real profits. The script files' original author: also him." },
      },
      {
        id: "zhuo",
        dialog: [
          { who: "zhuo", text: { zh: "我是去年退休的，群里老师天天问候，比儿女还贴心……我投了 40 万，现在亏得只剩 20 万。", en: "I retired last year. The teacher greeted me daily, kinder than my own kids... I put in 400 grand, now half is gone." } },
          { who: "zhuo", text: { zh: "前两次跟单真赚了小几千，我才敢把定期取出来加仓的。", en: "The first two calls really made me a few thousand - that's why I dared move my savings in." } },
        ],
        clue: { zh: "卓阿姨是标准的「养鱼」受害者：先让你小赚建立信任，再在你重仓时收割。", en: "Auntie Zhuo is the classic 'fattened fish': small wins build trust, the harvest comes when you're fully loaded." },
      },
      {
        id: "miao",
        dialog: [
          { who: "miao", text: { zh: "我在群里天天晒收益图没错……但图是「运营」发我的，我照发一张给 50 块。", en: "Yes, I posted profit screenshots daily... but the images were sent to me by 'operations' - 50 yuan per post." } },
          { who: "miao", text: { zh: "我自己一股都没买过！我就是个大学生，兼职群托……我现在知道错了。", en: "I never bought a single share! I'm a student doing a part-time gig as a group shill... I know it was wrong now." } },
        ],
        clue: { zh: "苗苗是按条计酬的气氛托，发的图由「运营」统一提供——图的拍摄设备信息与盘哥的手机一致。", en: "Miaomiao is a paid-per-post shill; the images came from 'operations' - and their metadata matches Brother Pan's phone." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "台前是没资格的「老师」照稿喊票，台下是领钱的托儿晒图养鱼，而低位建仓、高位出货的十四个账户和课件原稿，都指向同一个「群管理」。", en: "On stage, an unlicensed 'teacher' reads scripted calls; in the crowd, paid shills fatten the fish - while fourteen accounts buying low before each call, selling into the hype, and the original scripts all point to one 'admin'." } },
      { who: "k", text: { zh: "这出双簧里，谁在写剧本、谁在数钱？指认吧。", en: "In this double act - who writes the script and counts the money? Make the call." } },
    ],
    culprit: "panc",
    win: [
      { who: "k", text: { zh: "没错。自称「群管理」的盘哥才是操盘手：他写课件定喊单节奏，先用 14 个关联账户低位埋伏，再借老师的嘴和托儿的图把群员骗进场抬轿，最后高位出货。", en: "Correct. 'Admin' Brother Pan ran the whole book: he wrote the scripts and set the call schedule, lurked in with 14 linked accounts, used the teacher's mouth and the shills' screenshots to herd members in, then unloaded into their buying." } },
      { who: "k", text: { zh: "甘老师无证荐股、苗苗有偿造势，都跑不掉。而记住这一课：荐股群的「稳赚」截图越真，越说明有人在你前面建好了仓。", en: "Teacher Gan touted without a license and Miaomiao shilled for pay - both face consequences. And remember: the more real a group's winning screenshots look, the more certain someone bought in before you." } },
      { who: "k", text: { zh: "判断荐股群只需一个问题：老师赚的是行情的钱，还是你的钱？收会费、带节奏、提前建仓——三样占一样，快跑。", en: "One question exposes every stock group: does the master profit from the market, or from you? Fees, hype, pre-built positions - any one of the three means run." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。念稿的嘴和发图的手都是雇来的。问一句：喊单前两天就建好仓的账户，听谁的指挥？", en: "Wrong. The reading mouth and the posting hands were both hired. Ask: the accounts loaded two days before each call - whose orders do they follow?" } },
    ],
  },
  {
    id: "bigbath",
    title: { zh: "第十七案 · 财务大洗澡", en: "Case 17 · The Big Bath" },
    desc: { zh: "新官上任先亏 30 亿：是旧账见光，还是有人在澡盆里藏了别的东西？", en: "A new chairman opens with a 3-billion loss: old skeletons surfacing - or something else hidden in the bathwater?" },
    award: { zh: "澡盆放水员", en: "Bath Drainer" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      ke: { name: { zh: "柯新董", en: "New Chairman Ke" }, color: "--ma20" },
      qian2: { name: { zh: "钱前董", en: "Ex-Chairman Qian" }, color: "--down" },
      shang: { name: { zh: "商董秘", en: "Secretary Shang" }, color: "--ma5" },
      hua: { name: { zh: "华基金", en: "Fund Manager Hua" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "恒通股份换帅第一年，年报巨亏 30 亿：存货减值、商誉减值、应收坏账……能计提的一次全提了。", en: "Hengtong's first year under new leadership: a 3-billion loss. Inventory write-downs, goodwill impairments, bad receivables - everything that could be charged was charged, all at once." } },
      { who: "k", text: { zh: "这叫「财务大洗澡」：把未来几年的坏消息一次出清，之后轻装上阵，年年「扭亏为盈」。", en: "It's called a 'big bath': flush years of bad news in one go, then glide forward on easy comparisons, 'returning to profit' year after year." } },
      { who: "k", text: { zh: "洗澡本身在灰色地带。但监管盯上这家公司，是因为澡盆放水的时点，和某些账户的买卖节奏咬合得太漂亮了。", en: "The bath itself lives in a gray zone. The regulator's interest came from elsewhere: the timing of the drain meshed too neatly with certain accounts' trading." } },
    ],
    suspects: [
      {
        id: "ke",
        dialog: [
          { who: "ke", text: { zh: "减值是审计师认可的！前任留下的窟窿，我不一次提干净，难道替他藏着继续骗股东？", en: "Every write-down was blessed by the auditors! Should I have kept hiding my predecessor's holes to keep deceiving shareholders?" } },
          { who: "ke", text: { zh: "巨亏公告发布前股价阴跌？市场有效嘛，聪明钱总是先知道……我是说，先猜到。", en: "The slide before the loss announcement? Markets are efficient - smart money always knows first... I mean, guesses first." } },
          { who: "ke", text: { zh: "我舅哥的账户在公告前清仓、在年报后抄底？他自己炒股二十年了，问我干什么。", en: "My brother-in-law's account sold before the announcement and bought back after the annual report? He's traded for twenty years - why ask me." } },
        ],
        clue: { zh: "柯新董把能提的减值一次提满，为「上任后年年增长」铺路——而他舅哥的账户精准地在巨亏公告前清仓、年报见底后满仓抄回，两次踩点与董事会内部日程完全一致。", en: "Chairman Ke charged every possible impairment at once, paving the road for 'growth every year under me' - while his brother-in-law's account sold out before the loss announcement and piled back in at the post-report bottom, both moves matching the board's internal calendar exactly." },
      },
      {
        id: "qian2",
        dialog: [
          { who: "qian2", text: { zh: "30 亿窟窿是我留的？那些存货和商誉前年审计都是干净意见！他这是把正常资产往死里减，踩着我上位。", en: "I left a 3-billion hole? Those inventories and goodwill got clean opinions two years running! He's writing down healthy assets to climb over me." } },
          { who: "qian2", text: { zh: "我退了就是退了，股份三年前就清完了，公司涨跌与我无关。", en: "I'm retired, fully. My shares were sold three years ago - the stock means nothing to me now." } },
        ],
        clue: { zh: "钱前董确有经营积弊，但他持股三年前已清空，巨亏年与他再无利益关联——他是「旧账」的来源，不是这次收割的手。", en: "Ex-Chairman Qian left real operational rot, but he divested three years ago - the loss year holds no economics for him. He is the source of the old mess, not the hand behind this harvest." },
      },
      {
        id: "shang",
        dialog: [
          { who: "shang", text: { zh: "信息披露都是我经手的，流程合规，该发的都按时发了。", en: "All disclosures went through me - compliant, and on schedule." } },
          { who: "shang", text: { zh: "要说不寻常……减值方案在董事会通过前两周，柯董就让我「预沟通」审计师了。日程表我有留档。", en: "If anything was unusual... Chairman Ke had me 'pre-align' with the auditors two weeks before the board approved the write-downs. I kept the calendar." } },
        ],
        clue: { zh: "商董秘留档的日程显示：减值的规模与节奏早在公告前数周就已内定——知悉这个时间表的人，名单很短。", en: "Secretary Shang's archived calendar shows the write-downs' size and timing were settled weeks before disclosure - and the list of people who knew that schedule is short." },
      },
      {
        id: "hua",
        dialog: [
          { who: "hua", text: { zh: "我们基金在年报后建仓没错——巨亏出清、包袱干净，这叫困境反转策略，教科书都有。", en: "Yes, our fund bought after the annual report - kitchen sink done, balance sheet clean. It's a textbook turnaround play." } },
          { who: "hua", text: { zh: "建仓依据是公开年报，投决会纪要齐全。我们比谁都希望监管查清楚，别让浑水搅了正经策略。", en: "Our thesis used the public report, with full committee minutes. We want this cleaned up more than anyone - muddy water ruins honest strategies." } },
        ],
        clue: { zh: "华基金在年报公开后才建仓，依据与流程完整——正常的困境反转投资，反而衬出「公告前就动手」的账户有多扎眼。", en: "Fund Hua bought only after the public report, with thesis and process intact - honest turnaround investing that makes the pre-announcement traders stand out all the more." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "把时间线钉死：减值规模数周前内定（董秘的日程为证），巨亏公告前有账户精准清仓，年报见底后同一账户满仓抄回——卖和买都踩在只有内部人知道的节点上。", en: "Pin the timeline: write-downs settled weeks early (the secretary's calendar proves it); an account sold out right before the loss announcement; the same account piled back in at the post-report bottom. Both moves landed on dates only insiders knew." } },
      { who: "k", text: { zh: "旧账是真的，洗澡是灰的，但用内幕时间表让自家亲戚两头赚——这是黑的。谁握着时间表？指认吧。", en: "The old mess is real and the bath is gray - but handing an insider's calendar to family to profit both ways is black. Who held the calendar? Make the call." } },
    ],
    culprit: "ke",
    win: [
      { who: "k", text: { zh: "没错。柯新董一手安排「大洗澡」的规模与时点，一手把时间表递给舅哥：公告前出逃、见底后抄回，跌出来的黄金坑全让自家人接走——明年「扭亏为盈」的掌声，还是他的。", en: "Correct. Chairman Ke set both the size and timing of the bath - and handed the calendar to his brother-in-law: out before the announcement, back in at the bottom, the whole golden pit family-owned. And next year's 'return to profit' applause? Also his." } },
      { who: "k", text: { zh: "记住这一课：新官上任的巨亏年报，先别急着骂前任——看看减值的时点让谁受益，再看看谁在底部满仓。", en: "The lesson: when a new boss opens with a kitchen-sink loss, don't rush to blame the old one - ask who benefits from the timing, and who is fully loaded at the bottom." } },
      { who: "k", text: { zh: "至于「洗澡」本身？监管的新规矩越来越严：减值要有依据，转回要有解释。澡可以洗，水表在走。", en: "As for the bath itself? The rules keep tightening: impairments need evidence, reversals need explanations. You may bathe - but the water meter is running." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。留下旧账的人三年前就没了持仓，年报后建仓的基金用的是公开信息。问一句：公告前精准出逃的账户，时间表从谁手里来？", en: "Wrong. The man who left the mess divested three years ago, and the fund bought on public information. Ask: the account that fled right before the announcement - who gave it the calendar?" } },
    ],
  },
];
