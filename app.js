// 本機 AI 聊天室: static page on GitHub Pages, answers come from the visitor's own `opencode serve`.
// Safety: the session asks permission for every tool and this page rejects all of them,
// so the model can only chat. The server is password-protected and CORS-limited to this origin.
const $ = (id) => document.getElementById(id);
const MODEL = { providerID: "opencode", modelID: "big-pickle" };
const ORIGIN = location.origin.startsWith("http") ? location.origin : "https://yillkid.github.io";
const SYSTEM = `你是一個友善的聊天助手，用繁體中文回答，盡量簡短清楚。
你不能上網，也不能使用任何工具；遇到需要即時資料的問題（今天的新聞、股價、天氣等），
直接說明你查不到最新資料，不要編造數字。`;

let base = "", auth = "", sessionID = null, busy = false;

$("cmd").textContent =
  `OPENCODE_SERVER_PASSWORD=自己取一個密碼 \\\n  opencode serve --port 4096 --cors ${ORIGIN}`;

function setStatus(text, cls = "") { const s = $("status"); s.textContent = text; s.className = "status " + cls; }
// tiny, safe Markdown: escape first, then **bold**, `code`, and pipe tables
function esc(t) { return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function inline(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
function md(text) {
  const out = []; const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) {
      const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]); i--;
      const cells = (r) => r.trim().slice(1, -1).split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      out.push("<table>" + body.map((r, k) => "<tr>" + cells(r).map((c) => (k ? "<td>" : "<th>") + inline(c) + (k ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table>");
    } else out.push(inline(lines[i]) + "<br>");
  }
  return out.join("").replace(/(<br>)+$/, "");
}
function add(role, text, meta) {
  const d = document.createElement("div"); d.className = "msg " + role;
  if (role === "bot") d.innerHTML = md(text); else d.textContent = text;
  if (meta) { const m = document.createElement("span"); m.className = "meta"; m.textContent = meta; d.appendChild(m); }
  $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight; return d;
}
async function api(method, path, body) {
  const r = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", Authorization: auth },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) throw new Error("密碼不對（401）");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

// Reject every tool permission request from our session, so the model can only chat.
// Listen on the server's event stream: GET /permission can fail (HTTP 400) for some tools such as
// websearch, which would leave the request pending and the chat stuck forever.
const NO_TOOLS = "這個網頁不允許上網或使用工具。請直接用你已知的知識回答，並說明你查不到即時資料。";
let rejected = 0;
async function reject(id) {
  try { await api("POST", `/permission/${id}/reply`, { reply: "reject", message: NO_TOOLS }); rejected++; }
  catch (_) {} // 404 = already cancelled together with an earlier rejection
}
async function guard(stop) {
  try {
    const r = await fetch(base + "/event", { headers: { Authorization: auth }, signal: stop.signal });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch (_) { continue; }
        const p = ev.properties || {};
        if (ev.type === "permission.asked" && p.sessionID === sessionID) reject(p.id);
      }
    }
  } catch (_) {} // aborted when the answer arrives
}

$("setupForm").onsubmit = async (e) => {
  e.preventDefault();
  base = $("url").value.replace(/\/+$/, "");
  auth = "Basic " + btoa("opencode:" + $("pw").value);
  setStatus("連線中…");
  try {
    const s = await api("POST", "/session", {
      title: "本機 AI 聊天室（網頁）",
      permission: [{ permission: "*", pattern: "*", action: "ask" }],
    });
    sessionID = s.id;
    setStatus(`✅ 已連上本機 OpenCode（session ${sessionID.slice(0, 12)}…），模型：Big Pickle`, "ok");
    $("q").disabled = $("send").disabled = false; $("q").focus();
  } catch (e) {
    setStatus(`❌ 連不上 ${base}：${e.message}。請確認已執行上面的指令、密碼正確，並在瀏覽器詢問時按「允許」存取區域網路。`, "err");
  }
};

async function ask(q) {
  if (!q || busy || !sessionID) return;
  busy = true; $("send").disabled = true; add("user", q);
  const wait = add("bot thinking", "Big Pickle 思考中…");
  const stop = new AbortController(); guard(stop);
  await new Promise((r) => setTimeout(r, 300)); // let the event stream connect first
  const t0 = performance.now(); rejected = 0;
  const send = (text) => api("POST", `/session/${sessionID}/message`, { model: MODEL, system: SYSTEM, parts: [{ type: "text", text }] });
  const textOf = (m) => (m.parts || []).filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
  try {
    let m = await send(q);
    // the model tried a tool, got rejected, and stopped without answering: ask once more without tools
    if (!textOf(m) && !(m.info && m.info.error) && rejected) m = await send(NO_TOOLS);
    const err = m.info && m.info.error;
    wait.remove();
    const note = rejected ? ` · 擋下 ${rejected} 次工具請求` : "";
    add("bot", err ? `（錯誤）${err.data?.message || err.name}` : textOf(m) || "（沒有回覆）",
        `${((performance.now() - t0) / 1000).toFixed(1)} 秒 · opencode/big-pickle${note}`);
  } catch (e) {
    wait.remove(); add("bot", `（連線失敗）${e.message}`);
  } finally {
    stop.abort(); busy = false; $("send").disabled = false; $("q").value = ""; $("q").focus();
  }
}
$("ask").onsubmit = (e) => { e.preventDefault(); ask($("q").value.trim()); };
document.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { if (sessionID) ask(b.textContent); }));
