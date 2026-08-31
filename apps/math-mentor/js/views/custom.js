import { CATEGORIES, DOMAIN_META, TRACKS } from "../config.js";
import { state } from "../state.js";
import { toast, api, masteryOf, parseAgentJSON, htmlEscape } from "../utils.js";
import { navigate, loadBootstrap, updateBadges, enterDomain } from "../navigation.js";
import { emptyBox } from "../ui.js";
import { makeDomainPill, makeTrackCard } from "../components.js";
import { exportOutlinePPT } from "../ppt.js";

let customDraft = null; // 编辑器草稿 {id?, title, emoji, tagline, chapters:[{name,difficulty,nodes:[{name,desc,difficulty}]}]}

function vCustom(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  if (customDraft) { renderCustomEditor(wrap); main.appendChild(wrap); return; }
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px";
  const h = document.createElement("h2"); h.textContent = "🎨 自定义专题"; h.style.margin = "0";
  const nb = document.createElement("button"); nb.className = "btn"; nb.textContent = "＋ 新建专题";
  nb.onclick = () => { customDraft = emptyDraft(); renderCustomEditor(wrap); };
  head.append(h, nb);
  wrap.appendChild(head);

  const tip = document.createElement("div"); tip.className = "card";
  tip.innerHTML = "<span class='muted'>想系统学习任何主题：输入一句话（如「冷战时期北约与华约的方方面面」），AI 会<b>联网查证</b>后生成课程大纲，你可以自由增删改章节和节点，保存后像普通学科一样走完整学习闭环。</span>";
  wrap.appendChild(tip);

  if (!state.customTopics.length) {
    wrap.appendChild(emptyBox("🎨", "还没有自定义专题，点「＋ 新建专题」创建第一个。"));
    main.appendChild(wrap);
    return;
  }
  state.customTopics.forEach(t => wrap.appendChild(makeTopicCard(t)));
  main.appendChild(wrap);
}

function emptyDraft() {
  return { id: null, title: "", emoji: "🎨", tagline: "", chapters: [] };
}

function makeTopicCard(t) {
  const card = document.createElement("div"); card.className = "topic-card";
  const ic = document.createElement("div"); ic.className = "topic-ic"; ic.textContent = t.emoji || "🎨";
  const info = document.createElement("div"); info.className = "topic-info";
  const chs = (t.outline || []).length;
  const nodes = t.skill_count || 0;
  const done = state.skills.filter(s => s.domain === t.id && masteryOf(s.id) >= 0.7).length;
  info.innerHTML = "<b>" + htmlEscape(t.title) + "</b>" +
    "<div class='muted' style='font-size:13px'>" + htmlEscape(t.tagline || "自定义学习专题") + "</div>" +
    "<div class='muted' style='font-size:12px'>" + chs + " 章 · " + nodes + " 节点 · 已掌握 " + done + "/" + nodes + " · 创建于 " + htmlEscape(String(t.created_at || "").slice(0, 10)) + "</div>";
  const acts = document.createElement("div"); acts.className = "topic-actions";
  const bLearn = document.createElement("button"); bLearn.className = "btn small"; bLearn.textContent = "开始学习";
  bLearn.onclick = () => enterDomain(t.id);
  const bEdit = document.createElement("button"); bEdit.className = "btn ghost small"; bEdit.textContent = "编辑大纲";
  bEdit.onclick = () => {
    customDraft = {
      id: t.id, title: t.title, emoji: t.emoji || "🎨", tagline: t.tagline || "",
      chapters: (t.outline || []).map(ch => ({ name: ch.name, difficulty: ch.difficulty, nodes: (ch.nodes || []).map(nd => ({ name: nd.name, desc: nd.desc || "", difficulty: nd.difficulty })) }))
    };
    const main = document.getElementById("main");
    const wrap = document.createElement("div"); wrap.className = "wrap";
    renderCustomEditor(wrap); main.innerHTML = ""; main.appendChild(wrap);
  };
  const bExport = document.createElement("button"); bExport.className = "btn ghost small"; bExport.textContent = "导出 PPT";
  bExport.title = "把章节与节点大纲导出为 PPT 文件";
  bExport.disabled = !(t.outline && t.outline.length);
  if (bExport.disabled) bExport.title = "暂无章节，先编辑大纲再导出";
  bExport.onclick = async () => {
    bExport.disabled = true; bExport.textContent = "⏳ 生成中…";
    try { await exportOutlinePPT(t); }
    catch (e) { toast("导出失败：" + (e.message || e), true); }
    finally { bExport.disabled = !(t.outline && t.outline.length); bExport.textContent = "导出 PPT"; }
  };
  const bDel = document.createElement("button"); bDel.className = "btn ghost small"; bDel.textContent = "删除";
  bDel.style.color = "var(--red)";
  bDel.onclick = async () => {
    if (!window.confirm("确定删除专题「" + t.title + "」？\n该专题的章节、学习记录、错题、诊断将一并删除，不可恢复。")) return;
    try {
      await api("/api/custom/" + t.id, { method: "DELETE" });
      toast("已删除专题「" + t.title + "」");
      if (state.domain === t.id) { state.domain = "analysis"; state.settings.current_domain = "analysis"; }
      await loadBootstrap();
      navigate("custom");
    } catch (e) { toast("删除失败：" + (e.message || e), true); }
  };
  acts.append(bLearn, bEdit, bExport, bDel);
  card.append(ic, info, acts);
  return card;
}

