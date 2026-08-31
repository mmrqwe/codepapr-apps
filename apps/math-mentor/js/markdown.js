import { parseAgentJSON } from "./utils.js";
/* ============ KaTeX 渲染（手写，无 auto-render 依赖） ============ */
function splitMath(text) {
  const out = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ math: false, text: text.slice(last, m.index) });
    out.push({ math: true, display: !!m[1], text: m[1] || m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ math: false, text: text.slice(last) });
  return out;
}
function sanitizeLatex(tex) {
  // 修复 LLM 生成 LaTeX 的常见笔误：\left / \right / \middle 后的花括号未转义
  let t = String(tex || "");
  t = t.replace(/\\left\{/g, "\\left\\{");
  t = t.replace(/\\left\}/g, "\\left\\}");
  t = t.replace(/\\right\{/g, "\\right\\{");
  t = t.replace(/\\right\}/g, "\\right\\}");
  t = t.replace(/\\middle\{/g, "\\middle\\{");
  t = t.replace(/\\middle\}/g, "\\middle\\}");
  return t;
}

function katexRender(root) {
  if (!window.katex) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue || "";
    if (!text.includes("$")) continue;
    const parent = node.parentNode;
    if (!parent || (parent.closest && parent.closest(".no-katex"))) continue;
    const parts = splitMath(text);
    if (!parts.some(p => p.math)) continue;
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      if (!p.math) { frag.appendChild(document.createTextNode(p.text)); continue; }
      try {
        const htmlStr = window.katex.renderToString(sanitizeLatex(p.text), { displayMode: p.display, throwOnError: false, strict: "ignore" });
        const el = document.createElement(p.display ? "div" : "span");
        el.className = p.display ? "katex-block" : "katex-inline";
        el.innerHTML = htmlStr;
        frag.appendChild(el);
      } catch (e) { frag.appendChild(document.createTextNode(p.text)); }
    }
    parent.replaceChild(frag, node);
  }
}
function renderMarkdown(el, md) {
  let source = String(md || "");
  // 先把 $$...$$ 公式块（含跨行）替换成占位符：marked 会把块内换行变成 <br>，
  // 导致后置 katexRender 无法匹配到完整的 $$...$$；还原时用 KaTeX 渲染成块级公式。
  const mathBlocks = [];
  source = source.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    const idx = mathBlocks.length;
    mathBlocks.push(String(tex).trim());
    return "§MATHBLOCK" + idx + "§";
  });
  if (window.marked) {
    el.innerHTML = window.marked.parse(source, { breaks: true, gfm: true });
  } else {
    el.textContent = source;
  }
  restoreMathBlocks(el, mathBlocks);
  katexRender(el);
  renderCharts(el);
}
function restoreMathBlocks(root, mathBlocks) {
  if (!mathBlocks.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue || "";
    if (!text.includes("§MATHBLOCK")) continue;
    const frag = document.createDocumentFragment();
    const re2 = /§MATHBLOCK(\d+)§/g;
    let last = 0, mm;
    while ((mm = re2.exec(text))) {
      if (mm.index > last) frag.appendChild(document.createTextNode(text.slice(last, mm.index)));
      const tex = mathBlocks[+mm[1]] || "";
      if (window.katex) {
        try {
          const htmlStr = window.katex.renderToString(sanitizeLatex(tex), { displayMode: true, throwOnError: false, strict: "ignore" });
          const elm = document.createElement("span");
          elm.className = "katex-block";
          elm.innerHTML = htmlStr;
          frag.appendChild(elm);
        } catch (e) { frag.appendChild(document.createTextNode(tex)); }
      } else {
        frag.appendChild(document.createTextNode(tex));
      }
      last = mm.index + mm[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

/* ============ 受控图表渲染（```chart 代码块 → ECharts） ============ */
function buildChartOption(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const t = cfg.type;
  const base = {
    title: cfg.title ? { text: cfg.title, left: "center", textStyle: { fontSize: 14 } } : null,
    tooltip: {}, backgroundColor: "transparent", animationDuration: 400
  };
  if (t === "bar" || t === "line") {
    return Object.assign({}, base, {
      grid: { left: 8, right: 16, top: cfg.title ? 44 : 16, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: cfg.x || [], axisLabel: { color: "#999" } },
      yAxis: { type: "value", axisLabel: { color: "#999" }, splitLine: { lineStyle: { color: "rgba(150,150,150,.15)" } } },
      series: (cfg.series || []).map(s => ({ type: t, name: s.name || "", data: s.data || [], smooth: t === "line" }))
    });
  }
  if (t === "pie") {
    return Object.assign({}, base, {
      legend: { bottom: 0, textStyle: { color: "#999" } },
      series: [{ type: "pie", radius: ["32%", "62%"], center: ["50%", "48%"],
        data: (cfg.data || []).map(d => ({ name: d.name, value: d.value })),
        label: { color: "#999" } }]
    });
  }
  if (t === "flow") {
    const nodes = (cfg.nodes || []).map(n => ({
      id: n.id, name: n.name || n.id, symbolSize: n.size || 38,
      itemStyle: { color: n.color || "#6366f1" }
    }));
    const links = (cfg.edges || []).map(e => ({
      source: e[0], target: e[1],
      label: e[2] ? { show: true, formatter: e[2], fontSize: 11, color: "#999" } : null,
      lineStyle: { curveness: 0.12 }
    }));
    return Object.assign({}, base, {
      series: [{
        type: "graph", layout: "force", data: nodes, links,
        roam: true, draggable: true,
        label: { show: true, position: "bottom", fontSize: 12 },
        force: { repulsion: 160, edgeLength: 100 },
        lineStyle: { color: "#999", width: 1.5 }
      }]
    });
  }
  if (t === "tree") {
    return Object.assign({}, base, {
      series: [{
        type: "tree", data: [cfg.root], top: "8%", left: "6%", bottom: "6%", right: "14%",
        orient: cfg.orient || "LR", symbolSize: 12,
        label: { position: "left", fontSize: 12 },
        leaves: { label: { position: "right", fontSize: 12 } },
        expandAndCollapse: true, initialTreeDepth: -1
      }]
    });
  }
  return null;
}
function renderCharts(root) {
  if (!window.echarts) return;
  root.querySelectorAll("pre code.language-chart").forEach(code => {
    try {
      const pre = code.parentNode;
      let cfg = null;
      try { cfg = parseAgentJSON(code.textContent.trim()); } catch (e) { return; }
      const opt = buildChartOption(cfg);
      if (!opt) return;
      const box = document.createElement("div");
      box.className = "chart-box lesson-chart";
      // 必须先插入 DOM 再 init：离屏容器 clientWidth/Height 为 0，
      // ECharts 会初始化出 0x0 画布，插入后也不会自动 resize（图表区域空白）。
      pre.parentNode.replaceChild(box, pre);
      const chart = echarts.init(box);
      chart.setOption(opt);
    } catch (e) { /* 单个图表失败不影响整页渲染 */ }
  });
}
export { splitMath, sanitizeLatex, katexRender, renderMarkdown, restoreMathBlocks, buildChartOption, renderCharts };
