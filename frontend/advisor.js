// AI 顾问视图模块 (2026-10 从 app.js 拆出, 行为不变)。依赖 app.js 的 $ / api / state / API / LANG / t。
// ---------- AI 顾问: 流式多轮对话 (SSE), 失败时回退单发 POST ----------

let advisorBusy = false;
let advisorEs = null; // 当前对局的 SSE 句柄, 换局 (resetAdvisorChat) 时必须 close

function advisorAppend(cls, text) {
  const log = $("advisor-log");
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function resetAdvisorChat() {
  // 关掉上一局还挂着的 SSE 流: 不关的话服务端继续为旧 session 烧 LLM 配额,
  // 且 advisorBusy 要等旧流结束才复位, 新局的顾问按钮会静默失灵
  if (advisorEs) {
    try { advisorEs.close(); } catch (e) { /* 已关闭则忽略 */ }
    advisorEs = null;
  }
  advisorBusy = false;
  $("advisor-log").innerHTML = "";
  $("advisor-chat").hidden = true;
  if (state.sessionId) {
    api(`/game/${state.sessionId}/advisor/reset`, { method: "POST" }).catch(() => { /* 尽力而为 */ });
  }
}
window.qsResetAdvisorChat = resetAdvisorChat;

function streamAdvice(question) {
  if (advisorBusy || !state.sessionId) return;
  advisorBusy = true;
  $("advisor-chat").hidden = false;
  if (question) advisorAppend("q", question);
  const el = advisorAppend("a", t("ai.thinking"));
  const url = `${API}/game/${state.sessionId}/advisor/stream?lang=${LANG}&q=${encodeURIComponent(question || "")}`;
  let text = "";
  const finish = () => { advisorBusy = false; };
  let es;
  try {
    es = new EventSource(url);
  } catch (e) {
    fallbackAdvice(question, el).finally(finish);
    return;
  }
  advisorEs = es;
  let settled = false; // 防止多个错误回调重复落地/重复回退请求
  const settle = (fn) => {
    if (settled) return;
    settled = true;
    es.close();
    if (advisorEs === es) advisorEs = null; // 换局可能已挂了新流, 只清自己的句柄
    fn();
  };
  es.onmessage = (ev) => {
    text += ev.data;
    el.textContent = text;
    $("advisor-log").scrollTop = $("advisor-log").scrollHeight;
  };
  es.addEventListener("done", () => settle(finish));
  es.addEventListener("advisor-error", (ev) => settle(() => {
    // 服务端主动报错 (自定义事件带消息)
    el.textContent = ev.data || t("err.badResp");
    finish();
  }));
  es.onerror = () => settle(() => {
    if (!text) fallbackAdvice(question, el).finally(finish);
    else finish();
  });
}

async function fallbackAdvice(question, el) {
  try {
    const q = question ? `&q=${encodeURIComponent(question)}` : "";
    const res = await api(`/game/${state.sessionId}/advisor?lang=${LANG}${q}`, { method: "POST" });
    el.textContent = res.advice;
  } catch (e) {
    el.textContent = e.message;
  }
}

function askAdvisor() {
  streamAdvice("");
}

function sendAdvisorQuestion() {
  const input = $("advisor-q");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  streamAdvice(q);
}
$("btn-advisor").addEventListener("click", askAdvisor);
$("btn-advisor-send").addEventListener("click", sendAdvisorQuestion);
$("advisor-q").addEventListener("keydown", (e) => {
  if (e.isComposing) return; // 中文输入法选字的 Enter 不当提交 (半截拼音会白烧一次 LLM 配额)
  if (e.key === "Enter") sendAdvisorQuestion();
});