function renderCustomEditor(wrap) {
  const d = customDraft;
  wrap.innerHTML = "";
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px";
  const back = document.createElement("button"); back.className = "btn ghost small"; back.textContent = "← 返回";
  back.onclick = () => { customDraft = null; navigate("custom"); };
  const h = document.createElement("h2"); h.style.margin = "0";
  h.textContent = d.id ? "✏️ 编辑专题" : "✨ 新建自定义专题";
  head.append(back, h);
  wrap.appendChild(head);

  // 基本信息
  const base = document.createElement("div"); base.className = "card";
  const grid = document.createElement("div"); grid.className = "form-grid";
  const inTitle = document.createElement("input"); inTitle.type = "text"; inTitle.className = "grow";
  inTitle.placeholder = "专题名称（必填），如：冷战：北约与华约"; inTitle.value = d.title;
  inTitle.oninput = () => { d.title = inTitle.value; };
  const inEmoji = document.createElement("input"); inEmoji.type = "text"; inEmoji.style.width = "70px";
  inEmoji.placeholder = "🎨"; inEmoji.value = d.emoji;
  inEmoji.oninput = () => { d.emoji = inEmoji.value || "🎨"; };
  const inTag = document.createElement("input"); inTag.type = "text"; inTag.style.width = "100%";
  inTag.placeholder = "一句话描述（可选），如：二战后的两极格局、两大军事集团的对峙与博弈";
  inTag.value = d.tagline; inTag.style.marginTop = "8px";
  inTag.oninput = () => { d.tagline = inTag.value; };
  grid.append(inTitle, inEmoji, inTag);
  base.appendChild(grid);

  // AI 工具区（无章节=生成大纲；有章节=续写章节）
  {
    const gen = document.createElement("div"); gen.className = "gen-box";
    const hasAI = !!(window.papr && window.papr.agent && window.papr.agent.run);
    const prog = document.createElement("div"); prog.className = "gen-progress"; prog.style.display = "none";
    if (!d.chapters.length) {
      gen.innerHTML = "<b>🤖 AI 生成大纲</b>" +
        "<p class='muted' style='font-size:13px;margin:4px 0 10px'>" + (hasAI
          ? "输入专题名后点击生成：AI 会联网搜索并对照维基百科查证，自动设计 6-10 章、每章 3-6 个节点的学习大纲。生成后可自由修改。"
          : "当前环境不支持 AI 生成（SDK 不可用）。请使用下方「手动录入」逐章搭建大纲。") + "</p>";
      const gbtn = document.createElement("button"); gbtn.className = "btn"; gbtn.textContent = "✨ 生成大纲（联网查证）";
      gbtn.disabled = !hasAI;
      gbtn.onclick = () => generateOutline(gen, d, wrap);
      const mbtn = document.createElement("button"); mbtn.className = "btn ghost"; mbtn.textContent = "✍️ 手动录入";
      mbtn.style.marginLeft = "8px";
      mbtn.onclick = () => { d.chapters = [{ name: "", difficulty: 0.3, nodes: [{ name: "", desc: "", difficulty: 0.3 }] }]; renderCustomEditor(wrap); };
      gen.append(gbtn, mbtn, prog);
    } else {
      gen.innerHTML = "<b>🤖 AI 辅助</b>" +
        "<p class='muted' style='font-size:13px;margin:4px 0 10px'>" + (hasAI
          ? "已有 " + d.chapters.length + " 章。点「AI 续写章节」让 AI 基于现有大纲继续生成后续 3 章（可反复续写），也可以手动添加章节。"
          : "当前环境不支持 AI（SDK 不可用）。请使用下方按钮手动添加章节。") + "</p>";
      const gbtn = document.createElement("button"); gbtn.className = "btn"; gbtn.textContent = "🤖 AI 续写章节（+3 章）";
      gbtn.disabled = !hasAI;
      gbtn.onclick = () => generateMore(gen, d, wrap);
      gen.append(gbtn, prog);
    }
    base.appendChild(gen);
  }

  // 章节列表
  const chWrap = document.createElement("div");
  chWrap.innerHTML = "<h3 style='margin:14px 0 8px'>📖 章节与节点 <span class='muted' style='font-size:13px;font-weight:400'>章节按顺序递进（每章依赖上一章），节点在本章内按顺序递进</span></h3>";
  d.chapters.forEach((ch, ci) => chWrap.appendChild(chapterCard(d, ch, ci, wrap)));
  if (!d.chapters.length) {
    chWrap.appendChild(emptyBox("📖", "还没有章节。点下方「＋ 添加一章」开始搭建。"));
  }
  const addCh = document.createElement("button"); addCh.className = "btn ghost small oc-add"; addCh.textContent = "＋ 添加一章（自动带一个节点）";
  addCh.onclick = () => { d.chapters.push({ name: "", difficulty: 0.4, nodes: [{ name: "", desc: "", difficulty: 0.4 }] }); renderCustomEditor(wrap); };
  chWrap.appendChild(addCh);
  base.appendChild(chWrap);

  // 保存
  const foot = document.createElement("div");
  foot.style.cssText = "display:flex;gap:8px;margin-top:12px;flex-wrap:wrap";
  const bSave = document.createElement("button"); bSave.className = "btn save-topic-btn"; bSave.textContent = d.id ? "💾 保存修改" : "💾 保存专题";
  bSave.onclick = () => saveCustomTopic(d, wrap);
  const bCancel = document.createElement("button"); bCancel.className = "btn ghost"; bCancel.textContent = "取消";
  bCancel.onclick = () => { customDraft = null; navigate("custom"); };
  foot.append(bSave, bCancel);
  base.appendChild(foot);
  wrap.appendChild(base);
}

