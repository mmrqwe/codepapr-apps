import { DOMAIN_META } from "../config.js";
import { state, skillById } from "../state.js";
import { toast, api, masteryColor, masteryOf, skipPrereq, parseAgentJSON, STYLE_PRESETS, styleById, currentStyle, styleModule, agentRun, htmlEscape, elCursor } from "../utils.js";
import { renderMarkdown } from "../markdown.js";
import { navigate, renderView } from "../navigation.js";
import { outlineOf, saveOutline, clearOutline, isOutlineStale, isSectionsThin, readSecsOf, markSectionRead, saveLastSkill, saveLastSection, getLastSkill, getLastSection, restoreSectionIdx, adjacentSkills } from "../storage.js";
import { adaptiveRangeFor, dimensionsForCategory, quizCountFor } from "../adaptive.js";
import { openExportMenu, doExportLesson } from "../ppt.js";
// Dynamic cross-view helpers to avoid cycles
async function getWiki() { return await import("./wiki-qa.js"); }
async function getQuiz() { return await import("./quiz.js"); }
async function getMisc() { return await import("./misc.js"); }

async function openLearn(skillId) {
  const sk = skillById(skillId);
  if (!sk) return;
  const unmet = skipPrereq() ? [] : sk.prereqs.filter(p => masteryOf(p) < 0.5);
  if (unmet.length) {
    const names = unmet.map(p => (skillById(p) || {}).name || p).join("、");
    toast("⚠️ 先修未达标：" + names, true);
    state.view = "path";
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === "path"));
    renderView();
    return;
  }
  state.activeSkill = sk; state.lesson = null; state.lessonDone = false; state.sections = []; state.sectionIdx = restoreSectionIdx(sk.id, 999); state.sectionAll = false; state.legacyLesson = null; state.lessonViewMode = "sections"; state.outline = []; state.genBusy = false; state.quiz = []; state.quizIdx = 0; state.quizResults = []; state.quizScope = null;
  saveLastSkill(sk.domain, sk.id);
  state.view = "learn";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", false));
  renderLearn();
}

async function renderLearn() {
  const main = document.getElementById("main");
  const sk = state.activeSkill;
  main.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "wrap";

  const head = document.createElement("div"); head.className = "card";
  const m = masteryOf(sk.id);
  head.innerHTML = "<div style='display:flex;align-items:center;gap:10px;flex-wrap:wrap'>" +
    "<button class='btn ghost small' id='back-btn'>← 返回路径</button>" +
    "<h2 style='margin:0'>" + htmlEscape(sk.name) + "</h2>" +
    '<span class="tag">难度 ' + sk.difficulty.toFixed(2) + "</span>" +
    '<span class="tag" style="color:' + masteryColor(m) + ';border-color:' + masteryColor(m) + '">掌握度 ' + Math.round(m * 100) + "%</span></div>" +
    '<p class="muted" style="margin-top:8px">' + htmlEscape(sk.description) + "</p>";
  wrap.appendChild(head);

  const lessonCard = document.createElement("div"); lessonCard.className = "card";
  lessonCard.innerHTML = "<h2>📖 讲解</h2>";
  const lessonBody = document.createElement("div"); lessonBody.className = "md";
  lessonBody.id = "lesson-body";
  lessonCard.appendChild(lessonBody);
  wrap.appendChild(lessonCard);

  const quizCard = document.createElement("div"); quizCard.className = "card";
  quizCard.innerHTML = "<h2>✍️ 练习</h2>";
  quizCard.id = "quiz-card";
  wrap.appendChild(quizCard);

  const qaCard = document.createElement("div"); qaCard.className = "card";
  qaCard.id = "qa-card";
  qaCard.innerHTML = "<h2>💬 提问</h2><p class='muted' style='font-size:13px;margin:6px 0 0'>结合当前学科与课程上下文提问，Agent 会紧扣本节内容回答。</p>";
  wrap.appendChild(qaCard);

  main.appendChild(wrap);
  document.getElementById("back-btn").onclick = () => navigate("path");

  // ---- 讲解：优先读 SQLite 缓存，无缓存时生成并保存；可手动重新生成 ----
  state.lessonEls = { body: lessonBody, card: lessonCard };
  await loadLesson(sk, lessonBody, lessonCard, m);

  const startBtn = document.createElement("button");
  startBtn.className = "btn"; startBtn.style.marginTop = "12px";
  const hasAI = !!(window.papr && window.papr.agent && window.papr.agent.run);
  startBtn.disabled = !hasAI;
  startBtn.onclick = async () => { const m = await import("./quiz.js"); return m.startQuiz(); };
  quizCard.appendChild(startBtn);
  // 自适应题量：按技能难度/掌握度/历史错题动态决定，并展示原因
  const planNote = document.createElement("p"); planNote.className = "muted";
  planNote.style.cssText = "margin:8px 0 0;font-size:13px";
  quizCard.appendChild(planNote);
  const applyPlan = (plan) => {
    startBtn.textContent = "开始练习（" + plan.count + " 道题）";
    planNote.textContent = "📐 自适应题量：" + (plan.reasons.length ? plan.reasons.join(" · ") : "标准 3 题") + "。难度越高、历史错题越多，题量越大。";
  };
  applyPlan(quizCountFor(sk, 0));
  try {
    const w = await api("/api/wrong?domain=" + state.domain);
    const wc = (w.wrong || []).filter(x => x.skill_id === sk.id).length;
    if (wc > 0) applyPlan(quizCountFor(sk, wc));
  } catch (e) {}
  const genN = state.sections.filter(s => s && s.content).length;
  if (state.sections.length && genN < state.sections.length) {
    startBtn.textContent = "开始练习（基于已生成 " + genN + "/" + state.sections.length + " 节）";
    planNote.textContent = "📝 还有 " + (state.sections.length - genN) + " 节未生成：出题将只覆盖已生成内容，建议学完全部章节再练习。";
  }
  // 提问卡片（上下文问答）
  (await getWiki()).renderQACard(qaCard);
}

