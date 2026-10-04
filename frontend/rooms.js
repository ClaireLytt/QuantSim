// 好友房间: 建房/加入/战况轮询/开始对局。依赖 $ / api / t / toast / switchView / Auth / qsEnterGame / stockName / fmtPct。

(() => {
  let room = null;       // 当前查看的 RoomView
  let pollTimer = null;

  const POLL_MS = 10000;

  function stopPoll() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(() => {
      if (room && room.status === "OPEN") refresh(false);
      else stopPoll();
    }, POLL_MS);
  }

  function renderRoom() {
    const panel = $("room-panel");
    if (!room) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    $("room-code-label").textContent = room.code;
    const expires = String(room.expiresAt || "").replace("T", " ").slice(0, 16);
    $("room-meta").textContent = t("room.meta",
      t("room.status." + room.status), room.players, room.maxPlayers, expires);

    const tbody = $("room-standings").querySelector("tbody");
    tbody.innerHTML = "";
    (room.standings || []).forEach((m, i) => {
      const tr = document.createElement("tr");
      let progress;
      if (!m.started) progress = t("room.notStarted");
      else if (m.done) progress = t("room.done");
      else progress = t("room.playing", m.daysElapsed);
      let rate;
      if (m.returnRate == null) rate = room.status === "SETTLED" ? "--" : t("room.hidden");
      else rate = fmtPct(Number(m.returnRate));
      const cls = m.returnRate == null ? "" : Number(m.returnRate) >= 0 ? "pos" : "neg";
      tr.innerHTML = `<td>${i + 1}</td><td></td><td>${progress}</td><td class="${cls}">${rate}</td>`;
      tr.children[1].textContent = m.username;
      tbody.appendChild(tr);
    });

    renderRoomChart(room);

    const playBtn = $("btn-room-play");
    playBtn.disabled = room.status === "SETTLED" && !room.mySessionId;
    playBtn.textContent = room.mySessionId
      ? t(room.mySessionSettled ? "room.done" : "room.play") : t("room.play");
  }

  async function refresh(showErrors = true) {
    if (!room) return;
    try {
      room = await api(`/rooms/${room.code}`);
      renderRoom();
    } catch (e) {
      if (showErrors) toast(e.message);
    }
  }

  async function create() {
    Auth.require(async () => {
      try {
        const body = { market: $("room-market").value || null, aiLevel: $("room-ai").value };
        room = await api("/rooms", { method: "POST", body: JSON.stringify(body) });
        renderRoom();
        startPoll();
        toast(t("room.created"));
      } catch (e) {
        toast(e.message);
      }
    });
  }

  async function join() {
    const code = $("room-code-input").value.trim().toUpperCase();
    if (code.length !== 6) {
      toast(t("room.codePh"));
      return;
    }
    Auth.require(async () => {
      try {
        room = await api(`/rooms/${encodeURIComponent(code)}/join`, { method: "POST" });
        renderRoom();
        startPoll();
        toast(t("room.joined"));
      } catch (e) {
        toast(e.message);
      }
    });
  }

  async function play() {
    if (!room) return;
    Auth.require(async () => {
      try {
        const res = await api(`/rooms/${room.code}/play`, { method: "POST" });
        await window.qsEnterGame(res);
        switchView("game");
      } catch (e) {
        toast(e.message);
      }
    });
  }

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      toast(t("room.copied"));
    } catch (e) {
      toast(room.code);
    }
  }

  // 终局对比: 全员收益揭晓后画一张柱状图, 你的柱子用主题色高亮
  let roomChart = null;
  function renderRoomChart(room) {
    const box = $("room-chart");
    const rows = (room.standings || []).filter((m) => m.returnRate != null);
    if (rows.length < 2) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    if (!roomChart) {
      roomChart = echarts.init(box);
      window.addEventListener("resize", () => roomChart.resize());
    }
    const me = window.Auth && Auth.user && Auth.user.username;
    roomChart.setOption({
      backgroundColor: "transparent",
      animation: false,
      tooltip: { valueFormatter: (v) => fmtPct(v / 100) },
      grid: { left: 50, right: 16, top: 12, bottom: 24 },
      xAxis: { type: "category", data: rows.map((m) => m.username),
        axisLabel: { color: cssVar("--text-muted"), fontSize: 11 },
        axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value", axisLabel: { color: cssVar("--text-muted"), formatter: "{value}%" },
        splitLine: { lineStyle: { color: cssVar("--border"), opacity: 0.4 } } },
      series: [{ type: "bar", barWidth: "55%",
        data: rows.map((m) => ({
          value: +(Number(m.returnRate) * 100).toFixed(2),
          itemStyle: { color: m.username === me ? cssVar("--accent")
            : Number(m.returnRate) >= 0 ? cssVar("--up") : cssVar("--down"),
            opacity: m.username === me ? 1 : 0.7, borderRadius: [3, 3, 0, 0] },
        })) }],
    }, true);
    roomChart.resize();
  }

  // 创建/加入单卡切换: 默认展示登录, 小字链接切到加入 (与登录弹窗同范式)
  function showRoomCard(join) {
    $("room-create-card").hidden = join;
    $("room-join-card").hidden = !join;
    if (join) $("room-code-input").focus();
  }
  $("link-room-join").addEventListener("click", (e) => { e.preventDefault(); showRoomCard(true); });
  $("link-room-create").addEventListener("click", (e) => { e.preventDefault(); showRoomCard(false); });

  // 同题挑战 (app.js 发起): 带着 RoomView 直接进入房间面板
  window.qsEnterRoom = (view) => {
    room = view;
    renderRoom();
    startPoll();
  };

  $("btn-room-create").addEventListener("click", create);
  $("btn-room-join").addEventListener("click", join);
  $("btn-room-play").addEventListener("click", () => guarded(play));
  $("btn-room-refresh").addEventListener("click", () => refresh());
  $("btn-room-copy").addEventListener("click", copyCode);
  $("room-code-input").addEventListener("keydown", (e) => { if (e.key === "Enter") join(); });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "rooms") {
      if (room) { refresh(false); startPoll(); }
    } else {
      stopPoll();
    }
  });
  document.addEventListener("qs:lang", renderRoom);
  if (window.Auth) Auth.onChange((u) => { if (!u) { room = null; renderRoom(); stopPoll(); } });
})();