function chapterCard(d, ch, ci, wrap) {
  const card = document.createElement("div"); card.className = "oc-card";
  const head = document.createElement("div"); head.className = "oc-head";
  const num = document.createElement("span"); num.className = "oc-num"; num.textContent = ci + 1;
  const inName = document.createElement("input"); inName.type = "text"; inName.className = "grow";
  inName.placeholder = "章节名称，如：冷战的起源与铁幕降下"; inName.value = ch.name;
  inName.oninput = () => { ch.name = inName.value; };
  const inDiff = document.createElement("input"); inDiff.type = "number"; inDiff.className = "diff-num";
  inDiff.min = "0.1"; inDiff.max = "0.9"; inDiff.step = "0.1"; inDiff.value = ch.difficulty; inDiff.title = "本章难度 0.1-0.9";
  inDiff.oninput = () => { ch.difficulty = Math.max(0.05, Math.min(0.95, Number(inDiff.value) || 0.5)); };
  const bUp = document.createElement("button"); bUp.className = "mini-btn"; bUp.textContent = "↑";
  bUp.onclick = () => { if (ci > 0) { d.chapters.splice(ci - 1, 0, d.chapters.splice(ci, 1)[0]); renderCustomEditor(wrap); } };
  const bDn = document.createElement("button"); bDn.className = "mini-btn"; bDn.textContent = "↓";
  bDn.onclick = () => { if (ci < d.chapters.length - 1) { d.chapters.splice(ci + 1, 0, d.chapters.splice(ci, 1)[0]); renderCustomEditor(wrap); } };
  const bDel = document.createElement("button"); bDel.className = "mini-btn danger"; bDel.textContent = "删除本章";
  bDel.onclick = () => { d.chapters.splice(ci, 1); renderCustomEditor(wrap); };
  head.append(num, inName, inDiff, bUp, bDn, bDel);
  card.appendChild(head);

  ch.nodes.forEach((nd, ni) => {
    const row = document.createElement("div"); row.className = "oc-node";
    const dot = document.createElement("span"); dot.className = "muted"; dot.style.cssText = "font-size:11px;width:18px;flex:none";
    dot.textContent = (ni + 1) + ".";
    const inN = document.createElement("input"); inN.type = "text"; inN.className = "in-name";
    inN.placeholder = "节点（知识点）名称"; inN.value = nd.name;
    inN.oninput = () => { nd.name = inN.value; };
    const inD = document.createElement("input"); inD.type = "text"; inD.className = "in-desc";
    inD.placeholder = "一句话说明学什么"; inD.value = nd.desc || "";
    inD.oninput = () => { nd.desc = inD.value; };
    const inDD = document.createElement("input"); inDD.type = "number"; inDD.className = "in-diff";
    inDD.min = "0.1"; inDD.max = "0.9"; inDD.step = "0.1"; inDD.value = nd.difficulty; inDD.title = "难度";
    inDD.oninput = () => { nd.difficulty = Math.max(0.05, Math.min(0.95, Number(inDD.value) || 0.5)); };
    const bUp2 = document.createElement("button"); bUp2.className = "mini-btn"; bUp2.textContent = "↑"; bUp2.title = "上移节点";
    bUp2.onclick = () => { if (ni > 0) { ch.nodes.splice(ni - 1, 0, ch.nodes.splice(ni, 1)[0]); renderCustomEditor(wrap); } };
    const bDn2 = document.createElement("button"); bDn2.className = "mini-btn"; bDn2.textContent = "↓"; bDn2.title = "下移节点";
    bDn2.onclick = () => { if (ni < ch.nodes.length - 1) { ch.nodes.splice(ni + 1, 0, ch.nodes.splice(ni, 1)[0]); renderCustomEditor(wrap); } };
    const bDel2 = document.createElement("button"); bDel2.className = "mini-btn danger"; bDel2.textContent = "✕";
    bDel2.onclick = () => { ch.nodes.splice(ni, 1); renderCustomEditor(wrap); };
    row.append(dot, inN, inD, inDD, bUp2, bDn2, bDel2);
    card.appendChild(row);
  });
  const addN = document.createElement("button"); addN.className = "mini-btn oc-add"; addN.textContent = "＋ 添加节点";
  addN.onclick = () => { ch.nodes.push({ name: "", desc: "", difficulty: ch.difficulty || 0.4 }); renderCustomEditor(wrap); };
  card.appendChild(addN);
  return card;
}

