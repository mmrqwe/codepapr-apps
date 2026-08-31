import { BASE } from "./env.js";
import { state } from "./state.js";
/* ============ 工具函数 ============ */
let toastTimer = null;
function toast(msg, isErr) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = isErr ? "show err" : "show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ""; }, 2800);
}
async function api(path, opts) {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) {
    let msg = "请求失败 (" + r.status + ")";
    try { const j = await r.json(); if (j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return r.json();
}
function masteryColor(m) {
  if (m < 0.3) return "#ef4444";
  if (m < 0.6) return "#f59e0b";
  if (m < 0.8) return "#6366f1";
  return "#22c55e";
}
function masteryLabel(m) {
  if (m < 0.3) return "薄弱";
  if (m < 0.6) return "学习中";
  if (m < 0.8) return "较扎实";
  return "已掌握";
}
function masteryOf(skillId) {
  const r = state.mastery[skillId];
  return r ? Number(r.mastery) : 0.1;
}
// 是否跳过先修限制（设置面板全局开关，默认开启；显式存 "0" 才恢复限制）
function skipPrereq() { return state.settings["skip-prereq"] !== "0"; }
// LLM JSON 常见笔误修复：全角标点、尾随逗号、未加引号的 key、行注释
function repairLLMJSON(s) {
  let t = String(s || "");
  t = t.replace(/[\u201c\u201d]/g, "\"")                     // 全角引号
       .replace(/[\uff1a]/g, ":")                             // 全角冒号
       .replace(/[\uff5b]/g, "{").replace(/[\uff5d]/g, "}")  // 全角花括号
       .replace(/[\uff3b]/g, "[").replace(/[\uff3d]/g, "]"); // 全角方括号
  t = t.replace(/，\s*(?=["'{}\[\]])/g, ",");                // 全角逗号（仅分隔符位置）
  t = t.replace(/^\s*\/\/.*$/gm, "");                        // 行注释
  t = t.replace(/,\s*([}\]])/g, "$1");                       // 尾随逗号
  t = t.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, "$1\"$2\"$3"); // 裸 key 加引号
  return t;
}
function parseAgentJSON(text) {
  let t = String(text || "").trim();
  if (!t) throw new Error("AI 未返回任何内容（可能是服务或网络问题），请重试");
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const candidates = [t, repairLLMJSON(t)];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch (e) {}
    // 对象：从第一个 { 开始，从最长到最短逐次尝试找合法 JSON 前缀
    const s = c.indexOf("{");
    if (s >= 0) {
      for (let e2 = c.lastIndexOf("}"); e2 > s; e2 = c.lastIndexOf("}", e2 - 1)) {
        try { return JSON.parse(c.slice(s, e2 + 1)); } catch (err) {}
      }
    }
    // 数组兜底：仅当文本不含对象起始符时使用（否则会从对象内部误切出嵌套数组，提前返回错误结果）
    if (s < 0) {
      const as = c.indexOf("[");
      if (as >= 0) {
        for (let ae = c.lastIndexOf("]"); ae > as; ae = c.lastIndexOf("]", ae - 1)) {
          try { return JSON.parse(c.slice(as, ae + 1)); } catch (err) {}
        }
      }
    }
  }
  throw new Error("AI 输出不是有效 JSON（输出开头：" + t.slice(0, 120) + "…）");
}
// 带一次解析失败自动重试的 JSON Agent 调用（重试时附带上次输出片段，强制模型重出合法 JSON）
async function runJSONAgent(agent, task) {
  const res = await agentRun(agent, task);
  try { return parseAgentJSON(res.content); }
  catch (e) {
    const raw = String(res.content || "").trim();
    const retryTask = task + "\n\n【重试说明】你上一次的输出无法解析为合法 JSON（错误：" + e.message + "）。原始输出片段：\n```\n" + raw.slice(0, 1500) + "\n```\n请重新输出：只输出一个合法 JSON，不要 markdown 代码块、不要任何解释文字、不要尾随逗号、不要注释、不要省略号。";
    const res2 = await agentRun(agent, retryTask);
    return parseAgentJSON(res2.content);
  }
}
// 评估引擎输出归一化：把 AI 出题结果规整到渲染器期望的形态（防 type 别名、选项前缀、字母答案等漂移）
const QUIZ_RULES = "出题规则（必须严格遵守）：\n" +
  "1. 单选题 type 必须写 \"choice\"，options 必须是 4 个纯选项文本的字符串数组（不要带 A./B. 前缀），answer 必须是正确选项的完整文本（禁止只写字母）\n" +
  "2. 题面含「下列哪一项 / 正确的是 / 错误的是 / 选出」等选择形式的，必须带 options 字段\n" +
  "3. 非选择题（证明 / 推导 / 写代码 / 开放问答）不写 options 字段\n" +
  "4. 正确选项位置随机分布，不要固定\n" +
  "5. 干扰项要合理：来自常见误解或典型错误\n" +
  "6. 题型必须贴合技能内容：历史 / 政治 / 文学 / 哲学 / 法学等人文类技能出概念辨析、因果分析、材料情境题（不要出计算题）；数学 / 物理 / 化学 / 工程类技能出计算与推导；计算机类技能出代码或复杂度分析\n" +
  "7. 禁止为凑题型编造量化数据：技能本身不含可计算的量化内容时，一律不出计算题（例如历史事件出「起止时间 / 人物 / 意义」判断题，而不是「持续多少年」的算术题）\n" +
  "8. 禁止只考四则运算的小学算术题：计算题必须体现学科思维（公式应用、定理运用、统计推断、模型分析），题面数据要有学科意义\n" +
  "9. 若任务中提供了【学习材料】（用户已学完的讲解），所有题目的考点、题干、标准答案、解析必须严格出自学习材料：禁止引入学习材料中未出现的人名、年代、事件、制度、术语；学习材料不足以支撑要求题量时，可减少题量（最少 2 道），并保证每道题都基于学习材料";
function normalizeQuestions(qs) {
  if (!Array.isArray(qs)) return [];
  const letters = "ABCDEF";
  return qs.map(q => {
    const nq = { ...q };
    // 1) options 归一：字符串 → 数组；剥离选项文本自带的 "A. " 前缀
    let opts = nq.options;
    if (typeof opts === "string" && opts.trim()) {
      opts = opts.split(/\n+|\|/).map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(opts)) {
      opts = opts.map((o, i) => {
        let s = String(o ?? "").trim();
        const idx = i + 1;
        s = s.replace(new RegExp("^(" + idx + "|[" + letters[i] + "])\\s*[\\.、:：)）]\\s*", "i"), "");
        return s;
      }).filter(s => s);
    }
    nq.options = Array.isArray(opts) ? opts : [];
    // 2) type 归一：只要有 ≥2 个选项就视为选择题；常见别名也归一到 choice
    const t = String(nq.type || "").toLowerCase();
    if (nq.options.length >= 2) nq.type = "choice";
    else if (["choice", "single", "single_choice", "choice_question", "radio"].includes(t)) nq.type = "choice";
    // 3) answer 归一：字母 / 数字编号 / "A. xxx" 前缀 → 完整选项文本
    if (nq.options.length >= 2) {
      const ans = String(nq.answer || "").trim();
      const m = ans.match(/^([A-F]|\d+)[\\.、:：)）]\s*(.+)$/i);
      if (m) {
        const idx = /^[A-F]$/i.test(m[1]) ? m[1].toUpperCase().charCodeAt(0) - 65 : parseInt(m[1], 10) - 1;
        if (idx >= 0 && idx < nq.options.length) nq.answer = nq.options[idx];
      } else if (/^[A-F]$/i.test(ans) || /^\d+$/.test(ans)) {
        const idx = /^[A-F]$/i.test(ans) ? ans.toUpperCase().charCodeAt(0) - 65 : parseInt(ans, 10) - 1;
        if (idx >= 0 && idx < nq.options.length) nq.answer = nq.options[idx];
      }
    }
    return nq;
  });
}

