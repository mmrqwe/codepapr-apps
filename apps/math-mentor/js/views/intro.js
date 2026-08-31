import { DOMAIN_META } from "../config.js";
import { state } from "../state.js";
import { toast, api, styleModule, agentRun, htmlEscape, elCursor } from "../utils.js";
import { renderMarkdown } from "../markdown.js";
import { navigate } from "../navigation.js";

function vIntro(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = "<h2>📚 领域导览 — " + htmlEscape(DOMAIN_META[state.domain].label) +
    "</h2><p class='muted'>别急着钻进公式和定义。咱们先花几分钟，把这个领域到底是研究啥的、值不值得学、各章怎么串起来，聊个明白。</p>";
  const body = document.createElement("div"); body.className = "md";
  card.appendChild(body);
  wrap.appendChild(card);
  main.appendChild(wrap);
  loadIntro(body, card);
}

async function loadIntro(body, card) {
  let cached = null;
  try {
    const r = await api("/api/intro?domain=" + encodeURIComponent(state.domain));
    if (r.intro && r.intro.content) cached = r.intro;
  } catch (e) { /* 缓存读取失败则走生成流程 */ }
  if (cached) {
    renderMarkdown(body, cached.content);
    addIntroActions(card, body, true);
  } else {
    await generateIntro(body, card, false);
  }
}

async function generateIntro(body, card, isRegen) {
  const skills = state.skills.filter(s => s.domain === state.domain);
  const goal = state.settings["goal:" + state.domain] || "";
  const timeB = state.settings["time:" + state.domain] || "30";
  const outline = skills.map(s => ({ id: s.id, name: s.name, difficulty: s.difficulty, prereqs: s.prereqs, description: s.description }));
  let acc = "";
  body.innerHTML = '<span class="spinner"></span> <span class="muted">' +
    (isRegen ? "导师正在重新撰写导览…" : "导师正在撰写领域导览（前言 + 总体介绍）…") + "</span>";
  try {
    const res = await agentRun("tutor",
      "【导览任务】不是章节讲解，忽略常规讲解结构。\n领域：" + DOMAIN_META[state.domain].label + "（" + state.domain + "）\n" +
      "知识结构（按学习顺序）：" + JSON.stringify(outline) + "\n" +
      "用户目标：" + (goal || "未设置") + "；每日可用时间：" + timeB + " 分钟\n" +
      "请输出 Markdown 领域导览，严格按以下结构：\n" +
      "## 前言：这个领域研究什么\n（大白话介绍核心问题与历史动机，2-3 段）\n" +
      "## 为什么值得学\n（对后续课程、思维训练、应用的价值）\n" +
      "## 整体知识脉络\n（按学习顺序逐一介绍每个章节：讲什么、为什么处在这个位置、与前后章节的依赖关系，用分节小标题）\n" +
      "## 学习路线建议\n（结合知识依赖给出分阶段建议，并结合用户目标与每日时间）\n" +
      "## 怎么用好这个 App\n（一句话说明学习闭环：先诊断定位 → 按路径逐章学习+练习 → 按遗忘曲线复习）\n" +
      "规则：" + styleModule() + "；公式用 LaTeX（行内 $..$，独立 $$..$$），公式内不用中文；集合大括号必须转义（LaTeX 源码中花括号前加反斜杠）；不要出练习题；总长度约 800 字。",
      (d) => { acc += d; renderMarkdown(body, acc); body.appendChild(elCursor()); });
    acc = res.content || acc;
    renderMarkdown(body, acc);
    if (acc) {
      try {
        await api("/api/intro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: state.domain, content: acc }) });
        toast("📌 导览已保存到本地，下次直接读取");
      } catch (e) { /* 保存失败不影响本次阅读 */ }
    }
    addIntroActions(card, body, true);
  } catch (e) {
    body.innerHTML = '<p class="muted">导览生成失败：' + htmlEscape(e.message) + "</p>";
    const retry = document.createElement("button");
    retry.className = "btn small ghost"; retry.textContent = "🔄 重试生成";
    retry.onclick = () => generateIntro(body, card, false);
    body.appendChild(retry);
  }
}

function addIntroActions(card, body, hasContent) {
  const h2 = card.querySelector("h2");
  if (h2) { h2.style.display = "flex"; h2.style.alignItems = "center"; h2.style.gap = "8px"; h2.style.flexWrap = "wrap"; }
  if (!hasContent || !h2) return;
  const tag = document.createElement("span");
  tag.className = "tag acc"; tag.textContent = "📌 已缓存";
  h2.appendChild(tag);
  const regen = document.createElement("button");
  regen.className = "btn ghost small";
  regen.style.marginLeft = "auto";
  regen.textContent = "🔄 重新生成";
  let armed = false, armTimer = null;
  regen.onclick = () => {
    if (!armed) {
      armed = true;
      regen.textContent = "确认重新生成？（消耗 token）";
      regen.style.borderColor = "var(--red)"; regen.style.color = "var(--red)";
      armTimer = setTimeout(() => { armed = false; regen.textContent = "🔄 重新生成"; regen.style.borderColor = ""; regen.style.color = ""; }, 3000);
      return;
    }
    clearTimeout(armTimer); armed = false;
    regen.remove();
    generateIntro(body, card, true);
  };
  h2.appendChild(regen);
  const foot = document.createElement("div");
  foot.style.cssText = "margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;";
  const toPath = document.createElement("button");
  toPath.className = "btn"; toPath.textContent = "🗺️ 进入学习路径，开始逐章学习 →";
  toPath.onclick = () => navigate("path");
  foot.appendChild(toPath);
  card.appendChild(foot);
}

export { vIntro, loadIntro, generateIntro, addIntroActions };