// 校验大纲：返回错误文案或 null
function validateDraft(d) {
  if (!String(d.title || "").trim()) return "请填写专题名称";
  if (!d.chapters.length) return "至少需要一章";
  for (let ci = 0; ci < d.chapters.length; ci++) {
    const ch = d.chapters[ci];
    if (!String(ch.name || "").trim()) return "第 " + (ci + 1) + " 章缺少名称";
    if (!ch.nodes.length) return "第 " + (ci + 1) + " 章（" + ch.name + "）至少需要一个节点";
    for (const nd of ch.nodes) {
      if (!String(nd.name || "").trim()) return "第 " + (ci + 1) + " 章有节点缺少名称";
    }
  }
  return null;
}

async function saveCustomTopic(d, wrap) {
  const err = validateDraft(d);
  if (err) { toast(err, true); return; }
  const body = { title: String(d.title).trim(), emoji: d.emoji || "🎨", tagline: String(d.tagline || "").trim(), outline: d.chapters };
  const url = d.id ? "/api/custom/" + d.id : "/api/custom";
  const saveBtn = Array.from(wrap.querySelectorAll("button")).find(b => b.textContent.startsWith("💾"));
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "保存中…"; }
  try {
    const res = await api(url, { method: d.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    customDraft = null;
    await loadBootstrap();
    toast("专题「" + body.title + "」已保存");
    enterDomain(res.id || d.id);
  } catch (e) {
    toast("保存失败：" + (e.message || e), true);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = d.id ? "💾 保存修改" : "💾 保存专题"; }
  }
}

