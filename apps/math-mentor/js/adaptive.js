import { state } from "./state.js";
import { masteryOf, skipPrereq } from "./utils.js";
import { DOMAIN_META } from "./config.js";
// 诊断：按领域规模自适应（大领域 8 题、小领域 5 题），每技能 1 题由易到难
function diagCount() {
  const n = state.skills.filter(s => s.domain === state.domain).length;
  if (n >= 25) return 8;
  if (n >= 15) return 7;
  if (n >= 8) return 6;
  return 5;
}
// 诊断技能：取当前学科难度最低的前 N 个（覆盖学科基础，自动适配任意学科）
function diagSkillIds() {
  return state.skills
    .filter(s => s.domain === state.domain)
    .sort((a, b) => a.difficulty - b.difficulty || a.sort_order - b.sort_order)
    .slice(0, diagCount())
    .map(s => s.id);
}
// 练习：基础 3 题，随技能难度 / 掌握度 / 历史错题动态调整，范围 [3, 6]
function quizCountFor(sk, wrongCount) {
  const d = Number(sk.difficulty) || 0.5;
  const m = masteryOf(sk.id);
  let n = 3; const reasons = [];
  if (d > 0.8) { n += 2; reasons.push("高难度技能"); }
  else if (d > 0.6) { n += 1; reasons.push("难度偏高"); }
  if (m >= 0.7) { n += 1; reasons.push("掌握较好·加挑战题"); }
  else if (m < 0.3) { n -= 1; reasons.push("基础薄弱·减负"); }
  if (wrongCount > 0) { n += 1; reasons.push("历史错题巩固"); }
  return { count: Math.max(3, Math.min(6, n)), reasons };
}
// 题量 → 题型建议（软性：实际题型按 QUIZ_RULES 第 6-8 条贴合技能内容选择，禁止硬凑）
function quizMix(n) {
  return "建议分布：概念/辨析题 " + Math.ceil(n / 2) + " 道 + 计算/应用/情境题 " + (n - Math.ceil(n / 2)) + " 道（仅作参考，实际题型必须贴合技能内容自然选择，人文类技能不硬凑计算题）";
}
// 按节练习的题量：内容越短题越少（2-4 道），保证每道题都有足够材料支撑
function sectionQuizPlan(len) {
  const count = len < 900 ? 2 : len < 2000 ? 3 : 4;
  return { count, reasons: ["本节练习：仅基于当前节内容出题"] };
}
function adaptiveRangeFor(sk) {
  const isNode = /^ct-/.test(sk.id);
  if (isNode) return { minS: 2, maxS: 4, estMin: 900, estMax: 1300 };
  const isOverview = /总览|概述|概论|导论/.test(String(sk.name || ""));
  if (isOverview) return { minS: 3, maxS: 6, estMin: 800, estMax: 1100 };
  const meta = DOMAIN_META[state.domain] || {};
  const cat = meta.category || "other";
  const d = Number(sk.difficulty) || 0.3;
  if (cat === "history") {
    if (d < 0.25) return { minS: 10, maxS: 16, estMin: 1200, estMax: 1800 };
    if (d < 0.4) return { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
    return { minS: 12, maxS: 18, estMin: 1300, estMax: 1800 };
  }
  if (cat === "science") return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
  if (cat === "engineering") return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
  if (cat === "medicine") return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
  if (cat === "law") return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
  if (cat === "economics" || cat === "management") return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
  if (cat === "literature" || cat === "education" || cat === "art" || cat === "agriculture" || cat === "philosophy") return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
  return d < 0.3 ? { minS: 10, maxS: 16, estMin: 1100, estMax: 1600 } : { minS: 12, maxS: 18, estMin: 1200, estMax: 1800 };
}
function dimensionsForCategory(cat) {
  const map = {
    history: "时空 · 政治 · 经济 · 社会 · 文化 · 兴衰",
    science: "直觉 · 定义 · 定理/原理 · 证明/推导 · 例子/计算 · 误区/边界",
    engineering: "概念 · 原理 · 实现 · 复杂度 · 应用 · 局限",
    medicine: "概念 · 机制 · 诊断/评估 · 治疗/干预 · 案例 · 前沿/争议",
    law: "概念 · 渊源 · 结构 · 适用 · 案例 · 争议",
    economics: "概念 · 原理 · 模型 · 实证 · 政策/策略 · 前沿",
    management: "概念 · 原理 · 模型 · 实证 · 政策/策略 · 前沿",
    philosophy: "概念 · 渊源/背景 · 流派/方法 · 文本/案例 · 影响/评价 · 前沿/反思",
    literature: "概念 · 渊源/背景 · 流派/方法 · 文本/案例 · 影响/评价 · 前沿/反思",
    education: "概念 · 渊源/背景 · 流派/方法 · 文本/案例 · 影响/评价 · 前沿/反思",
    art: "概念 · 渊源/背景 · 流派/方法 · 文本/案例 · 影响/评价 · 前沿/反思",
    agriculture: "概念 · 渊源/背景 · 流派/方法 · 文本/案例 · 影响/评价 · 前沿/反思"
  };
  return map[cat] || map.engineering;
}
export { diagCount, diagSkillIds, quizCountFor, quizMix, sectionQuizPlan, adaptiveRangeFor, dimensionsForCategory };
