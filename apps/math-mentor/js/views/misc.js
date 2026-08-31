import { DOMAIN_META } from "../config.js";
import { ERROR_TYPE_LABEL, state, skillById } from "../state.js";
import { toast, api, masteryColor, masteryOf, runJSONAgent, STYLE_PRESETS, currentStyle, htmlEscape } from "../utils.js";
import { katexRender } from "../markdown.js";
import { navigate, loadBootstrap, updateBadges } from "../navigation.js";
import { loadingBox, emptyBox } from "../ui.js";

/* ============ 学习建议（planner） ============ */
async function planNext(skipCache) {
  const skills = state.skills.filter(s => s.domain === state.domain);
  const goal = state.settings["goal:" + state.domain] || "系统掌握" + DOMAIN_META[state.domain].label + "的基础";
  const timeB = state.settings["time:" + state.domain] || "30";
  const masterySnapshot = {};
  skills.forEach(s => { masterySnapshot[s.id] = masteryOf(s.id); });
  return await runJSONAgent("planner",
    "领域：" + state.domain + "（" + DOMAIN_META[state.domain].label + "）\n全部技能（含先修关系）：\n" +
    JSON.stringify(skills.map(s => ({ id: s.id, name: s.name, difficulty: s.difficulty, prereqs: s.prereqs }))) +
    "\n当前掌握度（0-1）：\n" + JSON.stringify(masterySnapshot) +
    "\n用户目标：" + goal + "\n每日可用时间：" + timeB + " 分钟\n请按规则输出 JSON。");
}

/* ============ 错题本 ============ */
async function vWrong(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = "<h2>📕 错题本</h2>";
  card.appendChild(loadingBox("加载错题…"));
  wrap.appendChild(card);
  main.appendChild(wrap);
  try {
    const data = await api("/api/wrong?domain=" + state.domain);
    state.wrongList = data.wrong || [];
    card.innerHTML = "<h2>📕 错题本 <span class='muted' style='font-size:13px;font-weight:400'>共 " + state.wrongList.length + " 题（最近 100 条）</span></h2>";
    if (!state.wrongList.length) { card.appendChild(emptyBox("🎉", "暂无错题，继续保持！")); return; }
    state.wrongList.forEach((w, i) => {
      const box = document.createElement("div"); box.className = "qa-question";
      const sk = skillById(w.skill_id);
      const opts = Array.isArray(w.options) ? w.options : [];
      let optsHtml = "";
      if (opts.length >= 2) {
        optsHtml = "<div class='choice-list' style='margin-top:8px'>" + opts.map((o, oi) => {
          const isAns = String(o).trim() === String(w.answer || "").trim();
          return "<div class='choice-btn' style='cursor:default;background:" + (isAns ? "rgba(52,211,153,.12)" : "var(--panel2)") +
            ";border-color:" + (isAns ? "var(--green)" : "var(--border2)") + "'>" +
            "<span class='choice-letter' style='background:" + (isAns ? "var(--green)" : "var(--panel)") + ";color:" + (isAns ? "#fff" : "var(--muted)") + ";border-color:" + (isAns ? "var(--green)" : "var(--border2)") + "'>" + "ABCDEF"[oi] + "</span>" +
            "<span class='choice-text no-katex'>" + htmlEscape(o) + "</span></div>";
        }).join("") + "</div>";
      }
      box.innerHTML = "<b>" + (i + 1) + ". </b><span class='no-katex'>" + htmlEscape(w.content) + "</span>" +
        "<div class='muted' style='margin-top:6px;font-size:12.5px'>技能：" + htmlEscape(sk ? sk.name : w.skill_id) +
        "　·　" + htmlEscape(w.answered_at || "") + "</div>" +
        "<div style='margin-top:6px'><span class='tag bad'>" + (ERROR_TYPE_LABEL[w.error_type] || "未归因") + "</span></div>" +
        optsHtml +
        "<p style='margin-top:6px;font-size:13.5px'>✍️ 我的答案：<span class='no-katex'>" + htmlEscape(w.user_answer || "") + "</span></p>" +
        "<p style='margin-top:4px;font-size:13.5px'>✅ 正确答案：<span class='no-katex'>" + htmlEscape(w.answer || "") + "</span></p>" +
        "<p class='muted' style='margin-top:4px;font-size:13px'>📖 解析：<span class='no-katex'>" + htmlEscape(w.explanation || "") + "</span></p>";
      card.appendChild(box);
      box.querySelectorAll(".no-katex").forEach(el => el.classList.remove("no-katex"));
      katexRender(box);
    });
  } catch (e) {
    card.innerHTML = "<h2>📕 错题本</h2><p class='muted'>加载失败：" + htmlEscape(e.message) + "</p>";
  }
}

