import { DOMAIN_META } from "../config.js";
import { state } from "../state.js";
import { masteryColor, masteryLabel, masteryOf, skipPrereq, htmlEscape } from "../utils.js";
import { navigate } from "../navigation.js";

export function vPath(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const card = document.createElement("div"); card.className = "card path-card";
  const domainLabel = DOMAIN_META[state.domain] ? DOMAIN_META[state.domain].label : state.domain;
  card.innerHTML = "<h2>🗺️ 知识图谱 — " + htmlEscape(domainLabel) + "</h2>"
    + "<p class='muted'>时间从左到右 · 点击节点进入学习 · 滚轮缩放 / 拖拽平移</p>";
  const head = document.createElement("div"); head.className = "path-head";
  const legend = document.createElement("div"); legend.className = "path-legend";
  legend.innerHTML = '<span><i style="background:var(--accent)"></i> 总览</span>'
    + '<span><i style="background:#ef4444"></i> 薄弱</span><span><i style="background:#f59e0b"></i> 学习中</span><span><i style="background:#6366f1"></i> 较扎实</span><span><i style="background:#22c55e"></i> 已掌握</span>'
    + '<span><i class="lg-dashed"></i> 未解锁</span>';
  head.appendChild(legend);
  card.appendChild(head);
  const tip = document.createElement("div"); tip.className = "intro-tip";
  tip.innerHTML = "<span>🧭 刚接触这个领域？先读 <b>领域导览</b>，了解整体脉络和各章关系，再回来逐章攻克。</span>";
  const tipBtn = document.createElement("button"); tipBtn.className = "btn small ghost"; tipBtn.textContent = "去读导览 →";
  tipBtn.onclick = () => navigate("intro");
  tip.appendChild(tipBtn);
  card.appendChild(tip);

  const toolbar = document.createElement("div"); toolbar.className = "path-toolbar";
  const btnFit = document.createElement("button"); btnFit.className = "mini-btn"; btnFit.textContent = "◎ 自适应";
  const btnReset = document.createElement("button"); btnReset.className = "mini-btn"; btnReset.textContent = "↺ 重置";
  const btnLR = document.createElement("button"); btnLR.className = "mini-btn"; btnLR.textContent = "⇄ 切换方向";
  toolbar.append(btnFit, btnReset, btnLR);
  card.appendChild(toolbar);

  const skills = state.skills.filter(s => s.domain === state.domain);
  const isOverview = (sk) => /总览|概述|概论|导论/.test(sk.name);
  function wrapLabel(name, maxPerLine) {
    const n = String(name || "");
    if (n.length <= maxPerLine) return n;
    const lines = [];
    for (let i = 0; i < n.length; i += maxPerLine) lines.push(n.slice(i, i + maxPerLine));
    return lines.join("\n");
  }
  // ECharts canvas 不支持 CSS 变量 var(--*) / color-mix，需取计算后的实色
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    const isDark = document.documentElement.getAttribute("data-mode") === "dark";
    return {
      accent: pick("--accent", isDark ? "#6366f1" : "#d9673e"),
      accent2: pick("--accent2", isDark ? "#818cf8" : "#bf4f28"),
      text: pick("--text", isDark ? "#edeff5" : "#1e1b18"),
      panel: pick("--panel", isDark ? "#0f121a" : "#f5f0e9"),
      border2: pick("--border2", isDark ? "rgba(255,255,255,.14)" : "rgba(27,18,10,.14)"),
      muted: pick("--muted", isDark ? "#8b93a7" : "#6b655c")
    };
  }
  function hexToRgba(hex, alpha) {
    hex = String(hex || "").trim();
    if (!hex) return "rgba(245,240,233," + alpha + ")";
    if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
    if (hex.startsWith("#")) {
      let h = hex.slice(1);
      if (h.length === 3) h = h.split("").map(c => c + c).join("");
      if (h.length >= 6) {
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
      }
    }
    return hex;
  }
  function buildNode(sk) {
    const tc = themeColors();
    const m = masteryOf(sk.id);
    const unlocked = skipPrereq() || sk.prereqs.every(p => masteryOf(p) >= 0.5);
    const overview = isOverview(sk);
    const kids = skills.filter(s => s.prereqs.includes(sk.id));
    const col = masteryColor(m);
    // 修复白字白底：总览用实色块+白字（带描边），详章用深色字+不透明白底+描边，确保在任何主题下都高对比
    const overviewBg = tc.accent;
    // 详章标签：固定深色字 + 近白底 + 细边框，避免 var(--text)/var(--panel) 在 canvas 中解析失败变白
    const detailLabelColor = "#1e1b18";
    const detailLabelBg = "rgba(255,255,255,0.96)";
    const detailLabelBorder = "rgba(27,18,10,0.10)";
    const node = {
      name: wrapLabel(sk.name, overview ? 4 : 7),
      rawName: sk.name,
      skill_id: sk.id,
      value: m,
      symbol: overview ? "roundRect" : "circle",
      symbolSize: overview ? [92, 26] : 13,
      itemStyle: {
        color: overview ? overviewBg : col,
        borderColor: unlocked ? (overview ? tc.accent2 : "#ffffff") : "#9aa0a6",
        borderWidth: unlocked ? (overview ? 1.5 : 1.2) : 2,
        borderType: unlocked ? "solid" : "dashed",
        shadowColor: overview ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.12)",
        shadowBlur: overview ? 10 : 6
      },
      lineStyle: { color: "rgba(150,150,150,.38)", width: 1.4, curveness: 0.28 },
      label: overview ? {
        position: "inside", color: "#fff", fontSize: 11.5, fontWeight: 700, lineHeight: 13,
        textBorderColor: "rgba(0,0,0,0.22)", textBorderWidth: 1
      } : {
        position: "right", distance: 9, color: detailLabelColor, fontSize: 11.5, lineHeight: 13,
        backgroundColor: detailLabelBg,
        borderColor: detailLabelBorder, borderWidth: 1,
        borderRadius: 6, padding: [3, 7, 3, 7],
        overflow: "truncate", width: 90, ellipsis: "…"
      },
      emphasis: { itemStyle: { shadowBlur: 14, shadowColor: "rgba(0,0,0,.22)" }, label: { fontWeight: 700 } }
    };
    if (kids.length) node.children = kids.map(buildNode);
    return node;
  }
  function buildRoot() {
    const roots = skills.filter(s => !s.prereqs.length);
    return { name: domainLabel, rawName: domainLabel, symbol: "circle", symbolSize: 0, label: { show: false }, children: roots.map(buildNode) };
  }
  let root = buildRoot();

  // 统计层数与每层最大节点数（用于自适应尺寸）
  const levelCounts = [];
  (function walk(node, depth) {
    levelCounts[depth] = (levelCounts[depth] || 0) + 1;
    (node.children || []).forEach(c => walk(c, depth + 1));
  })(root, 0);
  const depth = levelCounts.length;
  const maxPerLevel = Math.max.apply(null, levelCounts.slice(1));
  // LR 布局：高度按最大层宽，宽度按深度
  let orient = "LR";
  function computeSize(o) {
    if (o === "LR") {
      const h = Math.min(2400, Math.max(520, maxPerLevel * 42 + 180));
      const w = Math.min(5200, Math.max(900, depth * 168 + 260));
      return { h, w };
    } else {
      const h = Math.min(3200, Math.max(560, depth * 96 + 180));
      const w = Math.min(5200, Math.max(760, maxPerLevel * 96 + 200));
      return { h, w };
    }
  }
  const chartWrap = document.createElement("div"); chartWrap.className = "chart-wrap";
  const scroller = document.createElement("div"); scroller.className = "chart-scroll";
  const box = document.createElement("div"); box.className = "chart-box";
  const sz = computeSize(orient);
  box.style.height = sz.h + "px";
  box.style.minWidth = sz.w + "px";
  box.style.width = sz.w + "px";
  scroller.appendChild(box);
  chartWrap.appendChild(scroller);
  const hint = document.createElement("div"); hint.className = "chart-hint";
  hint.textContent = "拖拽平移 · 滚轮缩放 · 点击节点学习";
  chartWrap.appendChild(hint);
  card.appendChild(chartWrap);
  wrap.appendChild(card);
  main.appendChild(wrap);

  const chart = echarts.init(box);
  function makeOption(o) {
    const tc0 = themeColors();
    // tooltip 用实色（canvas 外的 HTML 也用实色，避免 var 在某些容器不生效）
    const tipBg = tc0.panel;
    const tipBd = tc0.border2;
    const tipTx = tc0.text;
    const tipMu = tc0.muted;
    return {
      tooltip: {
        trigger: "item", triggerOn: "mousemove", confine: true,
        backgroundColor: tipBg, borderColor: tipBd, borderWidth: 1,
        textStyle: { color: tipTx, fontSize: 12 },
        padding: 10,
        formatter: p => {
          const sk = skills.find(x => x.id === p.data.skill_id);
          if (!sk) return htmlEscape(p.data.rawName || p.name);
          const m = masteryOf(sk.id);
          const unlocked = skipPrereq() || sk.prereqs.every(pid => masteryOf(pid) >= 0.5);
          const acc = themeColors().accent;
          return "<b>" + htmlEscape(sk.name) + "</b> " + (isOverview(sk) ? "<span style='background:" + acc + ";color:#fff;padding:1px 6px;border-radius:999px;font-size:11px'>总览</span>" : "")
            + "<br/><span style='color:" + masteryColor(m) + "'>● " + masteryLabel(m) + " " + Math.round(m * 100) + "%</span>"
            + " · 难度 " + sk.difficulty.toFixed(2) + (unlocked ? "" : " · <span style='color:#999'>未解锁</span>")
            + "<br/><span style='color:" + tipMu + ";font-size:12px'>" + htmlEscape(sk.description.slice(0, 90)) + (sk.description.length > 90 ? "…" : "") + "</span>";
        }
      },
      series: [{
        type: "tree", data: [root],
        top: o === "LR" ? "6%" : "8%", left: o === "LR" ? "6%" : "4%", bottom: o === "LR" ? "6%" : "12%", right: o === "LR" ? "14%" : "4%",
        orient: o, roam: true, scaleLimit: { min: 0.45, max: 2.2 },
        initialTreeDepth: -1, expandAndCollapse: false,
        symbol: "circle", symbolSize: 10,
        edgeShape: "curve", edgeForkPosition: "50%",
        lineStyle: { width: 1.4, curveness: 0.28, color: "rgba(150,150,150,.38)" },
        label: { fontFamily: "system-ui, -apple-system, sans-serif", color: tc0.text, backgroundColor: hexToRgba(tc0.panel, 0.92), borderRadius: 6, padding: [2, 6, 2, 6] },
        leaves: { label: { fontFamily: "system-ui, -apple-system, sans-serif", color: tc0.text, backgroundColor: hexToRgba(tc0.panel, 0.92), borderRadius: 6, padding: [2, 6, 2, 6] } },
        animationDuration: 320, animationDurationUpdate: 320
      }],
      backgroundColor: "transparent"
    };
  }
  chart.setOption(makeOption(orient));
  chart.on("click", async p => { if (p.data && p.data.skill_id) { const m = await import("./learn.js"); m.openLearn(p.data.skill_id); } });
  let resizeTimer = null;
  const ro = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => chart.resize(), 80); });
  ro.observe(chartWrap);
  btnFit.onclick = () => { chart.dispatchAction({ type: "treeRoam", zoom: 1 }); chart.resize(); };
  btnReset.onclick = () => { chart.setOption(makeOption(orient), true); chart.resize(); };
  btnLR.onclick = () => {
    orient = orient === "LR" ? "TB" : "LR";
    btnLR.textContent = orient === "LR" ? "⇄ 切换方向" : "⇅ 切换方向";
    const ns = computeSize(orient);
    box.style.height = ns.h + "px"; box.style.minWidth = ns.w + "px"; box.style.width = ns.w + "px";
    chart.resize();
    chart.setOption(makeOption(orient), true);
  };
  // 深色/浅色切换时重绘：重建节点取新主题实色（canvas 不支持 var(--*)）
  const mo = new MutationObserver(() => {
    root = buildRoot();
    chart.setOption(makeOption(orient), true);
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
}

