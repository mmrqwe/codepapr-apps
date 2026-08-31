import { DOMAIN_META } from "../config.js";
import { quizCountFor, quizMix, sectionQuizPlan } from "../adaptive.js";
import { ERROR_TYPE_LABEL, state } from "../state.js";
import { toast, api, masteryLabel, masteryOf, runJSONAgent, normalizeQuestions, QUIZ_RULES, htmlEscape } from "../utils.js";
import { katexRender } from "../markdown.js";
import { navigate, loadBootstrap } from "../navigation.js";
import { loadingBox } from "../ui.js";

/* ============ 练习流程 ============ */
async function startQuiz(sectionScope) {
  const sk = state.activeSkill;
  if (!sk) return;
  const isSection = sectionScope === true || (sectionScope && sectionScope.section === true);
  const secNum = isSection ? state.sectionIdx + 1 : 0;
  const card = document.getElementById("quiz-card");
  card.innerHTML = "<h2>✍️ 练习" + (isSection ? " · 第 " + secNum + " 节" : "") + "</h2>";
  card.appendChild(loadingBox(isSection ? "评估引擎正在就本节内容出题…" : "评估引擎正在出题…"));
  try {
    // ---- 学习材料（出题依据）：按节练习只取当前节；整节点练习拼接所有分节 ----
    let lessonText = "";
    if (isSection) {
      const s = (state.sections || [])[state.sectionIdx];
      lessonText = (s && s.content) ? ("## 第 " + secNum + " 节 · " + (s.title || "") + "\n\n" + s.content) : "";
      if (!lessonText.trim()) {
        card.innerHTML = "<h2>✍️ 练习 · 第 " + secNum + " 节</h2><p class='muted'>⚠️ 本节还没有生成内容。请先在上方生成本节讲解，再回来练习。</p>";
        return;
      }
    } else {
      lessonText = (await getLearn()).lessonMaterialForQuiz();
      if (!lessonText) {
        try {
          const lr = await api("/api/lesson-sections?skill_id=" + encodeURIComponent(sk.id));
          if (lr.sections && lr.sections.length) lessonText = lr.sections.filter(s => s && s.content).map(s => String(s.content)).join("\n\n");
        } catch (e) {}
      }
      if (!lessonText) {
        try {
          const lr2 = await api("/api/lesson?skill_id=" + encodeURIComponent(sk.id));
          if (lr2.lesson && lr2.lesson.content) lessonText = lr2.lesson.content;
        } catch (e) {}
      }
    }
    if (lessonText.trim().length < 400) {
      card.innerHTML = "<h2>✍️ 练习" + (isSection ? " · 第 " + secNum + " 节" : "") + "</h2><p class='muted'>⚠️ 已生成的学习内容还不够（还有节未生成），直接出题会脱离学习范围。请先在上方逐节生成讲解，再回来练习。</p>" +
        '<button class="btn small" id="go-gen-lesson">🔄 生成讲解后开始练习</button>';
      const gb = document.getElementById("go-gen-lesson");
      if (gb) gb.onclick = async () => {
        const els = state.lessonEls;
        if (els && els.body && els.card) {
          await (await getLearn()).generateLesson(sk, els.body, els.card, masteryOf(sk.id), true);
          if (state.lesson && state.lessonDone) startQuiz();
        } else toast("请先在上方生成讲解", true);
      };
      return;
    }
    const material = lessonText.length > 12000 ? lessonText.slice(0, 12000) + "\n……（学习材料过长，已截断）" : lessonText;
    let wrongCount = 0;
    if (!isSection) {
      try {
        const w = await api("/api/wrong?domain=" + state.domain);
        wrongCount = (w.wrong || []).filter(x => x.skill_id === sk.id).length;
      } catch (e) {}
    }
    const plan = isSection ? sectionQuizPlan(lessonText.length) : quizCountFor(sk, wrongCount);
    state.quizPlan = plan;
    const data = await runJSONAgent("assessor",
      "【模式 generate_quiz】\n领域：" + state.domain + "（" + DOMAIN_META[state.domain].label + "）\n技能：{" +
      "id:" + sk.id + ", 名称:" + sk.name + ", 难度:" + sk.difficulty + ", 描述:" + sk.description + "}\n" +
      (isSection ? "本次练习范围：只针对第 " + secNum + " 节（学习材料即该节内容），不要出本节之外的知识点。\n" : "") +
      "【学习材料】以下是用户已经学完的讲解内容，所有题目必须严格基于它出题：\n" + material + "\n" +
      "用户掌握度：" + masteryOf(sk.id).toFixed(2) + "（0-1）\n题目数量：" + plan.count + "\n题型分布：" + quizMix(plan.count) +
      "（按学科自然选择题型，计算机学科可用代码题），难度与技能难度匹配，题面数据具体可手算/笔算。\n" + QUIZ_RULES + "\n只输出 JSON。");
    const qs = normalizeQuestions(data.questions || []);
    if (!qs.length) {
      card.innerHTML = "<h2>✍️ 练习</h2><p class='muted'>😅 评估引擎认为当前学习内容不足以支撑出题。建议先扩充讲解内容（点上方「🔄 重新生成」），再回来练习。</p>";
      return;
    }
    const saved = await api("/api/quiz-save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: state.domain, questions: qs })
    });
    state.quiz = qs.map((q, i) => ({ ...q, db_id: saved.ids[i], userAnswer: "", graded: null }));
    state.quizIdx = 0; state.quizResults = [];
    state.quizScope = isSection ? { kind: "section", num: secNum, title: ((state.sections[state.sectionIdx] || {}).title || "") } : { kind: "node" };
    renderQuiz(card);
  } catch (e) {
    card.innerHTML = "<h2>✍️ 练习</h2><p class='muted'>出题失败：" + htmlEscape(e.message) + "</p>" +
      '<button class="btn small ghost" id="retry-quiz">重试</button>';
    const rb = document.getElementById("retry-quiz"); if (rb) rb.onclick = startQuiz;
  }
}