/* ============ 复习队列 ============ */
async function vReview(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = "<h2>🔁 到期复习</h2><p class='muted'>按遗忘曲线安排：答对后 1 / 3 / 7 / 14 天复习，答错次日复习。</p>";
  card.appendChild(loadingBox("加载复习队列…"));
  wrap.appendChild(card);
  main.appendChild(wrap);
  try {
    const data = await api("/api/review-queue?domain=" + state.domain);
    state.dueList = data.due || [];
    card.innerHTML = "<h2>🔁 到期复习 <span class='muted' style='font-size:13px;font-weight:400'>" + state.dueList.length + " 项待复习</span></h2>";
    updateBadges();
    if (!state.dueList.length) { card.appendChild(emptyBox("🌤️", "当前没有到期的复习任务")); return; }
    state.dueList.forEach(sk => {
      const row = document.createElement("div"); row.className = "skill-row"; row.style.border = "1px solid var(--border)"; row.style.marginBottom = "8px";
      row.innerHTML = '<span class="skill-dot" style="background:' + masteryColor(Number(sk.mastery)) + '"></span>' +
        '<span class="skill-name">' + htmlEscape(sk.name) + '</span>' +
        '<span class="skill-m">' + Math.round(Number(sk.mastery) * 100) + "%</span>";
      const btn = document.createElement("button"); btn.className = "btn small ghost"; btn.textContent = "复习";
      btn.onclick = async () => {
        row.innerHTML += '<span class="spinner"></span>';
        btn.disabled = true;
        // 快速复习：走完整学习流程（讲解可选），MVP 直接出题
        state.activeSkill = skillById(sk.id) || { id: sk.id, name: sk.name, description: sk.description, difficulty: sk.difficulty, prereqs: [], domain: sk.domain };
        state.lesson = null; state.lessonDone = true; state.quiz = []; state.quizIdx = 0; state.quizResults = [];
        state.view = "learn";
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", false));
        const mainEl = document.getElementById("main");
        mainEl.innerHTML = "";
        const w2 = document.createElement("div"); w2.className = "wrap";
        const hd = document.createElement("div"); hd.className = "card";
        hd.innerHTML = "<div style='display:flex;align-items:center;gap:10px'><button class='btn ghost small' id='rv-back'>← 返回复习</button><h2 style='margin:0'>🔁 复习：" + htmlEscape(sk.name) + "</h2></div>";
        const qc = document.createElement("div"); qc.className = "card"; qc.id = "quiz-card";
        qc.innerHTML = "<h2>✍️ 复习练习</h2>";
        w2.appendChild(hd); w2.appendChild(qc);
        mainEl.appendChild(w2);
        document.getElementById("rv-back").onclick = () => navigate("review");
        (await getQuiz()).startQuiz();
      };
      const right = document.createElement("span"); right.style.marginLeft = "auto"; right.style.display = "flex"; right.style.alignItems = "center"; right.style.gap = "8px";
      right.appendChild(btn);
      row.appendChild(right);
      card.appendChild(row);
    });
  } catch (e) {
    card.innerHTML = "<h2>🔁 到期复习</h2><p class='muted'>加载失败：" + htmlEscape(e.message) + "</p>";
  }
}

/* ============ 学习记录 ============ */
async function vRecords(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = "<h2>📜 学习记录</h2>";
  card.appendChild(loadingBox("加载记录…"));
  wrap.appendChild(card);
  main.appendChild(wrap);
  try {
    const data = await api("/api/events?domain=" + state.domain + "&limit=60");
    const evs = data.events || [];
    card.innerHTML = "<h2>📜 学习记录 <span class='muted' style='font-size:13px;font-weight:400'>最近 " + evs.length + " 条</span></h2>";
    if (!evs.length) { card.appendChild(emptyBox("📜", "还没有学习记录，先去诊断或学习吧")); return; }
    const EV = {
      diagnosis: { icon: "🎯", label: "完成能力诊断" }, goal: { icon: "🎯", label: "更新学习目标" },
      domain: { icon: "🔀", label: "切换领域" }, answer: { icon: "✍️", label: "答题" },
      lesson: { icon: "📖", label: "学习" }, quiz: { icon: "📝", label: "练习" }, review: { icon: "🔁", label: "复习" }, intro: { icon: "📚", label: "阅读领域导览" }
    };
    const tl = document.createElement("div"); tl.className = "timeline";
    evs.forEach(ev => {
      const meta = EV[ev.event_type] || { icon: "•", label: ev.event_type };
      let detail = "";
      try {
        const d = JSON.parse(ev.detail || "{}");
        if (ev.event_type === "answer") detail = "技能 " + ((skillById(d.skill_id) || {}).name || d.skill_id) + " · " + (d.correct ? "✅ 正确" : "❌ 错误") + " · 掌握度 " + Math.round((d.mastery || 0) * 100) + "%";
        else if (ev.event_type === "domain") detail = "进入 " + (DOMAIN_META[d.domain] ? DOMAIN_META[d.domain].label : d.domain);
        else if (ev.event_type === "goal") detail = d.goal ? "目标：" + d.goal : "";
        else if (ev.event_type === "diagnosis") detail = "已生成能力画像";
        else if (ev.event_type === "intro") detail = "阅读 " + (DOMAIN_META[d.domain] ? DOMAIN_META[d.domain].label : d.domain) + " 导览";
      } catch (e) {}
      const item = document.createElement("div"); item.className = "tl-item";
      item.innerHTML = "<span class='tl-time'>" + htmlEscape(ev.created_at || "") + "</span><br><b>" + meta.icon + " " + meta.label + "</b> <span class='muted'>" + htmlEscape(detail) + "</span>";
      tl.appendChild(item);
    });
    card.appendChild(tl);
  } catch (e) {
    card.innerHTML = "<h2>📜 学习记录</h2><p class='muted'>加载失败：" + htmlEscape(e.message) + "</p>";
  }
}