// ===== 讲解风格系统 =====
const STYLE_PRESETS = [
  { id: "plain", label: "🧸 通俗启蒙", desc: "普林斯顿读本式：生活类比先行、零基础友好、对话语气", module: "【风格：通俗启蒙】默认用户只有初中基础：先用生活化类比建立直觉，再逐步走向严格定义；全程对话语气，像朋友聊天一样；术语首次出现必须用大白话解释。" },
  { id: "balanced", label: "⚖️ 均衡渐进", desc: "直觉到严谨的完整过渡：类比引入、必要推导保留、术语规范", module: "【风格：均衡渐进】默认用户有中等基础：每个概念用一两句直觉引入后，直接给出规范定义并保留关键推导；术语按教科书规范使用（首次出现给简短解释）；语气平和专业。" },
  { id: "rigorous", label: "🎓 学术严谨", desc: "定义-定理-证明结构：标准术语、完整论证、少类比", module: "【风格：学术严谨】默认用户是专业学习者：按「定义 → 定理 → 证明 → 注记/例子」的结构组织；直接使用标准学科术语，不做通俗化改写；论证完整、逻辑严密；类比仅作点缀，不作为主要讲解手段。" },
  { id: "exam", label: "🎯 应试速成", desc: "考点导向：高频考点、典型例题、易错点清单", module: "【风格：应试速成】目标读者为备考者：围绕高频考点组织，每个知识点给出核心结论/公式、1-2 道典型例题（含解题步骤）、易错点清单；不展开思想史与动机，直接给可操作的解题套路。" },
  { id: "custom", label: "✏️ 自定义", desc: "用自己的话描述想要的讲解风格", module: "" }
];
function styleById(id) { return STYLE_PRESETS.find(s => s.id === id) || STYLE_PRESETS[0]; }
function currentStyle() { return state.settings["style:" + state.domain] || "plain"; }
function styleModule() {
  const id = currentStyle();
  const p = styleById(id);
  if (id === "custom") {
    const t = (state.settings["styletext:" + state.domain] || "").trim();
    return t ? "【风格：自定义】" + t : styleById("balanced").module;
  }
  return p.module;
}

async function agentRun(agent, task, onDelta) {
  if (!(window.papr && window.papr.agent && window.papr.agent.run)) {
    throw new Error("AI 能力不可用：请从 CodePapr 应用面板打开本应用（浏览器直访调试页没有 AI SDK）");
  }
  return await window.papr.agent.run({ agent, task }, (ev) => {
    if (ev && ev.type === "content-delta" && onDelta) {
      const d = ev.content || ev.delta || ev.text || "";
      if (d) onDelta(d);
    }
  });
}

export function htmlEscape(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function elCursor() {
  const s = document.createElement("span");
  s.className = "cursor-blink";
  return s;
}
export { toast, api, masteryColor, masteryLabel, masteryOf, skipPrereq, repairLLMJSON, parseAgentJSON, runJSONAgent, normalizeQuestions, QUIZ_RULES, STYLE_PRESETS, styleById, currentStyle, styleModule, agentRun };