function renderQuiz(card) {
  const q = state.quiz[state.quizIdx];
  if (!q) return;
  const scope = state.quizScope;
  card.innerHTML = "<h2>✍️ 练习" + (scope && scope.kind === "section" ? " · 第 " + scope.num + " 节" + (scope.title ? "「" + htmlEscape(scope.title) + "」" : "") : "") + "</h2>" +
    (state.quizPlan ? "<p class='muted' style='font-size:13px;margin:2px 0 6px'>📐 " + state.quiz.length + " 道题 · " +
      (state.quizPlan.reasons.length ? state.quizPlan.reasons.join(" · ") : "标准题量") + "</p>" : "");
  const steps = document.createElement("div"); steps.className = "progress-steps";
  state.quiz.forEach((_, i) => {
    const s = document.createElement("div"); s.className = "pstep" + (i < state.quizIdx ? " done" : i === state.quizIdx ? " cur" : "");
    steps.appendChild(s);
  });
  card.appendChild(steps);

  const qBox = document.createElement("div"); qBox.className = "qa-question";
  const isChoice = Array.isArray(q.options) && q.options.length >= 2;
  qBox.innerHTML = "<b>第 " + (state.quizIdx + 1) + " / " + state.quiz.length + " 题</b>　<span class='tag'>" +
    (isChoice ? "单选" : q.type === "concept" ? "概念" : q.type === "proof" ? "证明" : q.type === "code" ? "编程" : q.type === "application" ? "应用" : "计算") + "</span><br><span class='no-katex'>" + htmlEscape(q.content) + "</span>";
  qBox.querySelector(".no-katex").classList.remove("no-katex");
  card.appendChild(qBox);
  katexRender(qBox);

  let ta = null, chosen = -1;
  if (isChoice) {
    const optWrap = document.createElement("div"); optWrap.className = "choice-list";
    const letters = "ABCDEF";
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button"); btn.className = "choice-btn"; btn.type = "button";
      btn.innerHTML = '<span class="choice-letter">' + letters[i] + "</span>" +
        '<span class="choice-text no-katex">' + htmlEscape(opt) + "</span>";
      btn.onclick = () => {
        optWrap.querySelectorAll(".choice-btn").forEach(b => b.classList.remove("picked"));
        btn.classList.add("picked");
        chosen = i;
      };
      optWrap.appendChild(btn);
    });
    card.appendChild(optWrap);
    optWrap.querySelectorAll(".no-katex").forEach(el => el.classList.remove("no-katex"));
    katexRender(optWrap);
  } else {
    const lbl = document.createElement("label"); lbl.className = "fld"; lbl.textContent = "你的答案（支持 LaTeX，如 $x^2$）";
    card.appendChild(lbl);
    ta = document.createElement("textarea"); ta.id = "answer-input"; ta.placeholder = "写出你的答案或推导过程…";
    card.appendChild(ta);
    const prev = document.createElement("div"); prev.className = "md"; prev.id = "answer-preview"; prev.style.marginTop = "6px";
    card.appendChild(prev);
    ta.addEventListener("input", () => { prev.innerHTML = '<span class="no-katex">' + htmlEscape(ta.value) + "</span>"; prev.querySelector(".no-katex").classList.remove("no-katex"); katexRender(prev); });
  }

  const btnRow = document.createElement("div"); btnRow.style.marginTop = "12px"; btnRow.style.display = "flex"; btnRow.style.gap = "10px";
  const submit = document.createElement("button"); submit.className = "btn"; submit.textContent = "提交批改";
  submit.onclick = () => {
    const ans = isChoice ? (chosen >= 0 ? "ABCDEF"[chosen] + ". " + q.options[chosen] : "") : (ta ? ta.value.trim() : "");
    if (!ans) { toast(isChoice ? "请先选择一个选项" : "请先写下你的答案", true); return; }
    gradeCurrent(ans, submit);
  };
  btnRow.appendChild(submit);
  card.appendChild(btnRow);
  const resultBox = document.createElement("div"); resultBox.id = "grade-result";
  card.appendChild(resultBox);
}