async function loadLesson(sk, lessonBody, lessonCard, m) {
  let sections = null, legacy = null;
  try {
    const r = await api("/api/lesson-sections?skill_id=" + encodeURIComponent(sk.id));
    if (r.sections && r.sections.length) sections = r.sections;
  } catch (e) { /* 分节缓存读取失败则回退旧缓存 */ }
  if (!sections) {
    try {
      const r2 = await api("/api/lesson?skill_id=" + encodeURIComponent(sk.id));
      if (r2.lesson && r2.lesson.content) legacy = r2.lesson.content;
    } catch (e) { /* 缓存读取失败则走生成流程 */ }
  }
  const outline = outlineOf(sk.id);
  const outlineStale = typeof isOutlineStale === "function" ? isOutlineStale(sk, outline) : false;
  const sectionsStale = sections ? (typeof isSectionsThin === "function" ? isSectionsThin(sk, sections) : false) : false;
  if (outlineStale || sectionsStale) {
    state.staleCache = { outlineStale, sectionsStale, outlineLen: outline.length, sectionsLen: sections ? sections.length : 0 };
  } else {
    state.staleCache = null;
  }
  // 风险修复：大纲过期且无已生成节 → 直接清理并重建（避免 8节×700字 旧大纲卡住）
  if (outlineStale && (!sections || sections.length === 0)) {
    try { await clearOutline(sk.id); } catch (e) {}
    // 清理后走下方生成流程，不直接返回
  } else if (sections) {
    state.outline = outline.length ? outline : sections.map((s, i) => ({ title: s.title || ("第 " + (i + 1) + " 节"), points: [], est_chars: 900 }));
    state.sections = sections.map(s => ({ title: String(s.title || ""), content: String(s.content || "") }));
    if (outline.length > state.sections.length) {
      for (let i = state.sections.length; i < outline.length; i++) state.sections.push({ title: outline[i].title, content: "" });
    }
    state.sectionIdx = restoreSectionIdx(sk.id, state.sections.length); state.sectionAll = false; state.lessonViewMode = "sections";
    state.legacyLesson = legacy;
    state.lesson = state.sections.map(s => (s && s.content) || "").filter(Boolean).join("\n\n");
    state.lessonDone = true;
    renderLessonSections(sk, lessonCard, lessonBody, m);
    renderStaleBanner(sk, lessonCard, lessonBody, m);
    return;
  }
  if (outline.length && !outlineStale) {
    state.outline = outline;
    state.sections = outline.map(s => ({ title: s.title, content: "" }));
    state.sectionIdx = restoreSectionIdx(sk.id, outline.length); state.sectionAll = false; state.lessonViewMode = "sections";
    state.legacyLesson = legacy;
    state.lesson = ""; state.lessonDone = true;
    renderLessonSections(sk, lessonCard, lessonBody, m);
    return;
  }
  if (outlineStale && outline.length) {
    // 大纲过期但有大纲无节 → 已在上方清理，这里兜底直接重建
    try { await clearOutline(sk.id); } catch (e) {}
  }
  if (legacy) {
    state.sections = [{ title: "全文", content: legacy }];
    state.sectionIdx = 0; state.sectionAll = false; state.lessonViewMode = "sections";
    state.legacyLesson = legacy;
    state.lesson = legacy; state.lessonDone = true;
    renderLessonSections(sk, lessonCard, lessonBody, m);
    return;
  }
  await generateLesson(sk, lessonBody, lessonCard, m, false, {});
}

// 出题学习材料：整章所有分节按序拼接，超长截断（保持出题 grounded 在已学内容上）
function lessonMaterialForQuiz() {
  const secs = (state.sections || []).filter(s => s && s.content);
  if (secs.length) {
    let text = secs.map((s, i) => "## " + (i + 1) + ". " + (s.title || ("第 " + (i + 1) + " 节")) + "\n\n" + s.content).join("\n\n---\n\n");
    if (text.length > 12000) text = text.slice(0, 12000) + "\n\n……（学习材料过长，已截断）";
    return text;
  }
  return state.lesson || "";
}

