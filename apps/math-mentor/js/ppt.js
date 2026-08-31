import { BASE } from "./env.js";
import { loadJS } from "./loader.js";
import { state } from "./state.js";
import { DOMAIN_META } from "./config.js";
import { toast, api, masteryOf, htmlEscape } from "./utils.js";
/* ============ PPT 导出（PptxGenJS，点击导出时懒加载） ============ */
let _pptxPromise = null;
function ensurePptx() {
  if (!_pptxPromise) {
    _pptxPromise = (async () => {
      // 先加载 FakeZip（替代 JSZip 3.10.1：后者在受限浏览器环境多文件打包会永久挂起）
      if (!window.__PPTGEN_FAKE_ZIP) await loadJS("/assets/fakezip.bundle.js");
      if (!window.PptxGenJS) await loadJS("/assets/pptxgen.bundle.js");
      if (!window.PptxGenJS) throw new Error("PPT 组件加载失败，请确认后端已启动且 assets 目录完整");
      return window.PptxGenJS;
    })();
  }
  return _pptxPromise;
}
const PPT_C = {
  bg: "F7F4EF", panel: "FFFFFF", dark: "1E1B33", accent: "6366F1",
  accent2: "818CF8", text: "1E1B18", muted: "6B7280", line: "C9C4BC",
  code: "EFEBE3", orange: "D9673E"
};
// 1x1 白色占位 PNG：公式图片的主 blip 保底（svgBlip 由 fakezip 注入）
const PPT_1PX_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let PPT_INJECTIONS = [];
function pptFooter(slide, text, pageNo) {
  slide.addShape("line", { x: 0.7, y: 5.18, w: 8.6, h: 0, line: { color: PPT_C.line, width: 0.75 } });
  slide.addText(text, { x: 0.7, y: 5.22, w: 7.4, h: 0.3, fontSize: 9, color: PPT_C.muted, align: "left" });
  slide.addText(String(pageNo || ""), { x: 8.2, y: 5.22, w: 1.1, h: 0.3, fontSize: 9, color: PPT_C.muted, align: "right" });
}
// 行内 LaTeX → Unicode 近似（PPT 文本框不支持内嵌公式图，用常见符号/上下标映射，识别不了的保留原文）
function texInlineToUnicode(tex) {
  let s = String(tex || "");
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\left\.?/g, "").replace(/\\right\.?/g, "");
  s = s.replace(/\\[,;:! ]/g, " ");
  const G = { alpha: "α", beta: "β", gamma: "γ", Gamma: "Γ", delta: "δ", Delta: "Δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", Theta: "Θ", iota: "ι", kappa: "κ", lambda: "λ", Lambda: "Λ", mu: "μ", nu: "ν", xi: "ξ", Xi: "Ξ", pi: "π", Pi: "Π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", Phi: "Φ", chi: "χ", psi: "ψ", Psi: "Ψ", omega: "ω", Omega: "Ω" };
  const S = { infty: "∞", times: "×", cdot: "·", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", sim: "~", propto: "∝", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", sum: "∑", prod: "∏", int: "∫", oint: "∮", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", nexists: "∄", nabla: "∇", partial: "∂", angle: "∠", perp: "⊥", parallel: "∥", cong: "≅", equiv: "≡", land: "∧", lor: "∨", lnot: "¬", neg: "¬", ldots: "…", cdots: "⋯", circ: "∘", bullet: "•", prime: "′", degree: "°", ell: "ℓ" };
  s = s.replace(/\\[a-zA-Z]+/g, (m) => { const k = m.slice(1); if (G[k]) return G[k]; if (S[k]) return S[k]; return m; });
  s = s.replace(/\\[{}]/g, (m) => (m === "\\{" ? "{" : "}"));
  s = s.replace(/\^\{([^{}]+)\}/g, (m, p) => supUnicode(p));
  s = s.replace(/_\{([^{}]+)\}/g, (m, p) => subUnicode(p));
  s = s.replace(/\^\w/g, (m) => supUnicode(m.slice(1)));
  s = s.replace(/_\w/g, (m) => subUnicode(m.slice(1)));
  s = s.replace(/~/g, " ");
  return s;
}
function supUnicode(x) {
  const M = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "i": "ⁱ", "T": "ᵀ", "(": "⁽", ")": "⁾", "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ", "f": "ᶠ", "g": "ᵍ", "h": "ʰ", "j": "ʲ", "k": "ᵏ", "l": "ˡ", "m": "ᵐ", "o": "ᵒ", "p": "ᵖ", "r": "ʳ", "s": "ˢ", "t": "ᵗ", "u": "ᵘ", "v": "ᵛ", "w": "ʷ", "x": "ˣ", "y": "ʸ", "z": "ᶻ" };
  let out = ""; for (const ch of String(x)) out += M[ch] || ch; return out;
}
function subUnicode(x) {
  const M = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ", "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ" };
  let out = ""; for (const ch of String(x)) out += M[ch] || ch; return out;
}
// markdown 行内解析：**粗体**、`代码`、$公式$（行内公式做 Unicode 近似，独立公式块渲染为图片）
function mdInlineRuns(text) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+\$)/g;
  let last = 0, m;
  const pushPlain = (s) => { if (s) runs.push({ text: s, options: {} }); };
  while ((m = re.exec(text)) !== null) {
    pushPlain(text.slice(last, m.index));
    const tok = m[0];
    if (tok.slice(0, 2) === "**") runs.push({ text: tok.slice(2, -2), options: { bold: true } });
    else if (tok[0] === "`") runs.push({ text: tok.slice(1, -1), options: { color: PPT_C.orange } });
    else runs.push({ text: texInlineToUnicode(tok.slice(1, -1)), options: { italic: true, color: PPT_C.accent } });
    last = m.index + tok.length;
  }
  pushPlain(text.slice(last));
  if (!runs.length) runs.push({ text: " ", options: {} });
  return runs;
}
/* ---- 公式渲染：MathJax tex-svg → canvas → PNG（懒加载本地 bundle，失败降级为文本） ---- */
let mathjaxReady = null;
function ensureMathJax() {
  if (mathjaxReady) return mathjaxReady;
  mathjaxReady = new Promise((resolve, reject) => {
    if (window.MathJax && window.MathJax.tex2svgPromise) return resolve(window.MathJax);
    const s = document.createElement("script");
    s.src = BASE + "/assets/mathjax-texsvg.js";
    s.onload = () => { if (window.MathJax && window.MathJax.tex2svgPromise) resolve(window.MathJax); else reject(new Error("MathJax 组件加载异常")); };
    s.onerror = () => reject(new Error("MathJax 组件加载失败"));
    document.head.appendChild(s);
  });
  return mathjaxReady;
}
const TEX_FONT_PX = 20; // 渲染字号：与 PPT 正文 14pt 观感接近
// 公式渲染：MathJax → SVG 字符串（矢量无损；由 fakezip 打包时注入 svgBlip，全程无需 Image/canvas，不受 CSP 限制）
async function texToSvg(tex) {
  const mj = await ensureMathJax();
  const node = await mj.tex2svgPromise(String(tex), { display: true });
  const svgEl = (node.querySelector && node.querySelector("svg")) || node; // tex2svgPromise 返回 <mjx-container>
  const vb = String(svgEl.getAttribute("viewBox") || "").trim().split(/\s+/);
  // viewBox 单位为 1/1000 ex；width/height 属性为 ex 单位
  const exW = vb.length === 4 ? parseFloat(vb[2]) / 1000 : (parseFloat(svgEl.getAttribute("width")) || 0);
  const exH = vb.length === 4 ? parseFloat(vb[3]) / 1000 : (parseFloat(svgEl.getAttribute("height")) || 0);
  if (!exW || !exH || exW <= 0 || exH <= 0) throw new Error("公式渲染尺寸异常");
  const pxPerEx = TEX_FONT_PX * 0.442;
  let svgStr = new XMLSerializer().serializeToString(svgEl);
  svgStr = svgStr.replace(/vertical-align:\s*-?[\d.]*ex/g, "vertical-align:0");
  if (!svgStr.includes("xmlns")) svgStr = svgStr.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  return { svg: svgStr, wIn: exW * pxPerEx / 96, hIn: exH * pxPerEx / 96 };
}
// markdown → 结构化块（标题/段落/列表/表格/代码/公式/图表占位）
function parseMdBlocks(md) {
  const lines = String(md || "").split("\n");
  const blocks = [];
  let tableRows = null, codeLines = null, codeChart = false, listItems = null;
  let mathLines = null; // 多行 $$...$$ 公式块收集
  const flush = () => {
    if (tableRows) { blocks.push({ type: "table", rows: tableRows }); tableRows = null; }
    if (listItems) { blocks.push({ type: "list", items: listItems }); listItems = null; }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (codeLines) {
      if (/^```/.test(line)) {
        blocks.push(codeChart ? { type: "note", text: "（本节含可视化图表，请到 App 内查看）" } : { type: "code", text: codeLines.join("\n") });
        codeLines = null; codeChart = false;
      } else { codeLines.push(raw); }
      continue;
    }
    // 多行公式块：$$ 开行 → 收集到下一个 $$ 开行
    if (mathLines) {
      if (/^\$\$$/.test(line)) {
        blocks.push({ type: "math", text: mathLines.join("\n").trim() });
        mathLines = null;
      } else { mathLines.push(raw); }
      continue;
    }
    if (/^\$\$$/.test(line)) { flush(); mathLines = []; continue; }
    if (!line) { flush(); continue; }
    if (/^```/.test(line)) { flush(); codeLines = []; codeChart = /^```\s*chart/i.test(line); continue; }
    if (line[0] === "|" && line[line.length - 1] === "|") {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) { flush(); if (!tableRows) tableRows = []; tableRows.push(cells); }
      continue;
    }
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) { flush(); blocks.push({ type: "h", level: hm[1].length, text: hm[2].trim() }); continue; }
    const lm = line.match(/^([-*])\s+(.*)$/);
    if (lm) { flush(); if (!listItems) listItems = []; listItems.push(lm[2].trim()); continue; }
    const ol = line.match(/^(\d+)[.)、]\s*(.*)$/);
    if (ol) { flush(); if (!listItems) listItems = []; listItems.push(ol[1] + ". " + ol[2].trim()); continue; }
    const q = line.match(/^>\s?(.*)$/);
    if (q) { flush(); blocks.push({ type: "quote", text: q[1].trim() }); continue; }
    const dm = line.match(/^\$\$(.+)\$\$$/);
    if (dm) { flush(); blocks.push({ type: "math", text: dm[1].trim() }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); continue; }
    const lastB = blocks[blocks.length - 1];
    if (lastB && lastB.type === "p") lastB.text += "\n" + raw.trim();
    else blocks.push({ type: "p", text: raw.trim() });
  }
  if (codeLines) blocks.push(codeChart ? { type: "note", text: "（本节含可视化图表，请到 App 内查看）" } : { type: "code", text: codeLines.join("\n") });
  if (mathLines) { const mt = mathLines.join("\n").trim(); if (mt) blocks.push({ type: "math", text: mt }); }
  flush();
  return blocks;
}
function estLines(text, fs) {
  const perLine = Math.max(10, Math.floor(45 * 14 / fs));
  let total = 0;
  for (const seg of String(text).split("\n")) total += Math.max(1, Math.ceil(seg.length / perLine));
  return total;
}
function splitLong(text, maxChars) {
  const out = [];
  let rest = String(text);
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    out.push(rest.slice(0, cut).replace(/\n+$/, ""));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) out.push(rest);
  return out;
}
// 把结构化块按高度预算排版到多页，每页页眉为节标题；返回最后一页页码
function renderBlocks(pptx, blocks, ctx, startPage) {
  const Y0 = 1.3, Y_MAX = 5.02;
  let page = startPage, slide = null, y = 0;
  const newSlide = () => {
    page++;
    slide = pptx.addSlide();
    slide.background = { color: PPT_C.bg };
    slide.addShape("rect", { x: 0, y: 0, w: 0.22, h: 5.625, fill: { color: PPT_C.accent } });
    slide.addText(ctx.title, { x: 0.62, y: 0.3, w: 8.7, h: 0.52, fontSize: 19, bold: true, color: PPT_C.text });
    if (ctx.sub) slide.addText(ctx.sub, { x: 0.62, y: 0.84, w: 8.7, h: 0.3, fontSize: 11, color: PPT_C.muted });
    y = Y0;
    ctx.imgSeq = 0;
    pptFooter(slide, ctx.footer, page);
  };
  const room = (need) => { if (y + need > Y_MAX && y > Y0 + 0.05) newSlide(); };
  newSlide();
  for (const b of blocks) {
    if (b.type === "h") {
      const fs = b.level <= 2 ? 17 : 15;
      const h = Math.min(estLines(b.text, fs), 4) * 0.42 + 0.1;
      if (b.level <= 2 && y > Y0 + 0.05) newSlide(); else room(h);
      slide.addText(mdInlineRuns(b.text), { x: 0.62, y, w: 8.7, h, fontSize: fs, bold: true, color: b.level <= 2 ? PPT_C.accent : PPT_C.text, valign: "top" });
      y += h + 0.1;
    } else if (b.type === "p" || b.type === "quote" || b.type === "note") {
      const fs = b.type === "quote" ? 13 : 14;
      const chunks = splitLong(b.text, 480);
      for (const ck of chunks) {
        const h = estLines(ck, fs) * 0.32 + 0.06;
        room(h);
        const opts = { x: 0.62, y, w: 8.7, h, fontSize: fs, valign: "top" };
        if (b.type === "quote" || b.type === "note") { opts.italic = true; opts.color = PPT_C.muted; }
        slide.addText(mdInlineRuns(ck), opts);
        y += h + 0.08;
      }
    } else if (b.type === "math") {
      if (b.png && b.png.svg) {
        const wIn = Math.min(b.png.wIn, 8.4);
        const hIn = Math.min(b.png.hIn, 2.4);
        room(hIn + 0.25);
        ctx.imgSeq = (ctx.imgSeq || 0) + 1;
        slide.addImage({ data: PPT_1PX_PNG, x: (10 - wIn) / 2, y: y + 0.06, w: wIn, h: hIn });
        PPT_INJECTIONS.push({ slideNo: page, seq: ctx.imgSeq, svgStr: b.png.svg, wIn: wIn, hIn: hIn });
        y += hIn + 0.28;
      } else {
        const fs = 14;
        for (const ck of splitLong(b.text, 480)) {
          const h = estLines(ck, fs) * 0.32 + 0.06;
          room(h);
          slide.addText(ck, { x: 0.62, y, w: 8.7, h, fontSize: fs, align: "center", italic: true, color: PPT_C.accent, valign: "top" });
          y += h + 0.08;
        }
      }
    } else if (b.type === "list") {
      const fs = 13;
      for (const item of b.items) {
        for (const ck of splitLong(item, 480)) {
          const h = estLines(ck, fs) * 0.3 + 0.04;
          room(h);
          const runs = mdInlineRuns(ck);
          runs[0].options.bullet = { code: "2022", indent: 12 };
          slide.addText(runs, { x: 0.62, y, w: 8.7, h, fontSize: fs, valign: "top", color: PPT_C.text });
          y += h + 0.04;
        }
      }
    } else if (b.type === "table") {
      const rows = b.rows;
      const showRows = Math.min(rows.length, 10);
      const h = showRows * 0.3 + 0.35;
      room(h);
      const data = rows.slice(0, showRows).map((r, ri) => r.map((c) => ({
        text: mdInlineRuns(c),
        options: { bold: ri === 0, fontSize: 10, color: ri === 0 ? PPT_C.accent : PPT_C.text, fill: { color: ri === 0 ? "E8E4FA" : "FFFFFF" }, valign: "middle" }
      })));
      slide.addTable(data, { x: 0.62, y, w: 8.7, colW: rows[0].map(() => 8.7 / rows[0].length), border: { pt: 0.5, color: PPT_C.line }, autoPage: false, margin: 0.05 });
      y += showRows * 0.3 + 0.2;
      if (rows.length > showRows) {
        room(0.3);
        slide.addText("（表格共 " + rows.length + " 行，PPT 仅展示前 " + showRows + " 行，完整内容见 App）", { x: 0.62, y, w: 8.7, h: 0.3, fontSize: 9, italic: true, color: PPT_C.muted });
        y += 0.3;
      }
    } else if (b.type === "code") {
      const fs = 10;
      const linesArr = b.text.split("\n");
      for (let i = 0; i < linesArr.length; i += 14) {
        const chunk = linesArr.slice(i, i + 14).join("\n");
        const h = Math.min(14, linesArr.length - i) * 0.22 + 0.14;
        room(h);
        slide.addShape("rect", { x: 0.62, y, w: 8.7, h, fill: { color: PPT_C.code }, line: { color: PPT_C.line, width: 0.5 } });
        slide.addText(chunk, { x: 0.75, y: y + 0.06, w: 8.45, h: h - 0.12, fontSize: fs, color: PPT_C.text, valign: "top" });
        y += h + 0.1;
      }
    }
  }
  return page;
}
// 讲解 PPT：封面 + 目录 + 每节（节封面 + 内容页）+ 尾页
async function exportLessonPPT(sk, scope) {
  const PptxGenJS = await ensurePptx();
  PPT_INJECTIONS = [];
  const secsAll = (state.sections || []).map((s, i) => ({ title: String((s && s.title) || ""), content: String((s && s.content) || ""), idx: i }));
  const withContent = secsAll.filter((s) => s.content);
  if (!withContent.length) { toast("暂无讲解内容可导出，请先生成讲解", true); return; }
  let list;
  if (scope === "current") {
    const cur = secsAll[state.sectionIdx];
    if (cur && cur.content) list = [cur];
    else { toast("当前节还没有内容，已改为导出全部已生成节"); list = withContent; }
  } else list = withContent;
  const domainLabel = (DOMAIN_META[state.domain] || {}).label || state.domain || "";
  // 预渲染公式：收集全部独立公式块（$$...$$）→ 高清 PNG 图片（失败自动降级为文本）
  const blocksCache = list.map((s) => parseMdBlocks(s.content));
  const texSeen = {}, texList = [];
  for (const blocks of blocksCache) for (const b of blocks) {
    if (b.type === "math" && b.text && !texSeen[b.text]) { texSeen[b.text] = 1; texList.push(b.text); }
  }
  if (texList.length) {
    toast("正在渲染 " + texList.length + " 个公式…");
    const results = await Promise.all(texList.map((t) => texToSvg(t).catch((e) => { try { console.warn("公式渲染失败:", t.slice(0, 40), e); } catch (x) {} return null; })));
    const okCount = results.filter(Boolean).length;
    if (okCount < texList.length) {
      toast("有 " + (texList.length - okCount) + " 个公式渲染失败，已用文本代替", true);
      try {
        fetch(BASE + "/api/diag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texFail: true, total: texList.length, ok: okCount, samples: texList.slice(0, 5) }) }).catch(() => {});
      } catch (e) {}
    }
    const pngByTex = {};
    texList.forEach((t, i) => { pngByTex[t] = results[i]; });
    for (const blocks of blocksCache) for (const b of blocks) {
      if (b.type === "math" && pngByTex[b.text]) b.png = pngByTex[b.text];
    }
  }
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "CodePapr 学习导师";
  pptx.title = sk.name + " 讲解";
  const m = masteryOf(sk.id);
  const s1 = pptx.addSlide();
  s1.background = { color: PPT_C.dark };
  s1.addText("📖", { x: 0, y: 0.7, w: 10, h: 0.9, fontSize: 44, align: "center" });
  s1.addText(domainLabel, { x: 0.8, y: 1.75, w: 8.4, h: 0.4, fontSize: 13, color: PPT_C.accent2, align: "center" });
  s1.addText(sk.name, { x: 0.7, y: 2.2, w: 8.6, h: 0.9, fontSize: 30, bold: true, color: "FFFFFF", align: "center" });
  s1.addText(String(sk.description || ""), { x: 1.2, y: 3.2, w: 7.6, h: 0.55, fontSize: 12, color: "C7CBD6", align: "center" });
  s1.addText("掌握度 " + Math.round(m * 100) + "% · 导出 " + list.length + " 节 · 由 CodePapr 学习导师导出", { x: 0.8, y: 3.9, w: 8.4, h: 0.4, fontSize: 11, color: PPT_C.accent2, align: "center" });
  let page = 1;
  if (list.length > 1) {
    page++;
    const s2 = pptx.addSlide();
    s2.background = { color: PPT_C.bg };
    s2.addText("目 录", { x: 0.7, y: 0.45, w: 8.6, h: 0.7, fontSize: 26, bold: true, color: PPT_C.accent });
    const items = list.map((s, i) => (i + 1) + ". " + (s.title || "第 " + (s.idx + 1) + " 节")).join("\n");
    s2.addText(items, { x: 1.1, y: 1.5, w: 7.8, h: 3.4, valign: "top", fontSize: 13, color: PPT_C.text, paraSpaceAfter: 8 });
    pptFooter(s2, sk.name + " · 目录", page);
  }
  for (let li = 0; li < list.length; li++) {
    const s = list[li];
    page++;
    const sc = pptx.addSlide();
    sc.background = { color: PPT_C.bg };
    sc.addShape("rect", { x: 0, y: 0, w: 10, h: 1.9, fill: { color: PPT_C.accent } });
    sc.addText("第 " + (s.idx + 1) + " 节 / 共 " + secsAll.length + " 节", { x: 0.7, y: 0.35, w: 8.6, h: 0.4, fontSize: 13, color: "E4E7FF" });
    sc.addText(s.title || "第 " + (s.idx + 1) + " 节", { x: 0.7, y: 0.8, w: 8.6, h: 0.9, fontSize: 26, bold: true, color: "FFFFFF" });
    sc.addText(sk.name, { x: 0.7, y: 2.6, w: 8.6, h: 0.4, fontSize: 12, color: PPT_C.muted });
    sc.addText("本节约 " + s.content.length + " 字", { x: 0.7, y: 3.0, w: 8.6, h: 0.4, fontSize: 11, color: PPT_C.muted });
    pptFooter(sc, sk.name + " · 第 " + (s.idx + 1) + " 节", page);
    page = renderBlocks(pptx, blocksCache[li], {
      title: s.title || "第 " + (s.idx + 1) + " 节",
      sub: sk.name + " · 第 " + (s.idx + 1) + " 节 / 共 " + secsAll.length + " 节",
      footer: sk.name + " · " + (s.title || "第 " + (s.idx + 1) + " 节")
    }, page);
  }
  page++;
  const se = pptx.addSlide();
  se.background = { color: PPT_C.dark };
  se.addText("🎓", { x: 0, y: 1.1, w: 10, h: 1, fontSize: 44, align: "center" });
  se.addText("本课讲解已导出完成", { x: 0.8, y: 2.3, w: 8.4, h: 0.7, fontSize: 24, bold: true, color: "FFFFFF", align: "center" });
  se.addText("建议结合 App 内的练习与错题本巩固掌握", { x: 0.8, y: 3.2, w: 8.4, h: 0.5, fontSize: 13, color: "C7CBD6", align: "center" });
  pptFooter(se, "由 CodePapr 学习导师导出", page);
  await deliverPptx(pptx, safePptName(sk.name + "-讲解"));
}
// 大纲 PPT：封面 + 目录 + 每章（节点清单）+ 尾页
async function exportOutlinePPT(t) {
  const PptxGenJS = await ensurePptx();
  PPT_INJECTIONS = [];
  const chs = Array.isArray(t.outline) ? t.outline : [];
  const nodeCount = chs.reduce((a, c) => a + ((c.nodes || []).length), 0);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "CodePapr 学习导师";
  pptx.title = (t.title || "学习专题") + " 大纲";
  const s1 = pptx.addSlide();
  s1.background = { color: PPT_C.dark };
  s1.addText(t.emoji || "🎨", { x: 0, y: 0.85, w: 10, h: 1, fontSize: 50, align: "center" });
  s1.addText(t.title || "学习专题", { x: 0.8, y: 2.1, w: 8.4, h: 0.9, fontSize: 32, bold: true, color: "FFFFFF", align: "center" });
  s1.addText(String(t.tagline || ""), { x: 1.2, y: 3.05, w: 7.6, h: 0.5, fontSize: 13, color: "C7CBD6", align: "center" });
  s1.addText("共 " + chs.length + " 章 · " + nodeCount + " 个知识点 · 学习路线大纲", { x: 0.8, y: 3.7, w: 8.4, h: 0.4, fontSize: 12, color: PPT_C.accent2, align: "center" });
  s1.addText("由 CodePapr 学习导师导出", { x: 0.8, y: 4.55, w: 8.4, h: 0.35, fontSize: 10, color: PPT_C.muted, align: "center" });
  let page = 1;
  if (chs.length) {
    page++;
    const s2 = pptx.addSlide();
    s2.background = { color: PPT_C.bg };
    s2.addText("目 录", { x: 0.7, y: 0.45, w: 8.6, h: 0.7, fontSize: 26, bold: true, color: PPT_C.accent });
    const items = chs.map((c, i) => "第 " + (i + 1) + " 章　" + (c.name || "未命名")).join("\n");
    s2.addText(items, { x: 1.1, y: 1.5, w: 7.8, h: 3.4, valign: "top", fontSize: 13, color: PPT_C.text, paraSpaceAfter: 8 });
    pptFooter(s2, (t.title || "专题") + " · 目录", page);
  }
  chs.forEach((ch, ci) => {
    const nodes = ch.nodes || [];
    const pages = Math.max(1, Math.ceil(nodes.length / 8));
    for (let pi = 0; pi < pages; pi++) {
      page++;
      const s = pptx.addSlide();
      s.background = { color: PPT_C.bg };
      s.addText("第 " + (ci + 1) + " 章" + (pages > 1 ? "（" + (pi + 1) + "/" + pages + "）" : ""), { x: 0.7, y: 0.32, w: 4, h: 0.38, fontSize: 13, bold: true, color: PPT_C.accent });
      s.addText(ch.name || "未命名章节", { x: 0.7, y: 0.72, w: 8.6, h: 0.66, fontSize: 23, bold: true, color: PPT_C.text });
      s.addText("难度 " + (ch.difficulty != null ? Number(ch.difficulty).toFixed(1) : "-") + " ｜ 本章 " + nodes.length + " 个知识点", { x: 0.7, y: 1.42, w: 8.6, h: 0.35, fontSize: 11, color: PPT_C.muted });
      const slice = nodes.slice(pi * 8, pi * 8 + 8);
      if (slice.length) {
        const items = slice.map((nd, ni) => (pi * 8 + ni + 1) + ". " + (nd.name || "未命名") + (nd.desc ? " —— " + nd.desc : "")).join("\n");
        s.addText(items, { x: 0.9, y: 1.95, w: 8.2, h: 3.0, valign: "top", fontSize: 13, color: PPT_C.text, paraSpaceAfter: 9 });
      } else {
        s.addText("（本章暂无节点）", { x: 0.9, y: 1.95, w: 8.2, h: 0.4, fontSize: 12, italic: true, color: PPT_C.muted });
      }
      pptFooter(s, (t.title || "专题") + " · 大纲", page);
    }
  });
  page++;
  const se = pptx.addSlide();
  se.background = { color: PPT_C.dark };
  se.addText("🚀", { x: 0, y: 1.1, w: 10, h: 1, fontSize: 44, align: "center" });
  se.addText("开始学习之旅", { x: 0.8, y: 2.3, w: 8.4, h: 0.7, fontSize: 24, bold: true, color: "FFFFFF", align: "center" });
  se.addText("回到 App 中逐章学习，AI 导师会按顺序带你掌握每个知识点", { x: 0.8, y: 3.2, w: 8.4, h: 0.5, fontSize: 13, color: "C7CBD6", align: "center" });
  pptFooter(se, "由 CodePapr 学习导师导出", page);
  await deliverPptx(pptx, safePptName((t.title || "专题") + "-大纲"));
}
function safePptName(name) {
  const s = String(name || "export").replace(/[\\/:*?"<>|\n\r\t]/g, "").replace(/\s+/g, " ").slice(0, 50);
  return (s || "export") + ".pptx";
}
// 生成结果交付：先尝试浏览器直接下载（沙箱可能拦截），再上传后端做兜底下载入口
async function deliverPptx(pptx, filename) {
  try { window.__PPT_INJECTIONS = PPT_INJECTIONS || []; } catch (e) {}
  let blob;
  try { blob = await pptx.write({ outputType: "blob" }); }
  catch (e) { blob = await pptx.write("blob"); }
  if (!blob || !blob.size) throw new Error("PPT 生成结果为空");
  try {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(u); } catch (e) {} }, 60000);
  } catch (e) {}
  let backendUrl = null, projectPath = null, appDataPath = null;
  try {
    const r = await fetch(BASE + "/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Export-Name": btoa(unescape(encodeURIComponent(filename))) },
      body: blob
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.url) backendUrl = BASE + j.url;
      if (j && j.projectPath) projectPath = j.projectPath;
      if (j && j.appDataPath) appDataPath = j.appDataPath;
    }
  } catch (e) { backendUrl = null; }
  // 后端沙箱不能直写项目目录时，通过 deliver agent 的 bash 把文件复制到项目根 exports/
  if (!projectPath && appDataPath) projectPath = await deliverToProject(appDataPath);
  showExportResult(filename, blob.size, backendUrl, projectPath, appDataPath);
}
/* 通过 deliver agent（bash 工具）把导出文件从应用数据目录复制到项目根 exports/ 目录 */
async function deliverToProject(appDataPath) {
  if (!window.papr || !window.papr.agent || !window.papr.agent.run) return null;
  try {
    const fname = appDataPath.split("/").pop();
    const rel = "exports/" + fname;
    const r = await papr.agent.run({
      agent: "deliver",
      task: "执行这条 bash 命令，把导出文件复制到项目 exports 目录（只执行这一条命令，不要做任何其他事）：\n" +
        "mkdir -p exports && cp -f '" + appDataPath + "' '" + rel + "'\n" +
        "复制成功只回复 OK，失败回复错误原因。"
    });
    const ok = /\bOK\b/i.test(String(r && r.content || ""));
    if (ok) {
      toast("已保存到项目 exports/ 目录");
      const root = appDataPath.split("/.CodePapr/")[0];
      return (root || "") + "/" + rel;
    }
    toast("项目导出失败：" + String(r && r.content || "agent 无响应").replace(/\s+/g, " ").slice(0, 120), true);
    return null;
  } catch (e) {
    toast("项目导出失败：" + (e.message || e), true);
    return null;
  }
}
function showExportResult(filename, size, backendUrl, projectPath, appDataPath) {
  const root = document.getElementById("modal-root");
  const kb = Math.max(1, Math.round((size || 0) / 1024));
  const btns = [];
  let tip;
  if (projectPath) {
    tip = "<p>✅ 文件已保存到项目文件夹，在 CodePapr 文件树中直接打开即可（也可复制到桌面/发送给别人）：</p>" +
      "<div id='ppt-path' style='font-size:12px;background:var(--bg2);border:1px solid var(--border);padding:8px 10px;border-radius:8px;word-break:break-all;margin:8px 0;user-select:all'>" + htmlEscape(projectPath) + "</div>" +
      "<p class='muted'>下方浏览器下载方式作为备选（服务器暂存 24 小时）。</p>";
    btns.push('<button class="btn small" id="ppt-copy-path">📂 复制项目路径</button>');
  } else {
    tip = "<p>✅ 文件已保存在应用数据目录，在 CodePapr 文件树中找到该路径即可直接打开：</p>" +
      "<div id='ppt-path' style='font-size:12px;background:var(--bg2);border:1px solid var(--border);padding:8px 10px;border-radius:8px;word-break:break-all;margin:8px 0;user-select:all'>" + htmlEscape(appDataPath || filename) + "</div>" +
      "<p class='muted'>项目导出暂不可用，也可用下方浏览器方式下载（服务器暂存 24 小时）。</p>";
    btns.push('<button class="btn small" id="ppt-copy-path">📂 复制文件路径</button>');
  }
  if (backendUrl) {
    btns.push('<button class="btn small" id="ppt-sys">🌐 系统浏览器下载</button>');
    btns.push('<button class="btn ghost small" id="ppt-dl">⬇️ 浏览器直接下载</button>');
    btns.push('<button class="btn ghost small" id="ppt-copy">🔗 复制下载链接</button>');
  }
  btns.push('<button class="btn ghost small" id="ppt-close">关闭</button>');
  root.innerHTML = '<div class="modal-mask"><div class="modal">' +
    "<h2 style='font-size:16px;margin-bottom:6px'>📊 PPT 已生成</h2>" +
    "<p><b>" + htmlEscape(filename) + "</b>（" + kb + " KB）</p>" + tip +
    "<div style='display:flex;gap:10px;margin-top:14px;justify-content:flex-end;flex-wrap:wrap'>" + btns.join("") + "</div></div></div>";
  document.getElementById("ppt-close").onclick = () => { root.innerHTML = ""; };
  const cpp = document.getElementById("ppt-copy-path");
  if (cpp) cpp.onclick = () => { copyText(projectPath || appDataPath, "路径已复制，在系统文件管理器（访达）中粘贴即可定位文件"); };
  const dl = document.getElementById("ppt-dl");
  if (dl) dl.onclick = () => {
    downloadViaFrame(backendUrl);
    toast("已发起下载；若没有反应，请改用「系统浏览器下载」");
  };
  const sys = document.getElementById("ppt-sys");
  if (sys) sys.onclick = () => { openInSystemBrowser(backendUrl); };
  const cp = document.getElementById("ppt-copy");
  if (cp) cp.onclick = () => { copyExportLink(backendUrl); };
}
/* 通用复制文本：clipboard API 失败则降级 execCommand */
function copyText(text, okMsg) {
  const done = (ok) => { toast(ok ? okMsg : "复制失败，请手动复制路径文本", !ok); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(legacyCopy(text)));
  } else { done(legacyCopy(text)); }
}
function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}
/* 后端调系统默认浏览器打开下载链接（绕过沙箱下载限制）；依赖后端 child_process */
async function openInSystemBrowser(url) {
  try {
    const r = await fetch(BASE + "/api/export-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.opened) toast("已在系统浏览器中打开，请留意浏览器窗口的下载");
    else toast("系统浏览器打开失败：" + (j.error || r.status) + "，请用「复制链接」", true);
  } catch (e) {
    toast("系统浏览器打开失败：" + (e.message || e) + "，请用「复制链接」", true);
  }
}
/* 隐藏 iframe 导航下载：不创建新窗口/标签页，不受浏览器弹窗拦截器限制 */
function downloadViaFrame(url) {
  try {
    const f = document.createElement("iframe");
    f.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;border:0;visibility:hidden;";
    f.setAttribute("aria-hidden", "true");
    f.src = url;
    document.body.appendChild(f);
    setTimeout(() => { try { document.body.removeChild(f); } catch (e) {} }, 5 * 60000);
  } catch (e) { toast("下载发起失败：" + (e.message || e), true); }
}
/* 复制下载链接：clipboard API 失败则降级为可手动复制的输入框 */
function copyExportLink(url) {
  const done = (ok) => { toast(ok ? "链接已复制，粘贴到浏览器地址栏即可下载" : "复制失败，请手动复制输入框中的链接", !ok); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => done(true)).catch(() => showManualCopy(url));
  } else { showManualCopy(url); }
}
function showManualCopy(url) {
  const root = document.getElementById("modal-root");
  root.innerHTML = '<div class="modal-mask"><div class="modal">' +
    "<h2 style='font-size:16px;margin-bottom:6px'>🔗 下载链接</h2>" +
    "<p class='muted'>在系统浏览器（Chrome / Safari 等）中粘贴此地址即可下载 PPT：</p>" +
    "<div style='display:flex;gap:8px;margin-top:10px'>" +
    "<input id='ppt-url' readonly value='" + htmlEscape(url) + "' style='flex:1;font-size:12px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text)' onfocus='this.select()'>" +
    "</div>" +
    "<div style='display:flex;gap:10px;margin-top:14px;justify-content:flex-end'><button class='btn ghost small' id='ppt-close'>关闭</button></div></div></div>";
  const u = document.getElementById("ppt-url");
  if (u) { u.focus(); try { u.select(); } catch (e) {} }
  document.getElementById("ppt-close").onclick = () => { root.innerHTML = ""; };
}
function openExportMenu(sk, btn) {
  const root = document.getElementById("modal-root");
  const secs = (state.sections || []).filter((s) => s && s.content);
  const cur = state.sections[state.sectionIdx];
  const hasCur = !!cur && !!cur.content;
  root.innerHTML = '<div class="modal-mask"><div class="modal">' +
    "<h2 style='font-size:16px;margin-bottom:6px'>📊 导出讲解 PPT</h2>" +
    "<p class='muted'>已生成 " + secs.length + " 节内容。选择导出范围：</p>" +
    "<div style='display:flex;gap:10px;margin-top:14px;flex-wrap:wrap'>" +
    '<button class="btn small" id="ppt-all">全部 ' + secs.length + ' 节</button>' +
    (hasCur ? '<button class="btn small" id="ppt-cur">仅当前节</button>' : "") +
    '<button class="btn ghost small" id="ppt-cancel">取消</button></div></div></div>';
  document.getElementById("ppt-cancel").onclick = () => { root.innerHTML = ""; };
  document.getElementById("ppt-all").onclick = () => { root.innerHTML = ""; doExportLesson(sk, "all", btn); };
  const curBtn = document.getElementById("ppt-cur");
  if (curBtn) curBtn.onclick = () => { root.innerHTML = ""; doExportLesson(sk, "current", btn); };
}
async function doExportLesson(sk, scope, btn) {
  const oldText = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ 生成中…";
  try { await exportLessonPPT(sk, scope); }
  catch (e) { toast("导出失败：" + (e.message || e), true); }
  finally { btn.disabled = false; btn.textContent = oldText; }
}

export { ensurePptx, pptFooter, texInlineToUnicode, supUnicode, subUnicode, mdInlineRuns, ensureMathJax, texToSvg, parseMdBlocks, estLines, splitLong, renderBlocks, exportLessonPPT, exportOutlinePPT, safePptName, deliverPptx, deliverToProject, showExportResult, copyText, legacyCopy, openInSystemBrowser, downloadViaFrame, copyExportLink, showManualCopy, openExportMenu, doExportLesson };
