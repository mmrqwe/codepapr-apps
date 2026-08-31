import { DOMAIN_META } from "../config.js";
import { diagCount, diagSkillIds } from "../adaptive.js";
import { state, skillById } from "../state.js";
import { toast, api, masteryColor, masteryOf, runJSONAgent, normalizeQuestions, QUIZ_RULES, htmlEscape } from "../utils.js";
import { katexRender } from "../markdown.js";
import { navigate, loadBootstrap } from "../navigation.js";
import { loadingBox } from "../ui.js";

/* ============ 诊断流程 ============ */
async function startDiagnose() {
  state.diag = { step: "intro", goal: state.settings["goal:" + state.domain] || "", timeB: state.settings["time:" + state.domain] || "30", questions: [], idx: 0, grades: [] };
  state.view = "diagnose";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", false));
  renderDiagnose();
}
function renderDiagnose() {
  const main = document.getElementById("main");
  const d = state.diag;
  main.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = "<h2>🎯 能力诊断 — " + htmlEscape(DOMAIN_META[state.domain].label) + "</h2>";
  wrap.appendChild(card);

  if (d.step === "intro") {
    const p = document.createElement("p"); p.className = "muted";
    p.textContent = "诊断共 " + diagCount() + " 道题（题量按领域规模自适应：大领域题更多、小领域更精简），覆盖本领域的关键基础，难度逐题递进。答完后评估引擎会生成你的能力画像与学习路径建议。";
    card.appendChild(p);
    const l1 = document.createElement("label"); l1.className = "fld"; l1.textContent = "你的学习目标（可选）";
    card.appendChild(l1);
    const g = document.createElement("input"); g.type = "text"; g.id = "diag-goal"; g.value = d.goal; g.placeholder = "例如：系统掌握数学分析的基础理论";
    card.appendChild(g);
    const l2 = document.createElement("label"); l2.className = "fld"; l2.textContent = "每天可用于学习的时间（分钟）";
    card.appendChild(l2);
    const t = document.createElement("input"); t.type = "number"; t.id = "diag-time"; t.value = d.timeB; t.min = "10"; t.max = "600";
    card.appendChild(t);
    const b = document.createElement("button"); b.className = "btn"; b.style.marginTop = "14px"; b.textContent = "开始诊断（" + diagCount() + " 题）";
    const hasAI = !!(window.papr && window.papr.agent && window.papr.agent.run);
    b.disabled = !hasAI;
    if (!hasAI) {
      const tip = document.createElement("p"); tip.className = "muted"; tip.style.margin = "8px 0 0"; tip.style.fontSize = "13px";
      tip.textContent = "⚠️ 当前环境不支持 AI（浏览器直访调试页）。请从 CodePapr 应用面板打开本应用。";
      card.appendChild(tip);
    }
    b.onclick = async () => {
      d.goal = g.value.trim(); d.timeB = t.value;
      await api("/api/goal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: state.domain, goal: d.goal, time_budget: d.timeB }) });
      state.settings["goal:" + state.domain] = d.goal; state.settings["time:" + state.domain] = d.timeB;
      card.innerHTML = "<h2>🎯 能力诊断 — " + htmlEscape(DOMAIN_META[state.domain].label) + "</h2>";
      card.appendChild(loadingBox("评估引擎正在生成诊断题…"));
      try {
        const targets = diagSkillIds().map(sid => {
          const sk = skillById(sid);
          return { id: sk.id, name: sk.name, difficulty: sk.difficulty };
        });
        const data = await runJSONAgent("assessor",
          "【模式 generate_quiz】\n领域：" + state.domain + "（" + DOMAIN_META[state.domain].label + "）\n这是能力诊断，请按顺序为以下技能各出 1 道题（共 " + targets.length + " 道，难度逐题递进，前 2 道偏基础）：\n" +
          JSON.stringify(targets) + "\n题目数量：" + targets.length + "\n" + QUIZ_RULES + "\n只输出 JSON。");
        d.questions = normalizeQuestions(data.questions || []);
        if (d.questions.length < 3) throw new Error("诊断题数量不足");
        d.idx = 0; d.grades = []; d.step = "quiz";
        renderDiagnose();
      } catch (e) {
        card.innerHTML = "<h2>🎯 能力诊断</h2><p class='muted'>诊断题生成失败：" + htmlEscape(e.message) + "</p>" +
          '<button class="btn small ghost" id="diag-retry">重试</button>';
        const rb = document.getElementById("diag-retry"); if (rb) rb.onclick = startDiagnose;
      }
    };
    card.appendChild(b);
  } else if (d.step === "quiz") {
    const q = d.questions[d.idx];
    const steps = document.createElement("div"); steps.className = "progress-steps";
    d.questions.forEach((_, i) => {
      const s = document.createElement("div"); s.className = "pstep" + (i < d.idx ? " done" : i === d.idx ? " cur" : "");
      steps.appendChild(s);
    });
    card.appendChild(steps);
    const qBox = document.createElement("div"); qBox.className = "qa-question";
    qBox.innerHTML = "<b>诊断题 " + (d.idx + 1) + " / " + d.questions.length + "</b><br><span class='no-katex'>" + htmlEscape(q.content) + "</span>";
    qBox.querySelector(".no-katex").classList.remove("no-katex");
    card.appendChild(qBox);
    katexRender(qBox);
    const isChoice = Array.isArray(q.options) && q.options.length >= 2;
    let ta = null, chosen = -1;
    if (isChoice) {
      const optWrap = document.createElement("div"); optWrap.className = "choice-list";
      const letters = "ABCDEF";
      q.options.forEach((opt, i) => {
        const btn = document.createElement("button"); btn.className = "choice-btn"; btn.type = "button";
        btn.innerHTML = '<span class="choice-letter">' + letters[i] + "</span>" +
          '<span class="choice-text no-katex">' + htmlEscape(opt) + "</span>";
        btn.onclick = () => {
          optWrap.querySelectorAll(".choice-btn").forEach(bb => bb.classList.remove("picked"));
          btn.classList.add("picked");
          chosen = i;
        };
        optWrap.appendChild(btn);
      });
      card.appendChild(optWrap);
      optWrap.querySelectorAll(".no-katex").forEach(el => el.classList.remove("no-katex"));
      katexRender(optWrap);
    } else {
      const lbl = document.createElement("label"); lbl.className = "fld"; lbl.textContent = "你的答案（支持 LaTeX）";
      card.appendChild(lbl);
      ta = document.createElement("textarea"); ta.id = "diag-answer"; ta.placeholder = "不会也没关系，写 '不知道' 即可，这能帮助定位起点";
      card.appendChild(ta);
      const prev = document.createElement("div"); prev.className = "md"; prev.id = "diag-preview"; prev.style.marginTop = "6px";
      card.appendChild(prev);
      ta.addEventListener("input", () => { prev.innerHTML = '<span class="no-katex">' + htmlEscape(ta.value) + "</span>"; prev.querySelector(".no-katex").classList.remove("no-katex"); katexRender(prev); });
    }
    const b = document.createElement("button"); b.className = "btn"; b.style.marginTop = "12px";
    b.textContent = d.idx === d.questions.length - 1 ? "提交并生成画像" : "提交并进入下一题";
    const box = document.createElement("div"); box.id = "diag-result";
    card.appendChild(b);
    card.appendChild(box);
    b.onclick = async () => {
      const ans = isChoice ? (chosen >= 0 ? "ABCDEF"[chosen] + ". " + q.options[chosen] : "") : (ta ? ta.value.trim() : "");
      if (!ans) { toast(isChoice ? "请选择一个选项" : "请作答（不会可写 '不知道'）", true); return; }
      b.disabled = true;
      box.innerHTML = '<div class="loading-box"><span class="spinner"></span> 批改中…</div>';
      try {
        const g = await runJSONAgent("assessor",
          "【模式 grade_answer】\n题目：" + q.content + "\n标准答案：" + q.answer + "\n解析：" + (q.explanation || "") +
          (q.options && q.options.length ? "\n选项列表：" + q.options.map((o, i) => "ABCDEF"[i] + ". " + o).join(" | ") : "") +
          "\n用户回答：" + ans + "\n是否使用提示：否\n这是能力诊断题，请同时估计用户对该技能的掌握度 skill_mastery（0-1）。只输出 JSON。");
        d.grades.push({ q, grade: g });
        box.innerHTML = "";
        const rb = document.createElement("div");
        rb.className = "result-box " + (g.correct ? "ok" : "bad");
        rb.innerHTML = "<b>" + (g.correct ? "✅ 回答正确" : "❌ 回答有误") + "</b>" +
          "<p style='margin-top:6px'>" + htmlEscape(g.feedback || "") + "</p>" +
          "<p class='muted' style='margin-top:6px'><b>标准答案：</b><span class='no-katex'>" + htmlEscape(q.answer || "") + "</span></p>";
        box.appendChild(rb);
        katexRender(rb);
        const next = document.createElement("button"); next.className = "btn small"; next.style.marginTop = "10px";
        next.textContent = d.idx < d.questions.length - 1 ? "下一题 →" : "生成能力画像";
        next.onclick = () => {
          if (d.idx < d.questions.length - 1) { d.idx++; renderDiagnose(); }
          else finishDiagnose();
        };
        box.appendChild(next);
      } catch (e) {
        box.innerHTML = '<p class="muted">批改失败：' + htmlEscape(e.message) + "</p>";
      } finally { b.disabled = false; }
    };
  } else if (d.step === "result") {
    renderDiagnoseResult(card);
  }
  main.appendChild(wrap);
}
async function finishDiagnose() {
  const d = state.diag;
  d.step = "result";
  const main = document.getElementById("main");
  main.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = "<h2>🎯 生成能力画像</h2>";
  card.appendChild(loadingBox("正在汇总诊断结果并规划学习路径…"));
  wrap.appendChild(card);
  main.appendChild(wrap);
  try {
    // 画像：按技能聚合 skill_mastery（诊断覆盖的技能集 = diagSkillIds()，与出题时一致）
    const profile = {};
    const diagIds = diagSkillIds();
    d.grades.forEach(({ q, grade }, gi) => {
      const sid = q.skill_id || diagIds[gi] || diagIds[0];
      if (!sid) return;
      if (!profile[sid]) profile[sid] = [];
      const raw = Number(grade.skill_mastery);
      profile[sid].push(Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : (grade.correct ? 0.6 : 0.2));
    });
    const finalProfile = {};
    Object.entries(profile).forEach(([sid, arr]) => { finalProfile[sid] = Math.round(100 * (arr.reduce((a, b) => a + b, 0) / arr.length)) / 100; });
    diagIds.forEach(sid => { if (finalProfile[sid] === undefined) finalProfile[sid] = 0.2; });
    const plan = await planNext(true);
    const summary = (plan && plan.summary) || "诊断完成";
    await api("/api/diagnosis-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: state.domain, profile: finalProfile, summary }) });
    await loadBootstrap();
    d.plan = plan; d.profile = finalProfile;
    renderDiagnose();
  } catch (e) {
    card.innerHTML = "<h2>🎯 生成能力画像</h2><p class='muted'>画像生成失败：" + htmlEscape(e.message) + "</p>" +
      '<button class="btn small ghost" id="diag-finish-retry">重试</button>';
    const rb = document.getElementById("diag-finish-retry"); if (rb) rb.onclick = finishDiagnose;
  }
}
function renderDiagnoseResult(card) {
  const d = state.diag;
  card.innerHTML = "<h2>🎉 诊断完成 — " + htmlEscape(DOMAIN_META[state.domain].label) + "</h2>";
  const box = document.createElement("div"); box.className = "chart-box sm";
  card.appendChild(box);
  const skills = state.skills.filter(s => s.domain === state.domain);
  const vals = diagSkillIds().map(sid => {
    const sk = skills.find(x => x.id === sid);
    return { name: sk ? sk.name : sid, value: Number(d.profile[sid] ?? 0.2) };
  });
  setTimeout(() => {
    const chart = echarts.init(box);
    chart.setOption({
      grid: { left: 10, right: 60, top: 6, bottom: 6, containLabel: true },
      xAxis: { type: "value", max: 1, axisLabel: { color: "#999" } },
      yAxis: { type: "category", data: vals.map(v => v.name), axisLabel: { color: "#999" } },
      series: [{ type: "bar", data: vals.map(v => ({ value: v.value, itemStyle: { color: masteryColor(v.value), borderRadius: [0, 6, 6, 0] } })), barMaxWidth: 22, label: { show: true, position: "right", formatter: p => Math.round(p.value * 100) + "%", color: "#999" } }],
      backgroundColor: "transparent"
    });
  }, 30);
  const p = document.createElement("p"); p.className = "muted"; p.style.marginTop = "8px";
  p.textContent = "💬 " + (d.plan ? d.plan.summary || "" : "");
  card.appendChild(p);
  const h3 = document.createElement("h3"); h3.textContent = "🧭 建议的学习路径";
  card.appendChild(h3);
  const list = document.createElement("div");
  (d.plan && d.plan.next_nodes || []).forEach(n => {
    const sk = skillById(n.skill_id);
    if (!sk) return;
    const row = document.createElement("div"); row.className = "skill-row";
    row.innerHTML = '<span class="skill-dot" style="background:' + masteryColor(masteryOf(sk.id)) + '"></span>' +
      '<span class="skill-name">' + htmlEscape(sk.name) + "</span><span class='skill-m'>开始学习 →</span>";
    row.onclick = async () => (await getLearn()).openLearn(sk.id);
    list.appendChild(row);
  });
  card.appendChild(list);
  if (d.plan && d.plan.advice) {
    const a = document.createElement("p"); a.className = "muted"; a.style.marginTop = "10px";
    a.textContent = "💡 " + d.plan.advice;
    card.appendChild(a);
  }
  const btns = document.createElement("div"); btns.style.marginTop = "14px"; btns.style.display = "flex"; btns.style.gap = "10px"; btns.style.flexWrap = "wrap";
  const b1 = document.createElement("button"); b1.className = "btn"; b1.textContent = "🏠 前往仪表盘"; b1.onclick = () => navigate("dashboard");
  const b2 = document.createElement("button"); b2.className = "btn ghost"; b2.textContent = "🗺️ 查看学习路径"; b2.onclick = () => navigate("path");
  btns.appendChild(b1); btns.appendChild(b2);
  card.appendChild(btns);
}

export { startDiagnose, renderDiagnose, finishDiagnose, renderDiagnoseResult };