async function generateLesson(sk, lessonBody, lessonCard, m, isRegen, opts) {
  if (state.genBusy) return;
  state.genBusy = true;
  opts = opts || {};
  const rg = adaptiveRangeFor(sk);
  const minS = rg.minS, maxS = rg.maxS;
  const genNotice = (msg) => {
    lessonBody.innerHTML = "<div class='sec-gen-status'><span class='spinner'></span> <span class='muted'>" + msg + "</span></div>";
  };
  genNotice("导师正在设计章节结构（" + minS + "-" + maxS + " 节，" + rg.estMin + "-" + rg.estMax + "字/节）…");
  try {
    const outline = await genSectionOutline(sk, m, minS, maxS);
    state.outline = outline;
    state.sections = outline.map(s => ({ title: s.title, content: "" }));
    state.sectionIdx = 0; state.sectionAll = false; state.lessonViewMode = "sections";
    state.lesson = ""; state.lessonDone = true;
    await saveOutline(sk.id, outline);
    try {
      await api("/api/lesson-sections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_id: sk.id, sections: [] }) });
    } catch (e) { /* 清除旧分节失败不阻塞 */ }
    renderLessonSections(sk, lessonCard, lessonBody, m);
    toast("📐 章节结构已设计（" + outline.length + " 节），正在逐节自动生成…");
    state.genBusy = false; // 让 resumeSections 重新接管生成锁（它自带防重入守卫）
    await resumeSections(sk, lessonCard, lessonBody, m);
  } catch (e) {
    lessonBody.innerHTML = "<p class='muted'>分节目录生成失败：" + htmlEscape(e.message || String(e)) + "</p>";
    const retry = document.createElement("button"); retry.className = "btn small ghost"; retry.textContent = "🔄 重试生成";
    retry.onclick = () => generateLesson(sk, lessonBody, lessonCard, m, false, {});
    lessonBody.appendChild(retry);
  } finally {
    state.genBusy = false;
  }
}

// 生成单节（一次一个 AI 调用，成功返回 true；失败渲染重试入口并返回 false）
async function generateSectionAt(sk, lessonCard, lessonBody, m, idx, silent) {
  const outline = state.outline || [];
  const sec = outline[idx];
  if (!sec) return false;
  const prefs = state.settings["pref:" + state.domain] || "公式推导、例子驱动";
  state.sectionIdx = idx;
  const genNotice = (msg) => {
    lessonBody.innerHTML = "<div class='sec-gen-status'><span class='spinner'></span> <span class='muted'>" + msg + "</span></div>";
  };
  genNotice("正在写第 " + (idx + 1) + " / " + outline.length + " 节：<b>" + htmlEscape(sec.title) + "</b>（本节约 " + sec.est_chars + " 字）");
  try {
    const content = await genSectionBody(sk, m, prefs, outline, idx, lessonBody);
    state.sections[idx] = { title: sec.title, content };
    state.lessonDone = true;
    state.lesson = state.sections.map(s => (s && s.content) || "").filter(Boolean).join("\n\n");
    try {
      await api("/api/lesson-section", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_id: sk.id, seq: idx, title: sec.title, content }) });
    } catch (e) { /* 单节保存失败不中断后续生成 */ }
    renderLessonSections(sk, lessonCard, lessonBody, m);
    if (!silent) toast("📌 第 " + (idx + 1) + " 节已保存");
    return true;
  } catch (e) {
    lessonBody.innerHTML = "<p class='muted'>第 " + (idx + 1) + " 节「" + htmlEscape(sec.title) + "」生成失败：" + htmlEscape(e.message || String(e)) + "</p>";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";
    const retry = document.createElement("button"); retry.className = "btn small ghost"; retry.textContent = "🔄 重试本节";
    retry.onclick = async () => {
      if (state.genBusy) return;
      state.genBusy = true;
      try { await generateSectionAt(sk, lessonCard, lessonBody, m, idx, false); }
      finally { state.genBusy = false; }
    };
    const cont = document.createElement("button"); cont.className = "btn small"; cont.textContent = "▶ 继续生成剩余节";
    cont.onclick = () => resumeSections(sk, lessonCard, lessonBody, m);
    row.append(retry, cont);
    lessonBody.appendChild(row);
    return false;
  }
}

// 从第一个未生成的节开始，自动逐节生成全部剩余节（每节独立调用、立即落库，失败不丢已生成内容）
async function resumeSections(sk, lessonCard, lessonBody, m) {
  if (state.genBusy) return;
  const outline = state.outline || [];
  state.genBusy = true;
  try {
    let idx = state.sections.findIndex(s => !s || !s.content);
    while (idx >= 0 && idx < outline.length) {
      const ok = await generateSectionAt(sk, lessonCard, lessonBody, m, idx, true);
      if (!ok) break;
      idx = state.sections.findIndex(s => !s || !s.content);
    }
    const rest = state.sections.filter(s => !s || !s.content).length;
    if (!rest) toast("🎉 全部 " + state.sections.length + " 节已生成完毕，可以开始练习了");
    else if (state.sections.some(s => s && s.content)) toast("⚠️ 已生成 " + (state.sections.length - rest) + " / " + state.sections.length + " 节，剩余节生成中断：点「▶ 继续生成剩余节」补齐", true);
  } finally {
    state.genBusy = false;
    renderLessonSections(sk, lessonCard, lessonBody, m);
  }
}

