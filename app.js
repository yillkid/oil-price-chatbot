// 油價小幫手: static page on GitHub Pages, answers come from the visitor's own `opencode serve`.
// Safety: the session asks permission for every tool and this page rejects all of them,
// so the model can only chat. The server is password-protected and CORS-limited to this origin.
const $ = (id) => document.getElementById(id);
const MODEL = { providerID: "opencode", modelID: "big-pickle" };
const ORIGIN = location.origin.startsWith("http") ? location.origin : "https://yillkid.github.io";
const SYSTEM = `你是「油價小幫手」。只根據下面這份台灣中油牌價 CSV 回答（單位：元/公升，由新到舊，
每週一調價；diesel 是超級柴油）。用繁體中文，簡短回答，必要時列出計算過程。
資料沒有的事情就說不知道，不要上網、不要使用任何工具。`;

let csv = "", base = "", auth = "", sessionID = null, busy = false;

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

// reject every tool permission request from our session, so the model can only chat
async function guard(stop) {
  while (!stop.done) {
    try {
      for (const p of (await api("GET", "/permission")) || []) {
        if (p.sessionID === sessionID) {
          await api("POST", `/permission/${p.id}/reply`, { reply: "reject", message: "這個網頁只允許聊天" });
        }
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 700));
  }
}

$("setupForm").onsubmit = async (e) => {
  e.preventDefault();
  base = $("url").value.replace(/\/+$/, "");
  auth = "Basic " + btoa("opencode:" + $("pw").value);
  setStatus("連線中…");
  try {
    if (!csv) csv = await (await fetch("data/oil_prices.csv")).text();
    const s = await api("POST", "/session", {
      title: "油價小幫手（網頁）",
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
  const stop = { done: false }; guard(stop);
  const t0 = performance.now();
  try {
    const m = await api("POST", `/session/${sessionID}/message`, {
      model: MODEL, system: `${SYSTEM}\n\n${csv}`, parts: [{ type: "text", text: q }],
    });
    const err = m.info && m.info.error;
    const text = (m.parts || []).filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
    wait.remove();
    add("bot", err ? `（錯誤）${err.data?.message || err.name}` : text || "（沒有回覆）",
        `${((performance.now() - t0) / 1000).toFixed(1)} 秒 · opencode/big-pickle`);
  } catch (e) {
    wait.remove(); add("bot", `（連線失敗）${e.message}`);
  } finally {
    stop.done = true; busy = false; $("send").disabled = false; $("q").value = ""; $("q").focus();
  }
}
$("ask").onsubmit = (e) => { e.preventDefault(); ask($("q").value.trim()); };
document.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { if (sessionID) ask(b.textContent); }));
