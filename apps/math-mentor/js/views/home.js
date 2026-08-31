import { CATEGORIES, DOMAIN_META } from "../config.js";
import { diagCount } from "../adaptive.js";
import { state } from "../state.js";
import { htmlEscape } from "../utils.js";
import { navigate, enterDomain } from "../navigation.js";

function vHome(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";

  // ---- Hero：介绍 + 学习闭环 ----
  const hero = document.createElement("div"); hero.className = "card hero";
  hero.innerHTML =
    "<h1>🎓 学习导师</h1>" +
    "<p class='hero-sub'>像朋友聊天一样，把大学课程讲到零基础也能懂。普林斯顿读本式教学，AI 讲解生成前还会对照维基百科核查，最大程度避免幻觉。</p>" +
    "<div class='hero-steps'>" +
    "<div class='hstep'><div class='ic'>🧭</div><b>1. 读学科导览</b><br><span class='muted'>先看这个学科研究什么</span></div>" +
    "<div class='hstep'><div class='ic'>🎯</div><b>2. 能力诊断</b><br><span class='muted'>自适应题量定位起点</span></div>" +
    "<div class='hstep'><div class='ic'>📖</div><b>3. 逐章学习</b><br><span class='muted'>直觉先行 · 小步慢走</span></div>" +
    "<div class='hstep'><div class='ic'>🔁</div><b>4. 按曲线复习</b><br><span class='muted'>1/3/7/14 天对抗遗忘</span></div>" +
    "</div>";
  wrap.appendChild(hero);

  // ---- 全局统计 ----
  const agg = { attempts: 0, correct: 0, due: 0, questions: 0 };
  Object.values(state.stats).forEach(s => {
    agg.attempts += s.attempts || 0; agg.correct += s.correct || 0; agg.due += s.due || 0; agg.questions += s.questions || 0;
  });
  const diagCount = Object.keys(state.diagnosis).length;
  const acc = agg.attempts ? Math.round(100 * agg.correct / agg.attempts) : 0;
  const statCard = document.createElement("div"); statCard.className = "card";
  statCard.innerHTML = "<h2>📈 学习总览</h2>";
  const r = document.createElement("div"); r.className = "row";
  const boxes = [
    ["已诊断学科", diagCount + " / " + Object.keys(DOMAIN_META).length],
    ["累计答题", agg.attempts],
    ["正确率", agg.attempts ? acc + "%" : "—"],
    ["待复习", agg.due]
  ];
  boxes.forEach(([l, n]) => {
    const b = document.createElement("div"); b.className = "stat-box";
    b.innerHTML = '<div class="num">' + n + '</div><div class="lbl">' + l + "</div>";
    r.appendChild(b);
  });
  statCard.appendChild(r);
  wrap.appendChild(statCard);

  // ---- 继续学习 ----
  const cur = state.settings.current_domain;
  if (cur && DOMAIN_META[cur]) {
    const m = DOMAIN_META[cur];
    const cont = document.createElement("div"); cont.className = "card continue-card";
    cont.innerHTML = "<div><span class='muted' style='font-size:12px'>上次在学</span><br><b style='font-size:16px'>" +
      m.emoji + " " + htmlEscape(m.label) + "</b></div>";
    const btn = document.createElement("button"); btn.className = "btn";
    btn.textContent = "继续学习 →";
    btn.onclick = () => enterDomain(cur);
    cont.appendChild(btn);
    wrap.appendChild(cont);
  }

  // ---- 自定义专题入口 ----
  const csec = document.createElement("div"); csec.className = "card";
  csec.innerHTML = "<h2>🎨 自定义专题</h2>" +
    "<p class='muted' style='margin:2px 0 10px'>大学课程之外，任何你想学的主题——历史事件、技术栈、行业知识……AI 联网查证后自动搭好课程大纲，同样走「导览 → 诊断 → 学习 → 复习」闭环。</p>";
  const crow = document.createElement("div");
  if (state.customTopics.length) {
    state.customTopics.forEach(t => {
      const chip = document.createElement("button"); chip.className = "btn ghost small";
      chip.style.cssText = "margin:0 8px 8px 0";
      chip.innerHTML = (t.emoji || "🎨") + " " + htmlEscape(t.title);
      chip.onclick = () => enterDomain(t.id);
      crow.appendChild(chip);
    });
  } else {
    crow.innerHTML = '<span class="muted">还没有自定义专题。点「＋ 新建专题」创建第一个。</span>';
  }
  csec.appendChild(crow);
  const cbtns = document.createElement("div");
  cbtns.style.cssText = "display:flex;gap:8px;margin-top:10px";
  const nb2 = document.createElement("button"); nb2.className = "btn"; nb2.textContent = "＋ 新建专题";
  nb2.onclick = () => { state.customEditing = null; navigate("custom"); };
  const mb2 = document.createElement("button"); mb2.className = "btn ghost"; mb2.textContent = "管理专题";
  mb2.onclick = () => { state.customEditing = null; navigate("custom"); };
  cbtns.append(nb2, mb2);
  csec.appendChild(cbtns);
  wrap.appendChild(csec);

  // ---- 大学科门类（点击进入子学科列表） ----
  const grid = document.createElement("div"); grid.className = "cat-grid";
  CATEGORIES.forEach(cat => {
    const domains = Object.entries(DOMAIN_META).filter(([, m]) => m.category === cat.id);
    if (!domains.length) return;
    const diagCount = domains.filter(([id]) => state.diagnosis[id]).length;
    const tile = document.createElement("div"); tile.className = "cat-tile";
    tile.innerHTML = '<div class="ct-ic">' + cat.emoji + '</div><div class="ct-name">' + cat.label + '</div>' +
      '<div class="ct-desc">' + cat.desc + '</div>' +
      '<div class="ct-meta"><span>' + domains.length + ' 门学科</span><span>' + (diagCount ? "已诊断 " + diagCount : "") + '</span></div>';
    tile.onclick = () => { state.cat = cat.id; navigate("category"); };
    grid.appendChild(tile);
  });
  wrap.appendChild(grid);

  main.appendChild(wrap);
}

/* ============ 自定义专题（管理 / 新建 / AI 大纲生成 / 编辑器） ============ */
export { vHome };
