import { DOMAIN_META } from "../config.js";
import { state } from "../state.js";
import { toast, api, masteryOf, agentRun, htmlEscape, elCursor } from "../utils.js";
import { renderMarkdown } from "../markdown.js";

/* ============ 维基查证（防幻觉：对照维基百科检验讲解内容） ============ */
let wikiPanel = null;
// 优先走 papr.http（框架代理，最稳）；SDK 不可用（如直接访问调试页）时降级原生 fetch（维基 API CORS 为 *）
async function wikiGet(url) {
  if (window.papr && window.papr.http && window.papr.http.get) {
    return await window.papr.http.get(url, 20000);
  }
  const r = await fetch(url);
  return { status: r.status, body: await r.text() };
}
function toggleWikiVerify(lessonCard, sk) {
  if (wikiPanel && wikiPanel.isConnected) { wikiPanel.remove(); return; }
  wikiPanel = document.createElement("div");
  wikiPanel.className = "wiki-panel";
  wikiPanel.innerHTML =
    "<b>🔍 维基查证</b> <span class='muted'>对照维基百科，检验上面讲解的准确性</span>" +
    "<div style='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap'>" +
    '<input type="text" id="wiki-q" value="' + htmlEscape(sk.name) + '" placeholder="词条名（可修改）">' +
    '<button class="btn small" id="wiki-go">查询</button></div>' +
    '<div class="wiki-result" style="margin-top:10px"></div>';
  lessonCard.appendChild(wikiPanel);
  const run = async () => {
    const inp = document.getElementById("wiki-q");
    const goBtn = document.getElementById("wiki-go");
    const box = wikiPanel.querySelector(".wiki-result");
    const q = inp.value.trim();
    if (!q) { toast("请输入词条名", true); return; }
    goBtn.disabled = true;
    box.innerHTML = '<span class="spinner"></span> <span class="muted">正在查询中文维基百科…</span>';
    try {
      const r = await wikiGet("https://zh.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(q));
      if (r.status !== 200) throw new Error("HTTP " + r.status);
      const data = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
      const pageUrl = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || "";
      box.innerHTML =
        "<b>" + htmlEscape(data.title || q) + "</b>" +
        (data.description ? " <span class='tag acc'>" + htmlEscape(data.description) + "</span>" : "") +
        "<p class='muted' style='margin-top:6px'>" + htmlEscape(data.extract || "（该词条暂无摘要）") + "</p>" +
        (pageUrl ? "<a href='" + htmlEscape(pageUrl) + "' target='_blank' rel='noopener' style='font-size:12.5px'>在维基百科中打开 →</a>" : "");
    } catch (e) {
      box.innerHTML = "<p class='muted'>查询失败：" + htmlEscape(e.message) +
        "<br>可能原因：中文维基没有这个词条。试试更通用的说法，或手动输入英文词条（如 Limit of a sequence）再查。</p>";
    } finally {
      goBtn.disabled = false;
    }
  };
  document.getElementById("wiki-go").onclick = run;
  document.getElementById("wiki-q").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
}

/* ============ 提问（上下文问答：自动带学科/课程/当前节） ============ */
function qaHistoryOf(skillId) {
  try { const v = state.settings["qa:" + skillId]; const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
async function saveQAHistory(skillId, arr) {
  const v = JSON.stringify(arr.slice(-20));
  state.settings["qa:" + skillId] = v;
  try { await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "qa:" + skillId, value: v }) }); } catch (e) {}
}
function qaContextText() {
  const sk = state.activeSkill;
  if (!sk) return null;
  const domainLabel = (DOMAIN_META[state.domain] || {}).label || state.domain;
  const cat = (DOMAIN_META[state.domain] || {}).category || "other";
  const secs = state.sections || [];
  const n = secs.length;
  const idx = Number(state.sectionIdx) || 0;
  const cur = secs[idx] || {};
  const outline = (state.outline || []).map((s, i) => (i + 1) + ". " + s.title).join("；") || "（无大纲）";
  return { domainLabel, cat, sk, cur, n, idx, outline };
}
function buildQATask(question) {
  const ctx = qaContextText();
  if (!ctx) return question;
  const sk = ctx.sk;
  const m = masteryOf(sk.id);
  let curContent = String(ctx.cur.content || "").slice(0, 3000);
  if (ctx.cur.content && ctx.cur.content.length > 3000) curContent += "\n…（已截断）";
  const otherTitles = (state.sections || []).map((s, i) => i === ctx.idx ? "[当前]" + s.title : s.title).join("、") || "（无）";
  const pts = ((state.outline || [])[ctx.idx] && (state.outline || [])[ctx.idx].points) ? (state.outline || [])[ctx.idx].points.join("；") : "（无）";
  const history = qaHistoryOf(sk.id).slice(-6).map(h => (h.role === "user" ? "用户：" : "助手：") + String(h.content || "").slice(0, 400)).join("\n") || "（无）";
  return "【课程问答】\n学科：" + ctx.domainLabel + "（" + state.domain + "，类别：" + ctx.cat + "）\n课程：" + sk.name + "（" + sk.id + "，难度 " + sk.difficulty + "，掌握度 " + m.toFixed(2) + "）\n课程描述：" + sk.description + "\n全章大纲：" + ctx.outline + "\n全章各节：" + otherTitles + "\n当前节：第 " + (ctx.idx + 1) + " / " + ctx.n + " 节 · " + (ctx.cur.title || "（无标题）") + "\n当前节要点：" + pts + "\n当前节正文（节选）：\n" + (curContent || "（本节尚未生成）") + "\n\n历史问答（最近）：\n" + history + "\n\n用户提问：" + question + "\n\n请结合上述课程上下文回答，紧扣当前节与全章，不要脱离课程空谈。";
}
function renderQACard(qaCard) {
  if (!qaCard) return;
  qaCard.innerHTML = "<h2>💬 提问</h2><p class='muted' style='font-size:13px;margin:6px 0 0'>结合当前学科与课程上下文提问，Agent 会紧扣本节内容回答。</p>";
  const ctxEl = document.createElement("div"); ctxEl.className = "qa-ctx"; ctxEl.id = "qa-ctx";
  qaCard.appendChild(ctxEl);
  const historyEl = document.createElement("div"); historyEl.className = "qa-history"; historyEl.id = "qa-history";
  qaCard.appendChild(historyEl);
  const quick = document.createElement("div"); quick.className = "qa-quick";
  const quickQs = ["用一个例子再讲讲", "和上一节有什么联系？", "常见误区是什么？", "出一个小练习检验我"];
  quickQs.forEach(q => { const b = document.createElement("button"); b.type = "button"; b.textContent = q; b.onclick = () => { const inp = document.getElementById("qa-input"); if (inp) { inp.value = q; inp.focus(); } }; quick.appendChild(b); });
  qaCard.appendChild(quick);
  const row = document.createElement("div"); row.className = "qa-input-row";
  const ta = document.createElement("textarea"); ta.id = "qa-input"; ta.placeholder = "输入你的问题…（Enter 发送，Shift+Enter 换行）"; ta.rows = 2;
  const send = document.createElement("button"); send.className = "btn"; send.id = "qa-send"; send.textContent = "发送";
  row.append(ta, send);
  qaCard.appendChild(row);
  const clear = document.createElement("button"); clear.className = "btn ghost small"; clear.textContent = "清空记录"; clear.title = "清空本课程的问答历史"; clear.style.marginTop = "8px";
  qaCard.appendChild(clear);
  function refreshCtx() {
    const sk = state.activeSkill;
    if (!sk) { ctxEl.textContent = "未选择课程"; return; }
    const domainLabel = (DOMAIN_META[state.domain] || {}).label || state.domain;
    const secs = state.sections || []; const n = secs.length; const idx = Number(state.sectionIdx) || 0; const cur = secs[idx] || {};
    ctxEl.innerHTML = "<b>" + htmlEscape(domainLabel) + "</b> · <b>" + htmlEscape(sk.name) + "</b>" + (n ? " · 第 " + (idx + 1) + " / " + n + " 节 · <b>" + htmlEscape(cur.title || "") + "</b>" : "") + " <span style='float:right;color:var(--muted)'>掌握度 " + Math.round(masteryOf(sk.id) * 100) + "%</span>";
  }
  function refreshHistory() {
    const sk = state.activeSkill;
    if (!sk) { historyEl.innerHTML = "<div class='qa-empty'>请选择课程后提问</div>"; return; }
    const arr = qaHistoryOf(sk.id);
    if (!arr.length) { historyEl.innerHTML = "<div class='qa-empty'>还没有提问。试试：<br>“这一节的核心公式怎么理解？”<br>“能举一个具体例子吗？”</div>"; return; }
    historyEl.innerHTML = "";
    arr.forEach(msg => {
      const div = document.createElement("div"); div.className = "qa-msg " + msg.role;
      const meta = document.createElement("div"); meta.className = "qa-meta"; meta.textContent = (msg.role === "user" ? "你" : "助手") + " · " + new Date(msg.ts || Date.now()).toLocaleTimeString();
      const body = document.createElement("div"); body.className = msg.role === "assistant" ? "md" : "";
      if (msg.role === "assistant") { renderMarkdown(body, msg.content); } else { body.textContent = msg.content; }
      div.append(meta, body);
      historyEl.appendChild(div);
    });
    historyEl.scrollTop = historyEl.scrollHeight;
  }
  refreshCtx(); refreshHistory();
  state.qaEls = { card: qaCard, ctxEl, historyEl, input: ta, sendBtn: send, refreshCtx, refreshHistory };
  async function doSend() {
    const q = ta.value.trim();
    if (!q) return;
    const sk = state.activeSkill;
    if (!sk) { toast("请先选择课程", true); return; }
    const hasAI = !!(window.papr && window.papr.agent && window.papr.agent.run);
    if (!hasAI) { toast("AI 能力不可用：请从 CodePapr 应用面板打开", true); return; }
    ta.value = "";
    const arr = qaHistoryOf(sk.id);
    arr.push({ role: "user", content: q, ts: Date.now() });
    await saveQAHistory(sk.id, arr);
    refreshHistory();
    const placeholder = { role: "assistant", content: "", ts: Date.now() };
    arr.push(placeholder);
    await saveQAHistory(sk.id, arr);
    refreshHistory();
    const lastDiv = historyEl.lastElementChild;
    const body = lastDiv ? lastDiv.querySelector(".md") : null;
    let acc = "";
    send.disabled = true; send.textContent = "思考中…";
    try {
      const task = buildQATask(q);
      const res = await agentRun("qa", task, (d) => {
        acc += d;
        placeholder.content = acc;
        if (body) { renderMarkdown(body, acc); body.appendChild(elCursor()); historyEl.scrollTop = historyEl.scrollHeight; }
      });
      acc = res.content || acc;
      placeholder.content = acc;
      if (body) { renderMarkdown(body, acc); }
      await saveQAHistory(sk.id, arr);
      refreshHistory();
    } catch (e) {
      placeholder.content = "提问失败：" + (e.message || String(e));
      if (body) { body.textContent = placeholder.content; }
      await saveQAHistory(sk.id, arr);
      refreshHistory();
      toast("提问失败：" + (e.message || String(e)), true);
    } finally {
      send.disabled = false; send.textContent = "发送";
      ta.focus();
    }
  }
  send.onclick = doSend;
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });
  clear.onclick = async () => {
    const sk = state.activeSkill;
    if (!sk) return;
    if (!window.confirm("清空本课程（" + sk.name + "）的全部问答历史？")) return;
    await saveQAHistory(sk.id, []);
    refreshHistory();
    toast("已清空问答历史");
  };
}

export { wikiGet, toggleWikiVerify, qaHistoryOf, saveQAHistory, qaContextText, buildQATask, renderQACard };
