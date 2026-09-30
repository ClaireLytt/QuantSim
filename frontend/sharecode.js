// 策略分享码: QS1.<base64url(JSON)>.<crc32hex8>, 纯前端编解码。
// 依赖 $ / t / toast 与 app.js 的 collectArenaBody / fillArenaForm。

(() => {
  const VERSION = "QS1";
  const STRATEGIES = ["MA_CROSS", "MOMENTUM", "MEAN_REVERSION", "RSI", "MACD", "BOLL", "GRID", "TURTLE", "BUY_HOLD", "CUSTOM"];
  const FIELDS = ["CLOSE", "MA5", "MA20", "PCT_CHANGE", "RSI", "MACD_HIST", "BOLL_UP", "BOLL_MID", "BOLL_LOW"];
  const OPS = ["GT", "LT", "CROSS_UP", "CROSS_DOWN"];

  // ---- crc32 ----
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(str) {
    let crc = 0xffffffff;
    const bytes = new TextEncoder().encode(str);
    for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  }

  function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function b64urlDecode(str) {
    const bin = atob(str.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encode() {
    const body = collectArenaBody("x"); // username 不入码
    const payload = { v: 1, s: body.strategy, p: {}, pos: body.positionPct ?? 100 };
    Object.entries(body).forEach(([k, v]) => {
      if (["username", "stockCode", "strategy", "positionPct", "buyConditions", "sellConditions"].includes(k)) return;
      if (v != null && !Number.isNaN(v)) payload.p[k] = v;
    });
    if (body.strategy === "CUSTOM") {
      payload.buy = body.buyConditions;
      payload.sell = body.sellConditions;
    }
    const json = JSON.stringify(payload);
    return `${VERSION}.${b64urlEncode(json)}.${crc32(json)}`;
  }

  function decode(code) {
    const parts = String(code || "").trim().split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) return null;
    let json;
    try {
      json = b64urlDecode(parts[1]);
    } catch (e) {
      return null;
    }
    if (crc32(json) !== parts[2]) return null;
    let payload;
    try {
      payload = JSON.parse(json);
    } catch (e) {
      return null;
    }
    if (payload.v !== 1 || !STRATEGIES.includes(payload.s)) return null;
    const conds = (list) => {
      if (!Array.isArray(list) || list.length === 0 || list.length > 5) return null;
      const out = [];
      for (const c of list) {
        if (!FIELDS.includes(c.left) || !OPS.includes(c.op)) return null;
        const hasField = c.rightField != null && c.rightField !== "";
        if (hasField && !FIELDS.includes(c.rightField)) return null;
        if (!hasField && (c.rightValue == null || Number.isNaN(Number(c.rightValue)))) return null;
        out.push({ left: c.left, op: c.op, rightField: hasField ? c.rightField : null,
          rightValue: hasField ? null : Number(c.rightValue) });
      }
      return out;
    };
    const body = { strategy: payload.s, positionPct: clampInt(payload.pos, 10, 100, 100) };
    Object.entries(payload.p || {}).forEach(([k, v]) => {
      if (typeof v === "number" && Number.isFinite(v)) body[k] = v;
    });
    if (payload.s === "CUSTOM") {
      body.buyConditions = conds(payload.buy);
      body.sellConditions = conds(payload.sell);
      if (!body.buyConditions || !body.sellConditions) return null;
    }
    return body;
  }

  function clampInt(v, min, max, def) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  }

  async function copyCode() {
    let code;
    try {
      code = encode();
    } catch (e) {
      toast(e.message);
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast(t("code.copied"));
    } catch (e) {
      prompt(t("code.copy"), code);
    }
  }

  function importCode() {
    const code = prompt(t("code.prompt"));
    if (!code) return;
    const body = decode(code);
    if (!body) {
      toast(t("code.invalid"));
      return;
    }
    fillArenaForm(body);
    toast(t("code.imported"));
  }

  $("btn-code-copy").addEventListener("click", copyCode);
  $("btn-code-import").addEventListener("click", importCode);
})();