// 大纲持久化：settings key outline:<skill_id>（刷新/重启后可续跑）
function renderStaleBanner(sk, lessonCard, lessonBody, m) {
  const sc = state.staleCache;
  if (!sc || (!sc.outlineStale && !sc.sectionsStale)) return;
  const rg = (typeof adaptiveRangeFor === "function" ? adaptiveRangeFor(sk) : { minS: 8, maxS: 14, estMin: 1200, estMax: 1800 });
  let old = lessonCard.querySelector(".stale-banner");
  if (old) old.remove();
  const banner = document.createElement("div");
  banner.className = "stale-banner";
  banner.style.cssText = "margin:10px 0;padding:10px 12px;border:1px solid var(--warn, #f59e0b);background:color-mix(in srgb, var(--warn, #f59e0b) 10%, var(--panel));border-radius:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px";
  const reason = sc.outlineStale ? ("旧大纲 " + sc.outlineLen + " 节（偏薄/通用标题）") : "";
  const thin = sc.sectionsStale ? "已生成内容偏薄" : "";
  const msg = document.createElement("span");
  msg.innerHTML = "⚠️ 检测到旧版缓存" + (reason || thin ? "（" + [reason, thin].filter(Boolean).join("，") + "）" : "") + "，新标准为 <b>" + rg.minS + "-" + rg.maxS + " 节 × " + rg.estMin + "-" + rg.estMax + "字/节</b>。建议重建以达到教材厚度。";
  msg.style.flex = "1";
  const btn = document.createElement("button");
  btn.className = "btn small";
  btn.textContent = "🔄 一键重建（清除旧大纲并重生成）";
  btn.title = "清除旧大纲与已生成节，按新标准重新设计章节结构并逐节生成";
  btn.onclick = async () => {
    if (state.genBusy) return;
    if (!window.confirm("将清除该技能的旧大纲与已生成内容，按新标准（" + rg.minS + "-" + rg.maxS + " 节 × " + rg.estMin + "-" + rg.estMax + "字/节）重新生成。继续？")) return;
    try { await clearOutline(sk.id); } catch (e) {}
    state.staleCache = null;
    state.outline = []; state.sections = []; state.sectionIdx = 0; state.sectionAll = false;
    const b = lessonCard.querySelector(".stale-banner");
    if (b) b.remove();
    await generateLesson(sk, lessonBody, lessonCard, m, true, {});
  };
  const dismiss = document.createElement("button");
  dismiss.className = "btn ghost small";
  dismiss.textContent = "✕ 忽略";
  dismiss.onclick = () => { state.staleCache = null; const b = lessonCard.querySelector(".stale-banner"); if (b) b.remove(); };
  banner.append(msg, btn, dismiss);
  const bar = lessonCard.querySelector(".sec-bar");
  if (bar && bar.parentNode) bar.parentNode.insertBefore(banner, bar.nextSibling);
  else lessonCard.insertBefore(banner, lessonBody);
}
function renderLessonSections(sk, lessonCard, lessonBody, m) {
  const secs = state.sections || [];
  const n = secs.length;
  const viewLegacy = state.lessonViewMode === "legacy" && !!state.legacyLesson;
  const hasNew = n >= 2;
  const h2 = lessonCard.querySelector("h2");
  if (h2) {
    h2.style.display = "flex"; h2.style.alignItems = "center"; h2.style.gap = "8px"; h2.style.flexWrap = "wrap";
    h2.innerHTML = "📖 讲解";
    const tag = document.createElement("span"); tag.className = "tag acc";
    const genCount = secs.filter(s => s && s.content).length;
    tag.textContent = viewLegacy ? "🕰️ 旧版（单页）" : (hasNew ? (genCount < n ? "📌 已生成 " + genCount + " / " + n + " 节" : "📌 已缓存 · " + n + " 节") : "📌 已缓存");
    h2.appendChild(tag);
    const wiki = document.createElement("button");
    wiki.className = "btn ghost small"; wiki.id = "wiki-verify-btn";
    wiki.textContent = "🔍 维基查证"; wiki.title = "对照维基百科检验讲解内容的准确性（防幻觉）";
    wiki.onclick = async () => (await getWiki()).toggleWikiVerify(lessonCard, sk);
    h2.appendChild(wiki);
    const pptBtn = document.createElement("button"); pptBtn.className = "btn ghost small"; pptBtn.textContent = "📊 导出 PPT";
    pptBtn.title = "把讲解内容导出为 PPT 文件（支持全部节或仅当前节）";
    const hasPptContent = secs.some(s => s && s.content);
    pptBtn.disabled = !hasPptContent;
    if (!hasPptContent) pptBtn.title = "还没有已生成的讲解内容，暂不能导出";
    pptBtn.onclick = () => {
      const withC = (state.sections || []).filter(s => s && s.content);
      const cur = state.sections[state.sectionIdx];
      if (withC.length > 1 && cur && cur.content) openExportMenu(sk, pptBtn);
      else doExportLesson(sk, "all", pptBtn);
    };
    h2.appendChild(pptBtn);
    if (!viewLegacy && hasNew) {
      const allBtn = document.createElement("button"); allBtn.className = "btn ghost small";
      allBtn.textContent = state.sectionAll ? "📄 分节阅读" : "📜 查看全文";
      allBtn.onclick = () => { state.sectionAll = !state.sectionAll; renderLessonSections(sk, lessonCard, lessonBody, m); };
      h2.appendChild(allBtn);
      const nextMissing = secs.findIndex(s => !s || !s.content);
      if (nextMissing >= 0) {
        const genNext = document.createElement("button"); genNext.className = "btn small"; genNext.textContent = "▶ 继续生成剩余节";
        genNext.title = "自动逐节生成剩余内容（每节一次调用，失败不丢已生成内容）";
        genNext.disabled = !!state.genBusy;
        genNext.onclick = () => resumeSections(sk, lessonCard, lessonBody, m);
        h2.appendChild(genNext);
      }
      if (state.legacyLesson) {
        const oldBtn = document.createElement("button"); oldBtn.className = "btn ghost small"; oldBtn.textContent = "🕰️ 旧版";
        oldBtn.title = "切换回升级前的单页讲解";
        oldBtn.onclick = () => { state.lessonViewMode = "legacy"; state.sectionAll = false; renderLessonSections(sk, lessonCard, lessonBody, m); };
        h2.appendChild(oldBtn);
      }
    } else if (viewLegacy) {
      const backBtn = document.createElement("button"); backBtn.className = "btn small"; backBtn.textContent = "✨ 回到分节版";
      backBtn.onclick = () => { state.lessonViewMode = "sections"; renderLessonSections(sk, lessonCard, lessonBody, m); };
      h2.appendChild(backBtn);
    } else if (!hasNew) {
      const up = document.createElement("button"); up.className = "btn small"; up.textContent = "⬆️ 升级为分节讲解";
      up.title = "重新生成为分节讲解（调用 AI，消耗 token，约需 1-3 分钟；旧版会保留）";
      up.onclick = () => {
        const rgU = (typeof adaptiveRangeFor === "function" ? adaptiveRangeFor(sk) : { minS: 3, maxS: 8 });
        if (!window.confirm("将把这门课设计为 " + rgU.minS + "-" + rgU.maxS + " 节的分节讲解：自动逐节生成（每节一次调用、约 10-30 秒），中途失败不丢已生成内容，可继续补齐。旧版会保留，可随时切回。继续？")) return;
        generateLesson(sk, lessonBody, lessonCard, m, false, { upgrade: true });
      };
      h2.appendChild(up);
    }
    const styleSel = document.createElement("select"); styleSel.className = "style-sel";
    styleSel.title = "切换讲解风格（切换后按新风格重新生成）";
    STYLE_PRESETS.forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.label; styleSel.appendChild(o); });
    styleSel.value = currentStyle();
    styleSel.onchange = async () => {
      if (styleSel.value === "custom") { styleSel.value = currentStyle(); (await getMisc()).openSettings(); return; }
      const newStyle = styleSel.value;
      if (newStyle === currentStyle()) return;
      await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "style:" + state.domain, value: newStyle }) });
      state.settings["style:" + state.domain] = newStyle;
      toast("🎨 已切换为「" + styleById(newStyle).label + "」，重新生成中…");
      generateLesson(sk, lessonBody, lessonCard, m, true, {});
    };
    h2.appendChild(styleSel);
    if (!viewLegacy && hasNew) {
      // 重写本节：只重新生成当前节，目录与其他节保持不变
      const rewrite = document.createElement("button"); rewrite.className = "btn ghost small";
      const curHas = !!(secs[state.sectionIdx] && secs[state.sectionIdx].content);
      const rwIdle = () => { rewrite.textContent = curHas ? "✏️ 重写本节" : "✏️ 生成本节"; };
      rewrite.title = curHas ? "只重新生成当前这一节，目录和其他节保持不变" : "只生成当前这一节";
      rwIdle();
      rewrite.disabled = !!state.genBusy;
      let armedR = false, armTimerR = null;
      rewrite.onclick = () => {
        if (state.genBusy) return;
        if (!armedR) {
          armedR = true;
          rewrite.textContent = curHas ? "确认重写本节？（消耗 token，其他节不受影响）" : "确认生成本节？（消耗 token）";
          rewrite.style.borderColor = "var(--red)"; rewrite.style.color = "var(--red)";
          armTimerR = setTimeout(() => { armedR = false; rwIdle(); rewrite.style.borderColor = ""; rewrite.style.color = ""; }, 3000);
          return;
        }
        clearTimeout(armTimerR); armedR = false;
        rewrite.textContent = "⏳ 生成中…"; rewrite.disabled = true;
        (async () => {
          state.genBusy = true;
          try { await generateSectionAt(sk, lessonCard, lessonBody, m, state.sectionIdx, false); }
          finally { state.genBusy = false; renderLessonSections(sk, lessonCard, lessonBody, m); }
        })();
      };
      h2.appendChild(rewrite);
    }
    if (!viewLegacy) {
      // 全部重新生成：重新设计章节结构并逐节生成全部内容
      const regen = document.createElement("button"); regen.className = "btn ghost small";
      regen.textContent = "🔄 全部重新生成";
      regen.title = "重新设计章节结构并逐节生成全部内容";
      regen.disabled = !!state.genBusy;
      let armed = false, armTimer = null;
      regen.onclick = () => {
        if (state.genBusy) return;
        if (!armed) {
          armed = true;
          regen.textContent = "确认全部重新生成？（重新设计章节结构并逐节生成，消耗 token）";
          regen.style.borderColor = "var(--red)"; regen.style.color = "var(--red)";
          armTimer = setTimeout(() => { armed = false; regen.textContent = "🔄 全部重新生成"; regen.style.borderColor = ""; regen.style.color = ""; }, 3000);
          return;
        }
        clearTimeout(armTimer); armed = false;
        generateLesson(sk, lessonBody, lessonCard, m, true, {});
      };
      h2.appendChild(regen);
    }
  }
  // 工具栏（仅分节版）
  let bar = lessonCard.querySelector(".sec-bar");
  if (!bar) { bar = document.createElement("div"); bar.className = "sec-bar"; lessonCard.insertBefore(bar, lessonBody); }
  bar.innerHTML = "";
  if (!viewLegacy && n >= 2 && !state.sectionAll) {
    const sel = document.createElement("select"); sel.className = "sec-select";
    secs.forEach((s, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = (i + 1) + ". " + s.title + (s && s.content ? "" : "（未生成）"); sel.appendChild(o); });
    sel.value = String(state.sectionIdx);
    sel.onchange = () => { state.sectionIdx = Number(sel.value); markSectionRead(sk.id, state.sectionIdx); saveLastSection(sk.id, state.sectionIdx); renderLessonSections(sk, lessonCard, lessonBody, m); };
    const prev = document.createElement("button"); prev.className = "btn ghost small"; prev.textContent = "← 上一节";
    prev.disabled = state.sectionIdx <= 0;
    prev.onclick = () => { state.sectionIdx = Math.max(0, state.sectionIdx - 1); markSectionRead(sk.id, state.sectionIdx); saveLastSection(sk.id, state.sectionIdx); renderLessonSections(sk, lessonCard, lessonBody, m); };
    const next = document.createElement("button"); next.className = "btn ghost small"; next.textContent = "下一节 →";
    next.disabled = state.sectionIdx >= n - 1;
    next.onclick = () => { state.sectionIdx = Math.min(n - 1, state.sectionIdx + 1); markSectionRead(sk.id, state.sectionIdx); saveLastSection(sk.id, state.sectionIdx); renderLessonSections(sk, lessonCard, lessonBody, m); };
    const cnt = document.createElement("span"); cnt.className = "muted"; cnt.style.cssText = "font-size:12.5px;white-space:nowrap";
    cnt.textContent = "第 " + (state.sectionIdx + 1) + " / " + n + " 节";
    bar.append(sel, prev, next, cnt);
  } else if (!viewLegacy && n >= 2 && state.sectionAll) {
    const cnt = document.createElement("span"); cnt.className = "muted"; cnt.style.cssText = "font-size:12.5px";
    cnt.textContent = "全文模式 · 共 " + n + " 节";
    bar.appendChild(cnt);
  }
  if (!viewLegacy && n >= 1) {
    const read = readSecsOf(sk.id);
    if (!read.includes(state.sectionIdx)) markSectionRead(sk.id, state.sectionIdx);
    saveLastSection(sk.id, state.sectionIdx);
    const prog = document.createElement("div"); prog.className = "sec-prog"; prog.title = "阅读进度 " + read.length + " / " + n + " 节";
    prog.innerHTML = "<i style='width:" + Math.round(100 * read.length / Math.max(1, n)) + "%'></i>";
    bar.appendChild(prog);
  }
  if (!viewLegacy && hasNew && !state.sectionAll) {
    const cur = secs[state.sectionIdx];
    if (cur && cur.content) {
      const pq = document.createElement("button"); pq.className = "btn ghost small"; pq.style.marginLeft = "auto";
      pq.textContent = "✍️ 练习本节";
      pq.title = "就当前这一节的内容出题练习（2-4 道），题目严格基于本节";
      pq.onclick = () => {
        startQuiz({ section: true });
        const qc = document.getElementById("quiz-card");
        if (qc) qc.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      bar.appendChild(pq);
    }
  }
  // 正文
  if (viewLegacy && state.legacyLesson) {
    renderMarkdown(lessonBody, state.legacyLesson);
  } else if (state.sectionAll && n >= 2) {
    const genIdx = secs.map((s, i) => ({ s, i })).filter(x => x.s && x.s.content);
    const md = genIdx.map(x => "## 第 " + (x.i + 1) + " 节 · " + x.s.title + "\n\n" + x.s.content).join("\n\n---\n\n");
    renderMarkdown(lessonBody, md || "<p class='muted'>还没有已生成的节，请先逐节生成。</p>");
  } else {
    const s = secs[state.sectionIdx] || secs[0] || { title: "", content: "" };
    if (!s.content) {
      lessonBody.innerHTML = "";
      const ph = document.createElement("div"); ph.className = "md";
      const osec = (state.outline || [])[state.sectionIdx];
      const pts = (osec && osec.points && osec.points.length)
        ? "<p class='muted' style='font-size:13px'>计划要点：" + htmlEscape(osec.points.join("；")) + "</p>" : "";
      const hasAI = !!(window.papr && window.papr.agent && window.papr.agent.run);
      ph.innerHTML = "<p class='muted'>📝 本节（<b>" + htmlEscape(s.title) + "</b>）尚未生成。</p>" + pts +
        "<p class='muted' style='font-size:13px'>点上方「▶ 继续生成剩余节」会自动逐节生成（每节约 10-30 秒），也可以只生成本节。</p>";
      const btn = document.createElement("button"); btn.className = "btn"; btn.style.marginTop = "8px";
      btn.textContent = state.genBusy ? "⏳ 生成中…" : "▶ 只生成本节";
      btn.disabled = !!state.genBusy || !hasAI;
      btn.onclick = async () => {
        if (state.genBusy) return;
        state.genBusy = true;
        try { await generateSectionAt(sk, lessonCard, lessonBody, m, state.sectionIdx, false); }
        finally { state.genBusy = false; renderLessonSections(sk, lessonCard, lessonBody, m); }
      };
      ph.appendChild(btn);
      lessonBody.appendChild(ph);
    } else {
      renderMarkdown(lessonBody, (n >= 2 ? "## " + (state.sectionIdx + 1) + ". " + s.title + "\n\n" : "") + s.content);
    }
  }
  // 底部导航：上一节/下一节 + 跨章上一章/下一章（始终可见，读完底部直接翻）
  {
    let bottom = lessonCard.querySelector(".sec-bottom-bar");
    if (bottom) bottom.remove();
    bottom = document.createElement("div");
    bottom.className = "sec-bottom-bar";
    const { prev: prevSk, next: nextSk } = adjacentSkills(sk);
    const atFirstSec = state.sectionIdx <= 0;
    const atLastSec = state.sectionIdx >= n - 1;
    const prevSecBtn = document.createElement("button");
    prevSecBtn.className = "btn ghost small";
    prevSecBtn.textContent = "← 上一节";
    prevSecBtn.disabled = atFirstSec && !prevSk;
    prevSecBtn.title = atFirstSec ? (prevSk ? "上一章：" + prevSk.name : "已是本章第一节") : "上一节";
    prevSecBtn.onclick = () => {
      if (!atFirstSec) {
        state.sectionIdx = Math.max(0, state.sectionIdx - 1);
        markSectionRead(sk.id, state.sectionIdx); saveLastSection(sk.id, state.sectionIdx);
        renderLessonSections(sk, lessonCard, lessonBody, m);
        lessonCard.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (prevSk) {
        openLearn(prevSk.id);
      }
    };
    const nextSecBtn = document.createElement("button");
    nextSecBtn.className = "btn small";
    nextSecBtn.textContent = atLastSec ? (nextSk ? "下一章 →" : "已是末节") : "下一节 →";
    nextSecBtn.disabled = atLastSec && !nextSk;
    nextSecBtn.title = atLastSec ? (nextSk ? "下一章：" + nextSk.name : "已是本章最后一节") : "下一节";
    nextSecBtn.onclick = () => {
      if (!atLastSec) {
        state.sectionIdx = Math.min(n - 1, state.sectionIdx + 1);
        markSectionRead(sk.id, state.sectionIdx); saveLastSection(sk.id, state.sectionIdx);
        renderLessonSections(sk, lessonCard, lessonBody, m);
        lessonCard.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (nextSk) {
        openLearn(nextSk.id);
      }
    };
    // 中间节计数与弹性空白
    const mid = document.createElement("span");
    mid.className = "muted";
    mid.textContent = n >= 2 ? ("第 " + (state.sectionIdx + 1) + " / " + n + " 节") : "";
    const spacer = document.createElement("span"); spacer.className = "spacer";
    // 文案：节内翻节，边界翻章（避免重复按钮）
    if (atFirstSec && prevSk) { prevSecBtn.textContent = "← 上一章：" + prevSk.name; prevSecBtn.title = "上一章：" + prevSk.name; }
    if (atLastSec && nextSk) { nextSecBtn.textContent = "下一章：" + nextSk.name + " →"; nextSecBtn.title = "下一章：" + nextSk.name; }
    bottom.append(prevSecBtn, mid, spacer, nextSecBtn);
    // 仅分节版且有内容时展示底部栏
    if (!viewLegacy && n >= 1 && (secs.some(s => s && s.content) || n >= 2)) {
      lessonCard.appendChild(bottom);
    }
  }
  // 同步提问卡片的上下文（学科/课程/当前节）
  try { if (state.qaEls && state.qaEls.refreshCtx) state.qaEls.refreshCtx(); } catch (e) {}
}

// 阅读进度：已读节持久化（settings key: read-secs:<skill_id>）
async function genSectionOutline(sk, m, minS, maxS) {
  const rg = (typeof adaptiveRangeFor === "function" ? adaptiveRangeFor(sk) : { estMin: 1000, estMax: 1500 });
  const cat = (DOMAIN_META[state.domain] || {}).category || "other";
  const dims = (typeof dimensionsForCategory === "function" ? dimensionsForCategory(cat) : "概念 · 原理 · 例子 · 误区");
  const task = "【分节目录】\n领域：" + DOMAIN_META[state.domain].label + "（" + state.domain + "，类别：" + cat + "）\n技能：{" +
    "id:" + sk.id + ", 名称:" + sk.name + ", 难度:" + sk.difficulty + ", 描述:" + sk.description + "}\n" +
    "用户掌握度：" + m.toFixed(2) + "（0-1）\n节数范围：" + minS + "-" + maxS + " 节\n每节目标字数：" + rg.estMin + "-" + rg.estMax + " 字（est_chars 按该节内容复杂度填写，history 类 1200-1800，其他 1000-1500）\n" +
    "该类别维度（必须全部覆盖，每个维度至少 1 节）：" + dims + "\n" +
    "只输出 JSON。";
  let data = null, raw = "";
  try {
    const res = await agentRun("tutor", task);
    raw = String(res.content || "");
    data = parseAgentJSON(raw);
  } catch (e) {
    try {
      const res2 = await agentRun("tutor", task + "\n\n【强制要求】你上一次的输出无法解析为合法 JSON（" + e.message + "）。请重新输出：只输出一个合法 JSON 对象，不要 markdown 代码块、不要任何解释文字、不要尾随逗号、不要注释。");
      raw = String(res2.content || "");
      data = parseAgentJSON(raw);
    } catch (e2) { data = null; }
  }
  let arr = data && Array.isArray(data.sections) ? data.sections : [];
  if (!arr.length) {
    arr = extractOutlineFromText(raw, maxS);
    if (arr.length) toast("📋 目录解析失败，已从输出文本中提取大纲（不满意可点「🔄 全部重新生成」）", true);
  }
  if (!arr.length) {
    arr = fallbackOutlineFromSkill(sk, minS);
    toast("📋 AI 目录生成失败，已使用默认章节结构", true);
  }
  if (!arr.length) throw new Error("分节目录为空");
  const rg2 = (typeof adaptiveRangeFor === "function" ? adaptiveRangeFor(sk) : { estMin: 1000, estMax: 1500 });
  const defEst = Math.round((rg2.estMin + rg2.estMax) / 2);
  return arr.slice(0, maxS).map((s, i) => ({
    title: String(s.title || ("第 " + (i + 1) + " 节")).slice(0, 24),
    points: Array.isArray(s.points) ? s.points.map(p => String(p).slice(0, 120)) : [],
    est_chars: Math.max(rg2.estMin, Math.min(rg2.estMax, Number(s.est_chars) || defEst))
  }));
}

// 兜底 1：从非 JSON 文本中提取大纲（编号/标题行 + 要点行）
function extractOutlineFromText(t, maxS) {
  const lines = String(t || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const tm = line.match(/^(?:#{1,6}\s*|\d+[\.、．)）]\s*|(?:第[一二三四五六七八九十\d]+节)\s*[：:．.、]?\s*)([^#*]{1,30}?)\s*$/);
    if (tm) {
      if (cur) sections.push(cur);
      cur = { title: tm[1].replace(/\*+/g, "").trim().slice(0, 24), points: [], est_chars: 900 };
      continue;
    }
    if (cur) {
      const pm = line.match(/^[-*•·◦]\s*(.{1,60})$/);
      if (pm) cur.points.push(pm[1].slice(0, 120));
    }
  }
  if (cur) sections.push(cur);
  const withPoints = sections.filter(s => s.points.length);
  if (withPoints.length >= 2) return withPoints.slice(0, maxS);
  const shortOnes = sections.filter(s => s.title.length <= 20);
  if (shortOnes.length >= 2) return shortOnes.slice(0, maxS);
  return [];
}

// 兜底 2：按技能描述拆分默认章节结构（自适应体量）
function fallbackOutlineFromSkill(sk, minS) {
  const rg = (typeof adaptiveRangeFor === "function" ? adaptiveRangeFor(sk) : { estMin: 1000, estMax: 1500 });
  const defEst = Math.round((rg.estMin + rg.estMax) / 2);
  const pts = String(sk.description || "").split(/[、，,；;]/).map(s => s.trim()).filter(Boolean);
  const n = Math.max(minS, Math.min(rg.maxS || 8, Math.max(2, Math.ceil(pts.length / 2))));
  const titles = ["总览：整体框架与直觉", "核心概念与关键内容", "重点深入：例子与辨析", "全章小结与检查性问题"];
  const out = [];
  for (let i = 0; i < n; i++) {
    const slice = pts.slice(Math.floor(i * pts.length / n), Math.floor((i + 1) * pts.length / n));
    out.push({ title: i === 0 ? "总览：" + sk.name : (i === n - 1 ? "全章小结与检查性问题" : titles[i] || ("第 " + (i + 1) + " 节")), points: slice, est_chars: defEst });
  }
  return out;
}

// 单节正文：流式生成
async function genSectionBody(sk, m, prefs, outline, i, lessonBody) {
  const sec = outline[i];
  const prevTitles = outline.slice(0, i).map(s => s.title).join("、") || "（无）";
  const pts = (sec.points || []).length ? sec.points.map((p, k) => (k + 1) + ". " + p).join("\n") : "（围绕节标题自行组织，讲透即可）";
  const rg3 = (typeof adaptiveRangeFor === "function" ? adaptiveRangeFor(sk) : { estMin: 1000, estMax: 1500 });
  const est = Number(sec.est_chars) || Math.round((rg3.estMin + rg3.estMax)/2);
  const minChars = Math.max(1000, Math.min(1200, Math.round(est * 0.75)));
  let acc = "";
  const header = "#### 📖 第 " + (i + 1) + " / " + outline.length + " 节 · " + sec.title + "\n\n";
  const res = await agentRun("tutor",
    "【分节讲解】\n章节：「" + sk.name + "」（" + DOMAIN_META[state.domain].label + "）\n节标题：" + sec.title + "\n本节要点（必须全部讲清）：\n" + pts + "\n" +
    "第 " + (i + 1) + " 节 / 共 " + outline.length + " 节\n已讲过的节（不要重复）：" + prevTitles + "\n" +
    "本节是最后一节吗：" + (i === outline.length - 1 ? "是（末尾写全章小结 + 一个检查性问题，只提问不给答案）" : "否（末尾只写一两句本节小结）") + "\n" +
    "最低字数：" + minChars + " 字\n技能描述（背景）：" + sk.description + "\n用户掌握度：" + m.toFixed(2) + "（0-1）\n用户教学偏好：" + prefs + "\n" + styleModule() + "\n" +
    "要求：公式用 LaTeX（行内 $..$，独立 $$..$$），输出 Markdown，只输出本节正文（不要 JSON、不要额外解释）。本节必须包含至少 1 个受控图表代码块（```chart JSON），图表数据与正文一致。",
    (d) => { acc += d; renderMarkdown(lessonBody, header + acc); lessonBody.appendChild(elCursor()); });
  acc = res.content || acc;
  renderMarkdown(lessonBody, header + acc);
  return acc;
}


export { openLearn, renderLearn, loadLesson, lessonMaterialForQuiz, generateLesson, generateSectionAt, resumeSections, renderStaleBanner, renderLessonSections, genSectionOutline, extractOutlineFromText, fallbackOutlineFromSkill, genSectionBody };