async function gradeCurrent(userAnswer, submitBtn) {
  const q = state.quiz[state.quizIdx];
  if (!userAnswer) { toast("请先写下你的答案", true); return; }
  const box = document.getElementById("grade-result");
  box.innerHTML = '<div class="loading-box"><span class="spinner"></span> 批改中，评估引擎正在独立验算…</div>';
  if (submitBtn) submitBtn.disabled = true;
  try {
    const g = await runJSONAgent("assessor",
      "【模式 grade_answer】\n题目：" + q.content + "\n标准答案：" + q.answer + "\n解析：" + (q.explanation || "") +
      (q.options && q.options.length ? "\n选项列表：" + q.options.map((o, i) => "ABCDEF"[i] + ". " + o).join(" | ") : "") +
      "\n用户回答：" + userAnswer + "\n是否使用提示：否\n请先独立重算再判断，只输出 JSON。");
    const graded = { ...q, userAnswer, grade: g };
    state.quizResults.push(graded);
    const mRes = await api("/api/answer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: q.db_id, user_answer: userAnswer, correct: !!g.correct, hint_used: false,
        error_type: g.error_type || "none", feedback: g.feedback || ""
      })
    });
    await loadBootstrap();
    box.innerHTML = "";
    const rb = document.createElement("div");
    rb.className = "result-box " + (g.correct ? "ok" : "bad");
    rb.innerHTML = "<b>" + (g.correct ? "✅ 回答正确" : "❌ 回答有误") + "</b>" +
      (g.error_type && g.error_type !== "none" ? "　<span class='tag bad'>" + (ERROR_TYPE_LABEL[g.error_type] || g.error_type) + "</span>" : "") +
      "<p style='margin-top:6px'><b>反馈：</b>" + htmlEscape(g.feedback || "") + "</p>" +
      "<p class='muted' style='margin-top:6px'><b>标准答案：</b><span class='no-katex'>" + htmlEscape(q.answer || "") + "</span></p>" +
      "<p class='muted' style='margin-top:6px'><b>解析：</b><span class='no-katex'>" + htmlEscape(q.explanation || "") + "</span></p>" +
      "<p class='muted'>掌握度 " + (mRes.mastery ? Math.round(mRes.mastery.mastery * 100) + "%（" + (mRes.mastery.delta >= 0 ? "+" : "") + mRes.mastery.delta + "）· 下次复习 " + mRes.mastery.next_review : "") + "</p>";
    box.appendChild(rb);
    rb.querySelector(".no-katex").classList.remove("no-katex");
    katexRender(rb);
    const next = document.createElement("button"); next.className = "btn small"; next.style.marginTop = "10px";
    next.textContent = state.quizIdx < state.quiz.length - 1 ? "下一题 →" : "查看练习总结";
    next.onclick = () => {
      if (state.quizIdx < state.quiz.length - 1) {
        state.quizIdx++;
        const card = document.getElementById("quiz-card");
        renderQuiz(card);
      } else {
        renderQuizSummary();
      }
    };
    box.appendChild(next);
  } catch (e) {
    box.innerHTML = '<p class="muted">批改失败：' + htmlEscape(e.message) + "</p>";
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function renderQuizSummary() {
  const card = document.getElementById("quiz-card");
  const sk = state.activeSkill;
  const total = state.quizResults.length;
  const ok = state.quizResults.filter(r => r.grade.correct).length;
  card.innerHTML = "<h2>✍️ 练习总结</h2>";
  const s = document.createElement("div"); s.className = "result-box " + (ok === total ? "ok" : ok === 0 ? "bad" : "ok");
  s.innerHTML = "<b>" + DOMAIN_META[state.domain].emoji + " " + htmlEscape(sk.name) + "</b>：共 " + total + " 题，答对 " + ok + " 题（" + Math.round(100 * ok / total) + "%）。" +
    "<br><span class='muted'>当前掌握度：" + Math.round(masteryOf(sk.id) * 100) + "%（" + masteryLabel(masteryOf(sk.id)) + "）。" +
    (ok < total ? " 错题已记入错题本，建议 1 天后复习。" : " 表现很好！系统已按遗忘曲线安排后续复习。") + "</span>";
  card.appendChild(s);
  const btns = document.createElement("div"); btns.style.marginTop = "12px"; btns.style.display = "flex"; btns.style.gap = "10px"; btns.style.flexWrap = "wrap";
  const again = document.createElement("button"); again.className = "btn ghost small"; again.textContent = "🔁 再练一组";
  again.onclick = () => { state.quiz = []; state.quizIdx = 0; state.quizResults = []; startQuiz(state.quizScope && state.quizScope.kind === "section" ? { section: true } : undefined); };
  const back = document.createElement("button"); back.className = "btn small"; back.textContent = "🗺️ 返回学习路径";
  back.onclick = () => navigate("path");
  btns.appendChild(back); btns.appendChild(again);
  card.appendChild(btns);
}

export { startQuiz, renderQuiz, gradeCurrent, renderQuizSummary };