// AI 大纲生成公共执行器（topic-builder agent，联网查证）
function mapChapters(json) {
  return (Array.isArray(json.chapters) ? json.chapters : []).map(ch => ({
    name: String(ch.name || "").trim(),
    difficulty: Math.max(0.05, Math.min(0.95, Number(ch.difficulty ?? 0.3) || 0.3)),
    nodes: (Array.isArray(ch.nodes) ? ch.nodes : []).map(nd => ({
      name: String(nd.name || "").trim(),
      desc: String(nd.desc || "").trim(),
      difficulty: Math.max(0.05, Math.min(0.95, Number(nd.difficulty ?? 0.3) || 0.3))
    })).filter(nd => nd.name)
  })).filter(ch => ch.name && ch.nodes.length);
}
async function runBuilder(gen, task) {
  const prog = gen.querySelector(".gen-progress");
  const btns = gen.querySelectorAll("button");
  btns.forEach(b => { b.disabled = true; });
  prog.style.display = "block";
  prog.textContent = "🚀 正在启动专题设计师…\n";
  try {
    const r = await window.papr.agent.run({ agent: "topic-builder", task }, (ev) => {
      if (!ev) return;
      if (ev.type === "tool-call-start") prog.textContent += "🔍 正在联网查证" + (ev.tool ? "（" + ev.tool + "）" : "") + "…\n";
      else if (ev.type === "tool-call-end") prog.textContent += "✅ 查证完成\n";
      else if (ev.type === "content-delta") {
        const t = ev.content || ev.delta || ev.text || "";
        if (t) { prog.textContent += t; if (prog.textContent.length > 4000) prog.textContent = "…（前文略）" + prog.textContent.slice(-3000); }
      }
    });
    return parseAgentJSON(r && r.content);
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

// 生成大纲：全新设计
async function generateOutline(gen, d, wrap) {
  const title = String(d.title || "").trim();
  if (!title) { toast("请先填写专题名称", true); return; }
  const task = "请为以下主题设计一份零基础学习大纲：\n主题：" + title + (d.tagline ? "\n用户补充说明：" + d.tagline : "") +
    "\n\n要求：适合对主题完全陌生的初学者，由浅入深，覆盖主题全貌，事实内容务必联网查证。";
  try {
    const json = await runBuilder(gen, task);
    const chs = mapChapters(json);
    if (chs.length < 3) { toast("生成的大纲章节过少，请重试", true); return; }
    if (json.title) d.title = String(json.title).trim();
    if (json.emoji) d.emoji = String(json.emoji).slice(0, 4);
    if (json.tagline) d.tagline = String(json.tagline).slice(0, 200);
    d.chapters = chs;
    toast("大纲生成完成，可自由编辑后保存");
    renderCustomEditor(wrap);
  } catch (e) {
    const prog = gen.querySelector(".gen-progress");
    prog.textContent += "\n❌ 生成失败：" + (e.message || e) + "\n请重试，或改用「手动录入」模式。";
  }
}

// 续写章节：基于现有大纲追加 3 章（可反复调用）
async function generateMore(gen, d, wrap) {
  const existing = d.chapters.map((ch, i) => (i + 1) + ". " + (ch.name || "未命名章") + "（节点：" + ch.nodes.map(n => n.name || "未命名").join("、") + "）").join("\n");
  const task = "请基于以下已有大纲继续设计后续 3 章。\n专题：" + d.title + "\n\n已有章节：\n" + existing +
    "\n\n要求：按学习顺序递进、与已有章节自然衔接、不重复已有内容、由浅入深、事实内容联网查证。\n输出 JSON：{\"chapters\":[...]}（只输出 chapters 数组，不要 title/emoji/tagline 字段）。";
  try {
    const json = await runBuilder(gen, task);
    const chs = mapChapters(json);
    if (!chs.length) { toast("未能生成新章节，请重试", true); return; }
    d.chapters = d.chapters.concat(chs);
    toast("已追加 " + chs.length + " 章，可继续编辑或保存");
    renderCustomEditor(wrap);
  } catch (e) {
    const prog = gen.querySelector(".gen-progress");
    prog.textContent += "\n❌ 续写失败：" + (e.message || e) + "\n请重试。";
  }
}

// 学科 pill（门类视图内复用）
function vCategory(main) {
  const cat = CATEGORIES.find(c => c.id === state.cat);
  if (!cat) { navigate("home"); return; }
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const domains = Object.entries(DOMAIN_META).filter(([, m]) => m.category === cat.id);
  // 按专业类分组（教育部专业类目录）
  const groups = {};
  domains.forEach(([id, m]) => { const g = m.group || "其他"; (groups[g] = groups[g] || []).push([id, m]); });
  const head = document.createElement("div"); head.className = "card";
  head.innerHTML = "<div style='display:flex;align-items:center;gap:10px;flex-wrap:wrap'>" +
    "<button class='btn ghost small' id='cat-back'>← 返回主页</button>" +
    "<h2 style='margin:0'>" + cat.emoji + " " + cat.label + "</h2>" +
    "<span class='muted' style='font-size:13px'>" + domains.length + " 门学科 · " + Object.keys(groups).length + " 个专业类</span></div>" +
    "<p class='muted' style='margin-top:8px'>" + cat.desc + "</p>";
  wrap.appendChild(head);
  main.appendChild(wrap);
  document.getElementById("cat-back").onclick = () => navigate("home");
  Object.entries(groups).forEach(([gname, list]) => {
    const listCard = document.createElement("div"); listCard.className = "card";
    const tracks = TRACKS[gname];
    if (tracks && tracks.length) {
      // 有学习路线：先展示路线图，学科列表折叠在下方
      listCard.innerHTML = "<h2>🗺️ " + htmlEscape(gname) + " · 学习路线 " +
        "<span class='muted' style='font-size:13px;font-weight:400'>选一条路线，按顺序学</span></h2>";
      tracks.forEach(t => listCard.appendChild(makeTrackCard(t)));
      const det = document.createElement("details"); det.className = "all-domains";
      const sum = document.createElement("summary");
      sum.textContent = "📚 查看全部 " + list.length + " 门学科";
      det.appendChild(sum);
      const inner = document.createElement("div");
      list.forEach(([id, m]) => inner.appendChild(makeDomainPill(id, m)));
      det.appendChild(inner);
      listCard.appendChild(det);
    } else {
      listCard.innerHTML = "<h2>📚 " + htmlEscape(gname) + " <span class='muted' style='font-size:13px;font-weight:400'>" + list.length + " 门</span></h2>";
      list.forEach(([id, m]) => listCard.appendChild(makeDomainPill(id, m)));
    }
    wrap.appendChild(listCard);
  });
}

// 从主页进入某学科：同步切换 domain 并落到学科总览
export { vCustom, vCategory, emptyDraft, makeTopicCard, renderCustomEditor, chapterCard, validateDraft, saveCustomTopic, mapChapters, runBuilder, generateOutline, generateMore };