/* ============ 设置弹窗 ============ */
function openSettings() {
  const root = document.getElementById("modal-root");
  root.innerHTML = '<div class="modal-mask"><div class="modal">' +
    "<h2 style='font-size:16px;margin-bottom:6px'>⚙️ 学习设置</h2>" +
    "<p class='muted'>当前学科：" + htmlEscape(DOMAIN_META[state.domain].label) + "</p>" +
    "<label class='fld'>学习目标</label>" +
    '<input type="text" id="set-goal" value="' + htmlEscape(state.settings["goal:" + state.domain] || "") + '" placeholder="例如：掌握数列极限的 ε-N 语言">' +
    "<label class='fld'>每日学习时间（分钟）</label>" +
    '<input type="number" id="set-time" min="10" max="600" value="' + htmlEscape(state.settings["time:" + state.domain] || "30") + '">' +
    "<label class='fld'>教学偏好</label>" +
    '<input type="text" id="set-pref" value="' + htmlEscape(state.settings["pref:" + state.domain] || "公式推导、例子驱动") + '" placeholder="如：多举例、公式推导、直观理解">' +
    '<label class="chk"><input type="checkbox" id="set-skipprereq"' + (state.settings["skip-prereq"] !== "0" ? " checked" : "") + '> 跳过先修限制（可自由学习任意章节，不校验前置掌握度）</label>' +
    "<label class='fld'>讲解风格（本学科，影响导览与讲解生成）</label>" +
    '<div class="style-opts">' + STYLE_PRESETS.map(s =>
      '<label class="style-opt"><input type="radio" name="set-style" value="' + s.id + '">' +
      '<b>' + s.label + '</b><span class="muted">' + s.desc + '</span></label>').join("") + "</div>" +
    '<input type="text" id="set-styletext" style="margin-top:8px;display:none" value="' + htmlEscape(state.settings["styletext:" + state.domain] || "") + '" placeholder="描述你想要的风格，如：像费曼一样讲物理，多用图像直觉与实验背景">' +
    "<div style='display:flex;gap:10px;margin-top:16px;justify-content:flex-end'>" +
    '<button class="btn ghost small" id="set-cancel">取消</button>' +
    '<button class="btn small" id="set-save">保存</button></div></div></div>';
  const curStyle = currentStyle();
  const radios = root.querySelectorAll('input[name="set-style"]');
  radios.forEach(r => { r.checked = r.value === curStyle; });
  const styleText = document.getElementById("set-styletext");
  styleText.style.display = curStyle === "custom" ? "block" : "none";
  radios.forEach(r => { r.onchange = () => { styleText.style.display = (r.value === "custom" && r.checked) ? "block" : "none"; }; });
  document.getElementById("set-cancel").onclick = () => { root.innerHTML = ""; };
  document.getElementById("set-save").onclick = async () => {
    const goal = document.getElementById("set-goal").value.trim();
    const time = document.getElementById("set-time").value;
    const pref = document.getElementById("set-pref").value.trim();
    const style = root.querySelector('input[name="set-style"]:checked').value;
    const styletext = document.getElementById("set-styletext").value.trim();
    await api("/api/goal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: state.domain, goal, time_budget: time }) });
    if (pref) {
      await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "pref:" + state.domain, value: pref }) });
    }
    await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "style:" + state.domain, value: style }) });
    if (styletext) {
      await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "styletext:" + state.domain, value: styletext }) });
    }
    const skipPrereqVal = document.getElementById("set-skipprereq").checked ? "" : "0";
    await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "skip-prereq", value: skipPrereqVal }) });
    state.settings["skip-prereq"] = skipPrereqVal;
    root.innerHTML = "";
    toast("✅ 已保存");
    await loadBootstrap();
    renderView();
  };
}

export { planNext, vWrong, vReview, vRecords, openSettings };
