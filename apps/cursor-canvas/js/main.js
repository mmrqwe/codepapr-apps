/* 看板 · 极简版 — 主界面 + 历史抽屉
   - 默认空白，不自动塞演示数据
   - 推送：app_publish({ appId:"cursor-canvas", channel:"board", payload:{op,title,blocks} })
   - 数据存 papr.db (sqlite)：board:history / board:clearedAt
   - 历史抽屉：查看/删除/清空/下载(html)
*/
const React = window.React;
const ReactDOM = window.ReactDOM;
const htm = window.htm;
if(!React || !ReactDOM || !htm){
  const rootEl = document.getElementById("root");
  const msg = `React=${!!React} ReactDOM=${!!ReactDOM} htm=${!!htm} papr=${!!window.papr}`;
  if(rootEl) rootEl.innerHTML = `<div style="max-width:560px;margin:32px auto;padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--fg);font-family:system-ui"><h3 style="margin:0 0 8px;color:var(--fg)">依赖加载失败</h3><p style="margin:0;color:var(--muted);font-size:13px;line-height:1.6">${msg}<br/>请刷新页面，若仍失败请检查 js/vendor/ 是否完整。</p></div>`;
  throw new Error("vendor missing: "+msg);
}
// 兜底：历史数据若带 style 字符串会导致 React 报错 “style prop expects mapping”
const _origCreateElement = React.createElement;
React.createElement = function(type, props, ...children){
  if(props && typeof props.style === 'string'){
    console.warn('[board] style string auto-fix', type, String(props.style).slice(0,120));
    const p = {...props};
    try{
      const obj={};
      String(props.style).split(';').forEach(kv=>{
        const idx=kv.indexOf(':');
        if(idx>0){
          const k=kv.slice(0,idx).trim();
          const v=kv.slice(idx+1).trim();
          if(k&&v){
            const ck=k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
            obj[ck]=v;
          }
        }
      });
      p.style = Object.keys(obj).length? obj : undefined;
    }catch{ p.style=undefined; }
    return _origCreateElement.call(this, type, p, ...children);
  }
  return _origCreateElement.call(this, type, props, ...children);
};
const html = htm.bind(React.createElement);
window.__reactMounted = false;

// plain 兜底：React 挂掉时用原生 DOM 展示历史
window.__plainRender = async function(){
  try{
    const rootEl=document.getElementById("root");
    if(!rootEl) return;
    let h=null;
    try{ if(window.papr?.db) h=await papr.db.get("board:history"); }catch{}
    const list = Array.isArray(h) ? h.filter(x=>x&&x.op!=="clear") : [];
    if(!list.length){
      rootEl.innerHTML = `<div style="max-width:560px;margin:32px auto;padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--fg);font-family:system-ui"><h3 style="margin:0 0 6px;color:var(--fg)">暂无看板（plain 模式）</h3><p style="margin:0;color:var(--muted);font-size:13px">sqlite 历史为空，等待推送。已捕获错误：${(window.__bootErrors||[]).join("; ").slice(0,300)}</p></div>`;
      return;
    }
    const last=list[list.length-1];
    const blocksHtml = (last.blocks||[]).map(b=>{
      if(b.type==="table"){
        const th=(b.columns||[]).map(c=>`<th style="padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:11px;color:var(--muted);background:var(--bg-2)">${String(c).replace(/</g,"&lt;")}</th>`).join("");
        const tr=(b.rows||[]).map(r=>`<tr>${(Array.isArray(r)?r:[]).map(v=>`<td style="padding:6px 8px;border-bottom:1px solid var(--line-2);font-size:12px;color:var(--fg)">${String(v).replace(/</g,"&lt;")}</td>`).join("")}</tr>`).join("");
        return `<div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:10px 0;background:var(--panel)"><div style="padding:8px 10px;font-weight:700;border-bottom:1px solid var(--line-2);color:var(--fg)">${b.title||"表格"}</div><table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
      }
      if(b.type==="stats"){
        const items=(b.items||[]).map(it=>`<div style="border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--panel)"><div style="font-size:10px;color:var(--muted)">${it.label}</div><div style="font-size:18px;font-weight:800;color:var(--fg)">${it.value}</div></div>`).join("");
        return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">${items}</div>`;
      }
      if(b.type==="callout"){
        return `<div style="padding:10px;border:1px solid var(--line);background:var(--bg-2);border-radius:10px;margin:10px 0;font-size:13px;color:var(--fg)">${(b.content||b.text||"").replace(/</g,"&lt;")}</div>`;
      }
      return `<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:10px 0;background:var(--panel)"><div style="font-weight:700;color:var(--fg)">${b.title||b.type}</div><div style="font-size:12px;color:var(--muted);white-space:pre-wrap">${(b.content||b.text||"").slice(0,400).replace(/</g,"&lt;")}</div></div>`;
    }).join("");
    rootEl.innerHTML = `<div style="max-width:860px;margin:0 auto;padding:16px;font-family:system-ui;color:var(--fg)"><h2 style="margin:0;color:var(--fg)">${(last.title||"看板").replace(/</g,"&lt;")}</h2><p style="color:var(--muted)">${(last.subtitle||"").replace(/</g,"&lt;")}</p><div style="margin-top:6px;font-size:11px;color:var(--muted-2)">${list.length} 条历史 · plain 兜底渲染</div>${blocksHtml}</div>`;
  }catch(e){
    const el=document.getElementById("err");
    if(el){ el.textContent="plain 渲染失败: "+e.message; el.className="show"; }
  }
};

class ErrorBoundary extends React.Component{
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err, info){ console.error("[board] ErrorBoundary", err, info); window.__bootErrors.push(String(err?.message||err)); }
  render(){
    if(this.state.err){
      return html`<div style=${{maxWidth:"560px",margin:"32px auto",padding:"20px",border:"1px solid var(--line)",borderRadius:"14px",background:"var(--panel)",color:"var(--fg)"}}>
        <h3 style=${{margin:"0 0 8px",color:"var(--fg)"}}>渲染异常</h3>
        <p style=${{margin:"0",color:"var(--muted)",fontSize:"13px",lineHeight:"1.6",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>${String(this.state.err?.message||this.state.err).slice(0,800)}</p>
        <div style=${{marginTop:"12px",display:"flex",gap:"8px"}}>
          <button class="btn primary" onClick=${()=> location.reload()}>刷新</button>
          <button class="btn" onClick=${()=> window.__plainRender && window.__plainRender()}>plain 查看</button>
        </div>
      </div>`;
    }
    return this.props.children;
  }
}

// ---------- utils ----------
const uid = () => Math.random().toString(36).slice(2,7);
const fmt = (n) => {
  if (typeof n === "string" && isNaN(Number(n))) return n;
  const v = Number(n);
  if (Number.isNaN(v)) return String(n);
  return new Intl.NumberFormat("zh-CN").format(v);
};
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));
const esc = (s)=> String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// 主题响应：跟随 html[data-mode] / prefers-color-scheme / 宿主同步
function useTheme(){
  const get = ()=> {
    const m=document.documentElement.getAttribute('data-mode') || document.documentElement.getAttribute('data-theme');
    if(m==='dark'||m==='light') return m;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  const [mode, setMode] = React.useState(get);
  React.useEffect(()=>{
    const update = ()=> setMode(get());
    const obs = new MutationObserver(update);
    try{ obs.observe(document.documentElement, {attributes:true, attributeFilter:['data-mode','data-theme','class']}); }catch{}
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = ()=> update();
    try{ mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq); }catch{}
    const onMsg = (e)=>{
      const d=e.data;
      if(!d) return;
      const m=d.mode||d.theme||d['data-mode']|| (d.type==='theme'&&d.value);
      if(m==='dark'||m==='light') setMode(m);
      if(typeof d==='string' && (d==='dark'||d==='light')) setMode(d);
    };
    window.addEventListener('message', onMsg);
    const onCustomTheme = (e)=>{
      const m = e?.detail?.mode;
      if(m==='dark'||m==='light') setMode(m);
    };
    window.addEventListener('papr-theme-change', onCustomTheme);
    // 兜底：若宿主通过 parent.document 改主题但跨域无法观察，则轮询
    const iv=setInterval(update, 1500);
    // 暴露给 index.html 的全局同步
    window.__themeUpdate = update;
    return ()=>{
      try{ obs.disconnect(); }catch{}
      try{ mq.removeEventListener ? mq.removeEventListener('change', onMq) : mq.removeListener(onMq); }catch{}
      window.removeEventListener('message', onMsg);
      window.removeEventListener('papr-theme-change', onCustomTheme);
      clearInterval(iv);
    };
  },[]);
  return mode;
}

// ---------- normalize ----------
function parseDiff(diffStr){
  const lines=[];
  diffStr.split("\n").forEach(l=>{
    if(l.startsWith("+++")||l.startsWith("---")||l.startsWith("@@")) return;
    if(l.startsWith("+")) lines.push({op:"add", code:l.slice(1)});
    else if(l.startsWith("-")) lines.push({op:"del", code:l.slice(1)});
    else lines.push({op:"ctx", code:l.replace(/^ /,"")});
  });
  return lines;
}
function normalizeBlocks(rawBlocks){
  if(!Array.isArray(rawBlocks)) return [];
  return rawBlocks.map(b=>{
    const t = (b.type||"text").toLowerCase();
    if(typeof b.style === 'string'){ console.warn("[board] drop block.style string", b.style.slice(0,80)); delete b.style; }
    const base = { id: b.id || `b_${uid()}`, type: t, title: b.title||b.heading||"", caption: b.caption||b.desc||"", raw:b };
    if(t==="stats") base.items = (b.items||[]).map(it=>({
      label: it.label||it.name||"", value: it.value ?? it.val ?? "",
      delta: it.delta||it.change||"", trend: it.trend|| (String(it.delta||"").startsWith("+")?"up": String(it.delta||"").startsWith("-")?"down":""),
      caption: it.caption||it.sub||"", spark: it.spark||it.trendData||null
    }));
    if(t==="table"){
      base.columns = b.columns||b.header||b.cols||[];
      if(b.rows) base.rows = b.rows;
      else if(b.data) {
        const cols = base.columns.length? base.columns : Object.keys(b.data[0]||{});
        base.columns = cols;
        base.rows = b.data.map(r=> cols.map(c=> r[c] ?? ""));
      } else base.rows=[];
    }
    if(t==="chart"){
      base.chartType = (b.chartType||b.type2||b.variant||"bar").toLowerCase();
      base.data = b.data||b.values||b.points||[];
      base.unit = b.unit||"";
      base.xKey = b.xKey||"name";
      base.yKey = b.yKey||"value";
    }
    if(t==="diagram"){
      base.nodes = (b.nodes||[]).map((n,i)=>({
        id: n.id||`n${i}`, label: n.label||n.title||n.name||n.id,
        sub: n.sub||n.detail||n.desc||n.type||"",
        kind: (n.kind||n.type||"default").toLowerCase(),
        color: n.color||"",
        x: typeof n.x==="number"? n.x : null,
        y: typeof n.y==="number"? n.y : null
      }));
      base.edges = (b.edges||[]).map(e=>({
        from: e.from||e.source||e.a, to: e.to||e.target||e.b,
        label: e.label||"", dashed: !!e.dashed
      })).filter(e=>e.from&&e.to);
    }
    if(t==="diff"){
      base.file = b.file||b.path||"";
      if(b.diff) base.lines = parseDiff(b.diff);
      else if(b.lines) base.lines = b.lines.map(l=>({
        op: l.op|| (l.type==="add"?"add": l.type==="del"?"del":"ctx"),
        code: l.code||l.text||"",
      }));
      else base.lines=[];
    }
    if(t==="todo"){
      base.items = (b.items||b.todos||[]).map(it=> typeof it==="string"? {label:it, done:false} : ({
        label: it.label||it.title||it.text||"", done: !!it.done, meta: it.meta||it.desc||"", priority: it.priority||""
      }));
    }
    if(t==="text"){
      base.content = b.content||b.text||b.body||"";
      base.code = b.code||""; base.lang = b.lang||"";
      base.items = b.items||b.list||null;
      base.callout = b.callout||"";
    }
    if(t==="callout"){
      base.tone = (b.tone||"info").toLowerCase();
      base.content = b.content||b.text||b.body||"";
    }
    if(t==="box"){
      base.content = b.content||b.text||"";
      base.variant = b.variant||"default";
      base.items = b.items||null;
    }
    if(t==="columns"){
      base.cols = b.cols||b.columns||2;
      base.blocks = normalizeBlocks(b.blocks||b.children||[]);
    }
    return base;
  });
}
function legacyToBlocks(payload){
  const blocks=[];
  const layout = (payload.layout||"graph").toLowerCase();
  if(layout==="graph" && payload.nodes){
    blocks.push({
      type:"diagram", title: payload.title||"示意图",
      nodes: payload.nodes.map(n=>({id:n.id, label:n.label||n.title, sub:n.detail||n.desc||n.type, kind:n.type||"service", color:n.color})),
      edges: payload.edges||[]
    });
    if(payload.summary) blocks.push({type:"callout", tone:"info", content: payload.summary});
    return blocks;
  }
  if(layout==="doc"){
    if(payload.sections){
      payload.sections.forEach(s=>{
        blocks.push({type:"text", title:s.heading||s.title, content:s.content||s.text||"", code:s.code||"", lang:s.lang||"", items:s.items||null, callout:s.callout||""});
      });
    } else if(payload.nodes){
      payload.nodes.forEach(n=> blocks.push({type:"text", title:n.label, content:n.detail||""}));
    }
    if(payload.summary) blocks.push({type:"callout", tone:"info", content: payload.summary});
    return blocks;
  }
  if(layout==="cards"){
    blocks.push({type:"columns", cols: Math.min(3, payload.nodes?.length||2), blocks: (payload.nodes||[]).map(n=>({
      type:"box", title:n.label, content:n.detail||"", items: n.tags||null
    }))});
    if(payload.summary) blocks.push({type:"callout", content: payload.summary});
    return blocks;
  }
  if(layout==="timeline"){
    blocks.push({type:"todo", title: payload.title||"步骤", items: (payload.nodes||[]).map(n=>({label: n.label, meta: n.detail||"", done:false}))});
    if(payload.summary) blocks.push({type:"callout", content: payload.summary});
    return blocks;
  }
  if(layout==="mindmap"){
    blocks.push({type:"diagram", title: payload.title||"脑图", nodes: payload.nodes||[], edges: payload.edges||[]});
    if(payload.summary) blocks.push({type:"callout", content: payload.summary});
    return blocks;
  }
  if(payload.nodes){
    blocks.push({type:"diagram", nodes: payload.nodes, edges: payload.edges||[]});
  }
  if(payload.summary) blocks.push({type:"callout", content: payload.summary});
  return blocks;
}
function normalizeBoard(payload){
  if(!payload || typeof payload!=="object") return null;
  const op = (payload.op||"replace").toLowerCase();
  if(op==="clear") return { op, ts: Date.now(), title:"", subtitle:"", blocks:[] };
  let blocks = payload.blocks || payload.cards || null;
  if(blocks) blocks = normalizeBlocks(blocks);
  else if(payload.layout || payload.nodes) blocks = normalizeBlocks(legacyToBlocks(payload));
  else blocks = [];
  return {
    op,
    ts: payload.ts || Date.now(),
    title: payload.title || payload.name || "看板",
    subtitle: payload.subtitle || payload.desc || "",
    blocks,
    raw: payload
  };
}

// ---------- sparkline ----------
function Sparkline({ data, width=64, height=20 }){
  if(!data || !data.length) return null;
  const max=Math.max(...data), min=Math.min(...data), range=max-min||1;
  const step = data.length>1? width/(data.length-1): width;
  const pts = data.map((v,i)=> `${i*step},${height - (v-min)/range*height}`).join(" ");
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} style=${{display:"block"}}>
    <polyline fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" points=${pts} opacity="0.9" />
  </svg>`;
}

// ---------- chart ----------
const PALETTE_LIGHT = ["#0a0a0b","#6b7280","#9ca3af","#d1d5db","#e5e7eb"];
const PALETTE_DARK  = ["#f4f4f5","#9ca3af","#6b7280","#52525b","#3f3f46"];

function ChartBlock({ block }){
  const data = block.data||[];
  const type = block.chartType;
  const mode = useTheme();
  const isDark = mode==="dark";
  const colors = isDark? PALETTE_DARK: PALETTE_LIGHT;
  if(!data.length) return html`<div class="block"><div class="block-head"><div class="block-title">${block.title||"图表"}</div></div><div class="block-body" style=${{color:"var(--muted)"}}>暂无数据</div></div>`;
  const norm = data.map(d=>{
    if(typeof d==="number") return {name:"", value:d};
    if(Array.isArray(d)) return {name:String(d[0]), value:Number(d[1])};
    return {name: String(d[block.xKey] ?? d.name ?? d.label ?? ""), value: Number(d[block.yKey] ?? d.value ?? 0)};
  }).filter(d=> !isNaN(d.value));
  const max = Math.max(0, ...norm.map(d=> d.value));
  const min = Math.min(0, ...norm.map(d=> d.value));
  const range = max - min || 1;

  if(type==="donut" || type==="pie"){
    const total = norm.reduce((s,d)=> s+d.value,0) || 1;
    let acc=0;
    const R=62, r=36, cx=80, cy=80;
    const segs = norm.map((d,i)=>{
      const start = acc/total*360 -90;
      acc+= d.value;
      const end = acc/total*360 -90;
      const large = (end-start)>180?1:0;
      const rad = (deg)=> deg*Math.PI/180;
      const x1=cx+Math.cos(rad(start))*R, y1=cy+Math.sin(rad(start))*R;
      const x2=cx+Math.cos(rad(end))*R, y2=cy+Math.sin(rad(end))*R;
      const x3=cx+Math.cos(rad(end))*r, y3=cy+Math.sin(rad(end))*r;
      const x4=cx+Math.cos(rad(start))*r, y4=cy+Math.sin(rad(start))*r;
      return {d, path:`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, color: colors[i%colors.length]};
    });
    return html`
      <div class="block">
        <div class="block-head"><div class="block-title">${block.title||"占比"}</div><div class="block-sub">${block.caption||""}</div></div>
        <div class="block-body">
          <div style=${{display:"flex",gap:"20px",alignItems:"center",flexWrap:"wrap"}}>
            <svg width="160" height="160" viewBox="0 0 160 160" style=${{flex:"0 0 auto"}}>
              ${segs.map(s=> html`<path d=${s.path} fill=${s.color} stroke="var(--panel)" strokeWidth="2" />`)}
              <text x="80" y="78" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--fg)">${fmt(Math.round(total))}${block.unit||""}</text>
              <text x="80" y="94" textAnchor="middle" fontSize="10" fill="var(--muted)">总计</text>
            </svg>
            <div style=${{flex:"1",minWidth:"160px"}}>
              ${segs.map(s=> html`
                <div style=${{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--line-2)",fontSize:"12px"}}>
                  <span style=${{display:"flex",alignItems:"center",gap:"8px"}}><span style=${{width:"8px",height:"8px",borderRadius:"50%",background:s.color,display:"inline-block"}}></span>${s.d.name}</span>
                  <span style=${{fontWeight:"700",fontVariantNumeric:"tabular-nums"}}>${fmt(s.d.value)}${block.unit||""} · ${Math.round(s.d.value/total*100)}%</span>
                </div>
              `)}
            </div>
          </div>
          ${block.caption? html`<div class="caption">${block.caption}</div>`:null}
        </div>
      </div>
    `;
  }
  if(type==="line" || type==="area"){
    const W=640, H=172, padL=36, padR=12, padT=12, padB=28;
    const iw=W-padL-padR, ih=H-padT-padB;
    const step = norm.length>1? iw/(norm.length-1): iw;
    const y = (v)=> padT + ih - (v - min)/range*ih;
    const x = (i)=> padL + i*step;
    const pts = norm.map((d,i)=> `${x(i)},${y(d.value)}`).join(" ");
    const areaPts = `M ${x(0)},${y(min)} L ${norm.map((d,i)=> `${x(i)},${y(d.value)}`).join(" L ")} L ${x(norm.length-1)},${y(min)} Z`;
    const ticks=4;
    return html`
      <div class="block">
        <div class="block-head"><div class="block-title">${block.title||"趋势"}</div><div class="block-sub">${block.caption||""}</div></div>
        <div class="block-body">
          <svg viewBox=${`0 0 ${W} ${H}`} width="100%" height="172" style=${{display:"block"}}>
            ${Array.from({length:ticks+1}).map((_,i)=>{
              const v = min + range * i/ticks;
              const yy=y(v);
              return html`<g key=${i}>
                <line x1=${padL} y1=${yy} x2=${W-padR} y2=${yy} stroke="var(--line)" strokeWidth="1" />
                <text x=${padL-8} y=${yy+3} textAnchor="end" fontSize="10" fill="var(--muted)">${fmt(Math.round(v))}${block.unit||""}</text>
              </g>`;
            })}
            ${type==="area"? html`<path d=${areaPts} fill="color-mix(in srgb, var(--accent) 8%, transparent)" stroke="none" />`:null}
            <polyline fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points=${pts} />
            ${norm.map((d,i)=> html`<g key=${i}>
              <circle cx=${x(i)} cy=${y(d.value)} r="3.2" fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.8" />
              <text x=${x(i)} y=${y(d.value)-10} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--fg)" style=${{fontVariantNumeric:"tabular-nums"}}>${fmt(d.value)}${block.unit||""}</text>
              <text x=${x(i)} y=${H-8} textAnchor="middle" fontSize="10" fill="var(--muted)">${d.name}</text>
            </g>`)}
          </svg>
          ${block.caption? html`<div class="caption">${block.caption} · 零基线</div>`:null}
        </div>
      </div>
    `;
  }
  const isH = type==="barh" || type==="hbar" || type==="horizontal";
  if(isH){
    const W=640, H=Math.max(120, norm.length*34+40), padL=108, padR=24, padT=8, padB=16;
    const iw=W-padL-padR, ih=H-padT-padB;
    const barH = Math.max(14, Math.min(26, ih/norm.length*0.58));
    const gap = (ih - norm.length*barH)/(norm.length+1);
    const x0 = padL + (0 - min)/range*iw;
    return html`
      <div class="block">
        <div class="block-head"><div class="block-title">${block.title||"对比"}</div><div class="block-sub">${block.caption||""}</div></div>
        <div class="block-body">
          <svg viewBox=${`0 0 ${W} ${H}`} width="100%" height=${H} style=${{display:"block"}}>
            <line x1=${x0} y1=${padT} x2=${x0} y2=${H-padB} stroke="var(--line-strong)" strokeWidth="1" />
            ${norm.map((d,i)=>{
              const y = padT + gap + i*(barH+gap);
              const w = Math.abs(d.value)/range*iw;
              const x = d.value>=0? x0 : x0 - w;
              const fill = i===0? "var(--accent)" : colors[i%colors.length];
              return html`<g key=${i}>
                <text x=${padL-8} y=${y+barH/2+3} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--fg)">${d.name}</text>
                <rect x=${x} y=${y} width=${w} height=${barH} rx="6" fill=${fill} />
                <text x=${x + w + 6} y=${y+barH/2+3} fontSize="11" fontWeight="700" fill="var(--fg)" style=${{fontVariantNumeric:"tabular-nums"}}>${fmt(d.value)}${block.unit||""}</text>
              </g>`;
            })}
          </svg>
          ${block.caption? html`<div class="caption">${block.caption} · 横向便于对比</div>`:null}
        </div>
      </div>
    `;
  }
  // vertical bar
  {
    const W=640, H=192, padL=32, padR=12, padT=16, padB=30;
    const iw=W-padL-padR, ih=H-padT-padB;
    const bw = Math.max(18, Math.min(40, iw/norm.length*0.58));
    const gap = (iw - norm.length*bw)/(norm.length+1);
    const y0 = padT + ih - (0 - min)/range*ih;
    return html`
      <div class="block">
        <div class="block-head"><div class="block-title">${block.title||"对比"}</div><div class="block-sub">${block.caption||""}</div></div>
        <div class="block-body">
          <svg viewBox=${`0 0 ${W} ${H}`} width="100%" height="192" style=${{display:"block"}}>
            ${Array.from({length:4}).map((_,i)=>{
              const v=min+range*i/4;
              const yy= padT+ih - (v-min)/range*ih;
              return html`<line key=${i} x1=${padL} y1=${yy} x2=${W-padR} y2=${yy} stroke="var(--line)" strokeWidth="1" />`;
            })}
            <line x1=${padL} y1=${y0} x2=${W-padR} y2=${y0} stroke="var(--line-strong)" strokeWidth="1.2" />
            ${norm.map((d,i)=>{
              const x= padL+gap + i*(bw+gap);
              const h= Math.abs(d.value)/range*ih;
              const y= d.value>=0? y0 - h : y0;
              const fill = colors[i%colors.length];
              return html`<g key=${i}>
                <rect x=${x} y=${y} width=${bw} height=${h} rx="7" fill=${fill} />
                <text x=${x+bw/2} y=${y-6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--fg)" style=${{fontVariantNumeric:"tabular-nums"}}>${fmt(d.value)}${block.unit||""}</text>
                <text x=${x+bw/2} y=${H-10} textAnchor="middle" fontSize="11" fill="var(--muted)" style=${{fontWeight:600}}>${d.name}</text>
              </g>`;
            })}
          </svg>
          ${block.caption? html`<div class="caption">${block.caption} · 零基线</div>`:null}
        </div>
      </div>
    `;
  }
}

function StatsBlock({ block }){
  return html`
    <div class="stats">
      ${block.items.map(it=> html`
        <div class="stat" key=${it.label}>
          <div class="stat-label">${it.label}</div>
          <div class="stat-value">${it.value}</div>
          <div style=${{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"8px",gap:"8px"}}>
            ${it.delta? html`<div class=${"stat-delta "+(it.trend||"")}>${it.trend==="up"?"↑": it.trend==="down"?"↓":"•"} ${it.delta}</div>`: html`<span></span>`}
            ${it.spark? html`<${Sparkline} data=${it.spark} />`:null}
          </div>
          ${it.caption? html`<div style=${{marginTop:"6px",fontSize:"11px",color:"var(--muted)",lineHeight:"1.4"}}>${it.caption}</div>`:null}
        </div>
      `)}
    </div>
  `;
}
function TableBlock({ block }){
  const cols = block.columns||[];
  const rows = block.rows||[];
  return html`
    <div class="block">
      <div class="block-head">
        <div class="block-title">${block.title||"表格"}</div>
        ${block.caption? html`<span class="block-sub">${block.caption}</span>`:null}
      </div>
      <div class="block-body" style=${{paddingTop:"10px"}}>
        <div class="table-wrap">
          <table>
            <thead><tr>${cols.map(c=> html`<th key=${c}>${c}</th>`)}</tr></thead>
            <tbody>
              ${rows.map((r,ri)=> html`<tr key=${ri}>${(Array.isArray(r)? r : cols.map(c=> r[c]??"")).map((cell,ci)=>{
                const v=String(cell);
                const isStatus = /^(✓|✔|ok|done|通过|成功)/i.test(v);
                const isWarn = /^(⚠|warn|待定|风险)/i.test(v);
                return html`<td key=${ci}>${isStatus||isWarn? html`<span class=${"badge-cell "+(isStatus?"ok": isWarn?"warn":"")}>${v}</span>` : v}</td>`;
              })}</tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
function DiagramBlock({ block }){
  const nodes = block.nodes||[];
  const edges = block.edges||[];
  const [sel,setSel] = React.useState(null);
  if(!nodes.length) return html`<div class="block"><div class="block-body" style=${{color:"var(--muted)"}}>暂无节点</div></div>`;
  const nodeW=154, nodeH=52, gapX=32, gapY=20;
  const hasPos = nodes.some(n=> n.x!=null);
  let pos = new Map();
  let maxComputedX = 0;
  if(hasPos){
    nodes.forEach(n=> {
      const nx = n.x||0;
      const ny = n.y||0;
      pos.set(n.id, {x:nx, y:ny});
      if(nx + nodeW > maxComputedX) maxComputedX = nx + nodeW;
    });
  } else {
    const indeg=new Map(nodes.map(n=>[n.id,0]));
    edges.forEach(e=> indeg.set(e.to, (indeg.get(e.to)||0)+1));
    const adj=new Map();
    edges.forEach(e=>{ if(!adj.has(e.from)) adj.set(e.from,[]); adj.get(e.from).push(e.to); });
    const layer=new Map();
    const q=[];
    nodes.forEach(n=>{ if((indeg.get(n.id)||0)===0){ q.push(n.id); layer.set(n.id,0); }});
    let visited=new Set(q);
    while(q.length){
      const cur=q.shift();
      const curL=layer.get(cur)||0;
      (adj.get(cur)||[]).forEach(nb=>{
        const nl=Math.max(layer.get(nb)??0, curL+1);
        layer.set(nb,nl);
        if(!visited.has(nb)){ visited.add(nb); q.push(nb); }
      });
    }
    nodes.forEach(n=>{ if(!layer.has(n.id)) layer.set(n.id,0); });
    const maxL=Math.max(0, ...[...layer.values()]);
    const byLayer=Array.from({length:maxL+1},()=>[]);
    nodes.forEach(n=> byLayer[layer.get(n.id)].push(n));
    const colW = nodeW+gapX;
    const totalW = byLayer.length*colW - gapX;
    const startX = totalW > 800 ? 24 : Math.max(24, (860 - totalW)/2);
    byLayer.forEach((col, li)=>{
      const colH = col.length*(nodeH+gapY)-gapY;
      const startY = 36 + Math.max(0, (200 - colH)/2);
      col.forEach((n, idx)=>{
        const nx = startX + li*colW;
        const ny = startY + idx*(nodeH+gapY);
        pos.set(n.id, {x: nx, y: ny});
        if(nx + nodeW > maxComputedX) maxComputedX = nx + nodeW;
      });
    });
  }
  const W = Math.max(860, maxComputedX + 36);
  const H = Math.max(190, Math.max(...[...pos.values()].map(p=>p.y))+nodeH+28);
  return html`
    <div class="block">
      <div class="block-head"><div class="block-title">${block.title||"示意图"}</div><div class="block-sub">${block.caption||"点击框体"}</div></div>
      <div class="block-body" style=${{padding:"10px"}}>
        <div class="diagram" style=${{overflowX:"auto",maxWidth:"100%"}}>
          <svg class="diagram-svg" viewBox=${`0 0 ${W} ${H}`} style=${{minWidth:`${W}px`,width:"100%",height:`${H}px`}}>
            <defs>
              <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>
              <marker id="arr-m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.35" /></marker>
            </defs>
            ${edges.map((e,i)=>{
              const a=pos.get(e.from), b=pos.get(e.to);
              if(!a||!b) return null;
              const ax=a.x+nodeW, ay=a.y+nodeH/2, bx=b.x, by=b.y+nodeH/2;
              const mx=(ax+bx)/2;
              const dx=bx-ax;
              const path = `M ${ax} ${ay} C ${ax+dx*0.32} ${ay}, ${bx-dx*0.32} ${by}, ${bx} ${by}`;
              return html`<g key=${i} style=${{color: e.dashed? "var(--muted-2)" : "var(--line-strong)"}}>
                <path d=${path} class=${"edge"+(e.dashed?" dashed":"")} markerEnd=${e.dashed?"url(#arr-m)":"url(#arr)"} />
                ${e.label? html`<text x=${mx} y=${(ay+by)/2 - 6} textAnchor="middle" class="edge-label">${e.label}</text>`:null}
              </g>`;
            })}
            ${nodes.map(n=>{
              const p=pos.get(n.id);
              const isSel=sel===n.id;
              const fill = n.color? n.color : "var(--panel)";
              return html`<g key=${n.id} transform=${`translate(${p.x},${p.y})`} onClick=${()=> setSel(isSel? null : n.id)} style=${{cursor:"pointer"}}>
                <rect width=${nodeW} height=${nodeH} rx="9" class=${"node-rect"+(isSel?" selected":"")} fill=${fill} />
                <text x=${nodeW/2} y="19" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--fg)">${n.label}</text>
                <text x=${nodeW/2} y="33" textAnchor="middle" fontSize="10.5" fill="var(--muted)">${n.sub||""}</text>
              </g>`;
            })}
          </svg>
        </div>
        ${block.caption? html`<div class="caption">${block.caption}</div>`:null}
      </div>
    </div>
  `;
}
function DiffBlock({ block }){
  const lines=block.lines||[];
  return html`
    <div class="block">
      <div class="block-head">
        <div style=${{display:"flex",alignItems:"center",gap:"8px"}}>
          <div class="block-title">${block.title||"Diff"}</div>
          ${block.file? html`<span class="badge mono" style=${{fontSize:"11px"}}>${block.file}</span>`:null}
        </div>
        <span class="block-sub">${lines.filter(l=>l.op==="add").length} ++ · ${lines.filter(l=>l.op==="del").length} --</span>
      </div>
      <div class="block-body" style=${{padding:0}}>
        <div class="diff">
          <div class="diff-body">
            ${lines.map((l,i)=> html`
              <div key=${i} class=${"diff-line "+l.op}>
                <span class="diff-gutter">${l.op==="add"?"+": l.op==="del"?"-":" "}</span>
                <span class="diff-code">${l.code}</span>
              </div>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}
function TodoBlock({ block }){
  const [items,setItems]=React.useState(block.items||[]);
  React.useEffect(()=> setItems(block.items||[]), [block]);
  const done=items.filter(i=>i.done).length;
  const pct= items.length? Math.round(done/items.length*100):0;
  const toggle=(idx)=>{
    setItems(prev=> prev.map((it,i)=> i===idx? {...it, done:!it.done}: it));
  };
  return html`
    <div class="block">
      <div class="block-head"><div class="block-title">${block.title||"待办"}</div><div class="block-sub">${done}/${items.length} · ${pct}%</div></div>
      <div class="block-body">
        <div class="progress" style=${{marginBottom:"10px"}}><div class="progress-bar" style=${{width: pct+"%"}}></div></div>
        <div class="todo">
          ${items.map((it,i)=> html`
            <div key=${i} class=${"todo-item"+(it.done?" done":"")} onClick=${()=> toggle(i)} style=${{cursor:"pointer"}}>
              <div class=${"todo-check"+(it.done?" done":"")}>${it.done?"✓":""}</div>
              <div class="todo-text">
                <div class=${"todo-title"+(it.done?" done":"")}>${it.label}</div>
                ${it.meta? html`<div class="todo-meta">${it.meta}</div>`:null}
              </div>
              ${it.priority? html`<span class="badge" style=${{fontSize:"10px"}}>${it.priority}</span>`:null}
            </div>
          `)}
        </div>
        ${block.caption? html`<div class="caption">${block.caption}</div>`:null}
      </div>
    </div>
  `;
}
function TextBlock({ block }){
  return html`
    <div class="block">
      ${block.title? html`<div class="block-head"><div class="block-title">${block.title}</div></div>`:null}
      <div class="block-body">
        <div class="prose">
          ${block.content? html`<p style=${{whiteSpace:"pre-wrap",margin:"0"}}>${block.content}</p>`:null}
          ${block.items? html`<ul style=${{margin:"8px 0 0 18px"}}>${block.items.map(it=> html`<li key=${it}>${it}</li>`)}</ul>`:null}
          ${block.code? html`<pre><code>${block.code}</code></pre>`:null}
          ${block.callout? html`<div class="callout tone-info" style=${{marginTop:"10px"}}>💡 ${block.callout}</div>`:null}
        </div>
        ${block.caption? html`<div class="caption">${block.caption}</div>`:null}
      </div>
    </div>
  `;
}
function CalloutBlock({ block }){
  const tone = block.tone||"info";
  const icon = tone==="warn"?"⚠": tone==="ok"?"✓":"💡";
  return html`<div class=${"callout tone-"+tone}>${icon} <span style=${{flex:1}}>${block.title? html`<strong style=${{marginRight:"6px"}}>${block.title}</strong>`:null}${block.content}</span></div>`;
}
function BoxBlock({ block }){
  return html`
    <div class="block" style=${block.variant==="accent"? {borderColor:"var(--accent)"}:null}>
      ${block.title? html`<div class="block-head"><div class="block-title">${block.title}</div></div>`:null}
      <div class="block-body">
        ${block.content? html`<div style=${{fontSize:"13px",lineHeight:"1.6"}}>${block.content}</div>`:null}
        ${block.items? html`<div style=${{marginTop:"8px",display:"flex",flexWrap:"wrap",gap:"6px"}}>${block.items.map(it=> html`<span key=${it} class="badge">${it}</span>`)}</div>`:null}
        ${block.caption? html`<div class="caption">${block.caption}</div>`:null}
      </div>
    </div>
  `;
}
function ColumnsBlock({ block }){
  const cols = clamp(Number(block.cols)||2,1,3);
  return html`<div class=${"columns c"+cols}>${block.blocks.map(b=> html`<${BlockRenderer} key=${b.id} block=${b} />`)}</div>`;
}
function BlockRenderer({ block }){
  switch(block.type){
    case "stats": return html`<${StatsBlock} block=${block} />`;
    case "table": return html`<${TableBlock} block=${block} />`;
    case "chart": return html`<${ChartBlock} block=${block} />`;
    case "diagram": return html`<${DiagramBlock} block=${block} />`;
    case "diff": return html`<${DiffBlock} block=${block} />`;
    case "todo": return html`<${TodoBlock} block=${block} />`;
    case "text": return html`<${TextBlock} block=${block} />`;
    case "callout": return html`<${CalloutBlock} block=${block} />`;
    case "box": return html`<${BoxBlock} block=${block} />`;
    case "columns": return html`<${ColumnsBlock} block=${block} />`;
    default: return html`<${TextBlock} block=${block} />`;
  }
}

// ---------- html export ----------
function boardToHtml(board){
  const when = board.ts ? new Date(board.ts).toLocaleString("zh-CN",{hour12:false}) : "";
  const title = esc(board.title||"看板");
  const subtitle = esc(board.subtitle||"");
  const blocksHtml = (board.blocks||[]).map(b=>{
    if(b.type==="stats"){
      const items = (b.items||[]).map(it=>`
        <div style="border:1px solid #ececef;border-radius:12px;padding:14px;background:#fff">
          <div style="font-size:10px;letter-spacing:.06em;color:#6e6e7a;text-transform:uppercase;font-weight:700">${esc(it.label)}</div>
          <div style="font-size:22px;font-weight:800;margin-top:6px">${esc(it.value)}</div>
          ${it.delta? `<div style="margin-top:6px;font-size:11px;color:#6e6e7a">${esc(it.delta)}</div>`:""}
          ${it.caption? `<div style="margin-top:4px;font-size:11px;color:#9a9aa3">${esc(it.caption)}</div>`:""}
        </div>`).join("");
      return `<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">${items}</section>`;
    }
    if(b.type==="table"){
      const th = (b.columns||[]).map(c=> `<th style="text-align:left;font-size:11px;color:#6e6e7a;background:#f9f9f9;padding:8px 10px;border-bottom:1px solid #ececef">${esc(c)}</th>`).join("");
      const tr = (b.rows||[]).map(r=>{
        const cells = (Array.isArray(r)? r : (b.columns||[]).map(c=>r[c]??"")).map(v=> `<td style="padding:8px 10px;border-bottom:1px solid #f2f2f4">${esc(v)}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
        ${b.title? `<div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;font-weight:700">${esc(b.title)}</div>`:""}
        <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>
        ${b.caption? `<div style="padding:8px 14px;font-size:11px;color:#6e6e7a;border-top:1px dashed #ececef">${esc(b.caption)}</div>`:""}
      </section>`;
    }
    if(b.type==="chart"){
      const rows = (b.data||[]).map(d=>{
        const name = esc(d.name||d.label||"");
        const val = esc(d.value??d.val??"");
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #f2f2f4">${name}</td><td style="padding:6px 10px;border-bottom:1px solid #f2f2f4;text-align:right;font-weight:700">${val}${esc(b.unit||"")}</td></tr>`;
      }).join("");
      return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
        <div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;font-weight:700">${esc(b.title||"图表")} <span style="font-weight:500;color:#6e6e7a;font-size:11px">${esc(b.caption||"")}</span></div>
        <div style="padding:12px 14px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;font-size:11px;color:#6e6e7a;padding:6px 10px">项</th><th style="text-align:right;font-size:11px;color:#6e6e7a;padding:6px 10px">值</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
    }
    if(b.type==="diagram"){
      const nodes = (b.nodes||[]).map(n=> `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #ececef;border-radius:999px;background:#fff;font-size:12px"><b>${esc(n.label)}</b> <span style="color:#6e6e7a">${esc(n.sub||"")}</span></span>`).join(" ");
      const edges = (b.edges||[]).map(e=> `<div style="font-size:12px;color:#6e6e7a">${esc(e.from)} → ${esc(e.to)} ${e.label? `· ${esc(e.label)}`:""} ${e.dashed? "(异步)":""}</div>`).join("");
      return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
        <div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;font-weight:700">${esc(b.title||"示意图")}</div>
        <div style="padding:12px 14px;display:flex;flex-wrap:wrap;gap:8px">${nodes||'<span style="color:#9a9aa3">暂无节点</span>'}</div>
        ${edges? `<div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:4px">${edges}</div>`:""}
        ${b.caption? `<div style="padding:8px 14px;font-size:11px;color:#6e6e7a;border-top:1px dashed #ececef">${esc(b.caption)}</div>`:""}
      </section>`;
    }
    if(b.type==="diff"){
      const lines = (b.lines||[]).map(l=>{
        const bg = l.op==="add"? "#ecfdf5" : l.op==="del"? "#fef2f2" : "#fff";
        const g = l.op==="add"? "+" : l.op==="del"? "-" : " ";
        const gc = l.op==="add"? "#0e9f6e" : l.op==="del"? "#e5484d" : "#9a9aa3";
        return `<div style="display:flex;font-family:ui-monospace,monospace;font-size:12px;line-height:1.6;background:${bg}"><span style="width:28px;flex:0 0 28px;text-align:center;background:#f9f9f9;border-right:1px solid #ececef;color:${gc};font-weight:700">${g}</span><span style="padding:0 10px;white-space:pre;overflow:hidden;text-overflow:ellipsis">${esc(l.code)}</span></div>`;
      }).join("");
      return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
        <div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;display:flex;align-items:center;gap:8px"><b>${esc(b.title||"Diff")}</b> ${b.file? `<span style="font-family:monospace;font-size:11px;padding:2px 6px;border:1px solid #ececef;border-radius:999px;background:#f6f6f7">${esc(b.file)}</span>`:""}</div>
        <div style="max-height:360px;overflow:auto">${lines||'<div style="padding:12px;color:#9a9aa3">暂无内容</div>'}</div>
      </section>`;
    }
    if(b.type==="todo"){
      const items = (b.items||[]).map(it=> `<div style="display:flex;gap:10px;padding:9px 11px;border:1px solid #ececef;border-radius:9px;background:#f9f9f9"><span style="width:18px;height:18px;border-radius:6px;border:1.5px solid #e3e3e6;display:grid;place-items:center;background:#fff;font-size:11px">${it.done?"✓":""}</span><div style="flex:1"><div style="font-weight:600;${it.done?"color:#9a9aa3;text-decoration:line-through":""}">${esc(it.label)}</div>${it.meta? `<div style="font-size:11px;color:#6e6e7a">${esc(it.meta)}</div>`:""}</div>${it.priority? `<span style="font-size:10px;padding:3px 7px;border-radius:999px;background:#fff;border:1px solid #ececef">${esc(it.priority)}</span>`:""}</div>`).join("");
      return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
        <div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;font-weight:700">${esc(b.title||"待办")}</div>
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:7px">${items||'<span style="color:#9a9aa3">暂无</span>'}</div>
        ${b.caption? `<div style="padding:8px 14px;font-size:11px;color:#6e6e7a;border-top:1px dashed #ececef">${esc(b.caption)}</div>`:""}
      </section>`;
    }
    if(b.type==="callout"){
      const bg = b.tone==="warn"? "#fffbeb" : b.tone==="ok"? "#ecfdf5" : "#eff6ff";
      const bd = b.tone==="warn"? "#fde68a" : b.tone==="ok"? "#a7f3d0" : "#bfdbfe";
      return `<section style="padding:10px 12px;border-radius:9px;border:1px solid ${bd};background:${bg};font-size:13px;line-height:1.6">${esc(b.content)}</section>`;
    }
    if(b.type==="box"){
      return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
        ${b.title? `<div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;font-weight:700">${esc(b.title)}</div>`:""}
        <div style="padding:12px 14px;font-size:13px;line-height:1.6">${esc(b.content||"")}</div>
        ${b.items? `<div style="padding:0 14px 12px;display:flex;flex-wrap:wrap;gap:6px">${b.items.map(it=>`<span style="padding:3px 7px;border-radius:999px;background:#f6f6f7;border:1px solid #ececef;font-size:11px">${esc(it)}</span>`).join("")}</div>`:""}
      </section>`;
    }
    if(b.type==="columns"){
      const cols = Math.min(3, Math.max(1, Number(b.cols)||2));
      const innerBlocks = (b.blocks||[]).map(cb=> boardToHtmlFragment(cb)).join("");
      return `<section style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">${innerBlocks}</section>`;
    }
    // text default
    return `<section style="border:1px solid #ececef;border-radius:12px;overflow:hidden;background:#fff">
      ${b.title? `<div style="padding:11px 14px;border-bottom:1px solid #f2f2f4;font-weight:700">${esc(b.title)}</div>`:""}
      <div style="padding:12px 14px;font-size:13px;line-height:1.65;white-space:pre-wrap">${esc(b.content||"")}${b.items? `<ul style="margin:8px 0 0 18px">${b.items.map(it=>`<li>${esc(it)}</li>`).join("")}</ul>`:""}${b.code? `<pre style="margin-top:8px;background:#f9f9f9;border:1px solid #ececef;border-radius:9px;padding:10px;overflow:auto;font-size:12px"><code>${esc(b.code)}</code></pre>`:""}</div>
    </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:ui-sans-system,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial;background:#f9f9f9;color:#0a0a0b}
  a{color:inherit}
</style>
</head>
<body>
  <div style="max-width:860px;margin:0 auto;padding:28px 16px 40px">
    <header style="padding:8px 0 16px;border-bottom:1px solid #ececef;margin-bottom:16px">
      <h1 style="margin:0;font-size:24px;letter-spacing:-.03em">${title}</h1>
      ${subtitle? `<p style="margin:6px 0 0;color:#6e6e7a;font-size:13px">${subtitle}</p>`:""}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid #ececef;color:#6e6e7a">${(board.blocks||[]).length} 块</span>
        <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid #ececef;color:#6e6e7a;font-family:monospace">${esc(when)}</span>
      </div>
    </header>
    <main style="display:flex;flex-direction:column;gap:14px">
      ${blocksHtml || '<div style="padding:24px;text-align:center;color:#9a9aa3;border:1px dashed #ececef;border-radius:12px;background:#fff">暂无内容</div>'}
    </main>
    <footer style="margin-top:20px;padding-top:12px;border-top:1px solid #ececef;font-size:11px;color:#9a9aa3">由 看板 导出 · ${esc(when)}</footer>
  </div>
</body>
</html>`;
}
function boardToHtmlFragment(b){
  // minimal fragment for columns recursion
  const board = { title:"", subtitle:"", ts:Date.now(), blocks:[b] };
  const full = boardToHtml(board);
  const m = full.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  return m ? m[1].trim() : "";
}
function downloadHtml(board){
  const htmlStr = boardToHtml(board);
  const blob = new Blob([htmlStr], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (board.title||"看板").replace(/[\\/:*?"<>|]/g,"_").slice(0,40) || "看板";
  const ts = new Date(board.ts||Date.now()).toISOString().slice(0,19).replace(/[:T]/g,"-");
  a.href = url;
  a.download = `${safe}-${ts}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 800);
}

// ---------- app ----------
function App(){
  const [board, setBoard] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const [toast, setToast] = React.useState("");
  const [showHist, setShowHist] = React.useState(false);
  const toastRef = React.useRef(null);
  const boardRef = React.useRef(board);
  React.useEffect(()=>{ boardRef.current=board; },[board]);

  const pushToast = (msg)=>{
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(()=> setToast(""), 2200);
  };
  const persist = React.useCallback(async (nextHist)=>{
    try{ if(window.papr?.db) await papr.db.set("board:history", nextHist); }catch(e){ console.warn("[board] persist fail", e); }
  },[]);
  const waitPapr = async (ms=2000)=>{
    const t0=Date.now();
    while(Date.now()-t0 < ms){
      if(window.papr?.db) return true;
      await new Promise(r=> setTimeout(r, 80));
    }
    return !!window.papr?.db;
  };
  const normalizeHistoryEntry = (e)=>{
    if(!e || typeof e!=="object") return null;
    // 已是规范 board（含 blocks）但可能缺 id，做一次重归一化
    if(Array.isArray(e.blocks)){
      const nb = normalizeBoard(e);
      if(nb && nb.blocks.length) return nb;
      // fallback：保留原标题但重算 blocks
      return { ...e, blocks: normalizeBlocks(e.blocks), ts: e.ts||Date.now(), op: e.op||"replace", title: e.title||"看板", subtitle: e.subtitle||"" };
    }
    return normalizeBoard(e);
  };

  // init — 等待 papr 就绪，重归一化历史，失败回退 inbox
  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const ok = await waitPapr(2500);
        if(!ok){ pushToast("存储未就绪，请稍后重试"); return; }
        let h=null, clearedAt=null, inboxBoard=null, inboxCanvas=null;
        try{ h = await papr.db.get("board:history"); }catch(e){ console.warn("[board] get history fail", e); }
        try{ clearedAt = await papr.db.get("board:clearedAt"); }catch{}
        // 1) 历史优先：重归一化后展示
        if(Array.isArray(h) && h.length>0){
          const filtered = h.filter(x=> x && x.op!=="clear");
          if(filtered.length){
            const normed = filtered.map(normalizeHistoryEntry).filter(Boolean);
            if(normed.length && !cancelled){
              // 若存在旧格式无 id，顺手回写一次
              const needRewrite = normed.some(n=> !n.blocks.every(b=> b.id));
              setHistory(normed);
              const last = normed[normed.length-1];
              setBoard(last);
              boardRef.current = last;
              if(needRewrite) persist(normed);
              return;
            }
          }
          // 只有 clear 标记时尊重清空
          if(h.length===1 && h[0]?.op==="clear") return;
        }
        if(Array.isArray(h) && h.length===0 && clearedAt){
          // 已清空且无历史，保持空白
          return;
        }
        // 2) 回退 inbox 最新
        try{ inboxBoard = await papr.db.get("inbox:board"); }catch{}
        try{ inboxCanvas = await papr.db.get("inbox:canvas"); }catch{}
        const pick = (arr)=>{
          if(!Array.isArray(arr)||!arr.length) return null;
          const filtered = clearedAt ? arr.filter(it=> (it.ts||it.payload?.ts||0) > clearedAt) : arr;
          const src = filtered.length? filtered : arr;
          // 取最新一条 payload
          const last = src[src.length-1];
          return last?.payload || last || null;
        };
        const p = pick(inboxBoard) || pick(inboxCanvas);
        if(p && !cancelled){
          const nb=normalizeBoard(p);
          if(nb && nb.blocks.length){
            setBoard(nb);
            // 若历史为空则顺手写入，避免下次仍空白
            const nextHist = Array.isArray(h) && h.length ? [...h.filter(x=>x.op!=="clear"), nb].slice(-60) : [nb];
            const normedHist = nextHist.map(normalizeHistoryEntry).filter(Boolean);
            setHistory(normedHist);
            boardRef.current=nb;
            await persist(normedHist);
            pushToast(`已恢复：${nb.title}`);
          }
        }
      }catch(e){
        console.error("[board] init error", e);
        pushToast("加载失败：" + (e?.message||"未知错误"));
      }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  React.useEffect(()=>{
    if(!window.papr?.events) return;
    const handler = async (evt)=>{
      const payload = evt.payload;
      if(!payload) return;
      const op=(payload.op||"replace").toLowerCase();
      if(op==="clear"){
        const now=Date.now();
        boardRef.current=null; setBoard(null);
        setHistory([]);
        try{ if(window.papr?.db){ await papr.db.set("board:history", []); await papr.db.set("board:clearedAt", now); } }catch{}
        pushToast("看板已清空"); return;
      }
      const nb=normalizeBoard(payload);
      if(!nb) return;
      if((op==="append"||op==="patch") && boardRef.current){
        if(op==="append"){
          const merged={...boardRef.current, title: payload.title||boardRef.current.title, subtitle: payload.subtitle||boardRef.current.subtitle, blocks:[...boardRef.current.blocks, ...nb.blocks], ts:Date.now(), op:"append"};
          boardRef.current=merged; setBoard(merged); setHistory(h=>{ const nh=[...h, merged].slice(-60); persist(nh); return nh; }); pushToast(`已追加 ${nb.blocks.length} 块`); return;
        } else {
          const patched={...boardRef.current, title: payload.title||boardRef.current.title, subtitle: payload.subtitle||boardRef.current.subtitle, ts:Date.now(), op:"patch", blocks: nb.blocks.length? nb.blocks : boardRef.current.blocks};
          if(payload.blocks && boardRef.current.blocks.length){
            const curBlocks = [...boardRef.current.blocks];
            const byId=new Map(curBlocks.map(b=>[b.id,b]));
            let patchedById=false;
            payload.blocks.forEach((pb, pidx)=>{
              if(pb.id && byId.has(pb.id)){
                byId.set(pb.id, {...byId.get(pb.id), ...pb, id:pb.id});
                patchedById=true;
              } else if(!pb.id && pidx < curBlocks.length){
                const old = curBlocks[pidx];
                byId.set(old.id, {...old, ...pb, id:old.id});
                patchedById=true;
              }
            });
            if(patchedById) patched.blocks=[...byId.values()];
          }
          boardRef.current=patched; setBoard(patched); setHistory(h=>{ const nh=[...h, patched].slice(-60); persist(nh); return nh; }); pushToast("已更新"); return;
        }
      }
      boardRef.current=nb; setBoard(nb); setHistory(h=>{ const nh=[...h, nb].slice(-60); persist(nh); return nh; }); pushToast(`已更新：${nb.title}`);
    };
    const off1=window.papr.events.on("board", handler);
    const off2=window.papr.events.on("canvas", handler);
    return ()=>{ try{off1(); off2();}catch{} };
  },[]);

  const restore = (idx)=>{
    const h=history[idx];
    if(!h) return;
    boardRef.current=h; setBoard(h); pushToast(`已切换：${h.title}`);
  };
  const deleteOne = async (idx, e)=>{
    if(e) e.stopPropagation();
    const target = history[idx];
    if(!target) return;
    const nh = history.filter((_,i)=> i!==idx);
    const isCurrent = board && target.ts===board.ts && target.title===board.title;
    const nextBoard = isCurrent ? (nh.length? nh[nh.length-1] : null) : board;
    boardRef.current = nextBoard; setBoard(nextBoard);
    setHistory(nh);
    try{ if(window.papr?.db) await papr.db.set("board:history", nh); }catch{}
    if(nh.length===0){
      try{ if(window.papr?.db) await papr.db.set("board:clearedAt", Date.now()); }catch{}
    }
    pushToast(`已删除：${target.title}`);
  };
  const clearAll = async ()=>{
    if(history.length===0 && !board){ pushToast("已经是空的"); return; }
    if(history.length>0){
      const ok = confirm(`确定清空全部 ${history.length} 条历史？此操作不可撤销。`);
      if(!ok) return;
    }
    const now=Date.now();
    boardRef.current=null; setBoard(null);
    setHistory([]);
    try{
      if(window.papr?.db){
        await papr.db.set("board:history", []);
        await papr.db.set("board:clearedAt", now);
        try{ await papr.db.delete("inbox:board"); }catch{}
        try{ await papr.db.delete("inbox:canvas"); }catch{}
      }
    }catch{}
    pushToast("已清空");
  };

  React.useEffect(()=>{
    window.__board = {
      push: async (p)=>{
        const nb=normalizeBoard(p);
        if(!nb) return;
        const op=(p.op||"replace").toLowerCase();
        if(op==="clear"){ const now=Date.now(); boardRef.current=null; setBoard(null); setHistory([]); try{ if(window.papr?.db){ await papr.db.set("board:history", []); await papr.db.set("board:clearedAt", now); } }catch{} return; }
        if((op==="append"||op==="patch") && boardRef.current){
          if(op==="append"){
            const m={...boardRef.current, blocks:[...boardRef.current.blocks, ...nb.blocks], ts:Date.now(), title:p.title||boardRef.current.title};
            boardRef.current=m; setBoard(m); setHistory(h=>{ const nh=[...h,m].slice(-60); persist(nh); return nh; }); return;
          } else {
            const patched={...boardRef.current, title: p.title||boardRef.current.title, subtitle: p.subtitle||boardRef.current.subtitle, ts:Date.now(), op:"patch", blocks: nb.blocks.length? nb.blocks : boardRef.current.blocks};
            if(p.blocks && boardRef.current.blocks.length){
              const curBlocks = [...boardRef.current.blocks];
              const byId=new Map(curBlocks.map(b=>[b.id,b]));
              let patchedById=false;
              p.blocks.forEach((pb, pidx)=>{
                if(pb.id && byId.has(pb.id)){
                  byId.set(pb.id, {...byId.get(pb.id), ...pb, id:pb.id});
                  patchedById=true;
                } else if(!pb.id && pidx < curBlocks.length){
                  const old = curBlocks[pidx];
                  byId.set(old.id, {...old, ...pb, id:old.id});
                  patchedById=true;
                }
              });
              if(patchedById) patched.blocks=[...byId.values()];
            }
            boardRef.current=patched; setBoard(patched); setHistory(h=>{ const nh=[...h, patched].slice(-60); persist(nh); return nh; }); return;
          }
        }
        boardRef.current=nb; setBoard(nb); setHistory(h=>{ const nh=[...h,nb].slice(-60); persist(nh); return nh; });
      },
      get board(){return boardRef.current;},
      get history(){return history;}
    };
  },[history]);

  React.useEffect(()=>{
    const onKey=(e)=>{
      if(e.key==="Escape"){ setShowHist(false); }
    };
    window.addEventListener("keydown", onKey);
    return ()=> window.removeEventListener("keydown", onKey);
  },[]);

  const [recovering, setRecovering] = React.useState(false);
  const doRecover = async ()=>{
    if(recovering) return;
    setRecovering(true);
    try{
      const ok = await waitPapr(2000);
      if(!ok){ pushToast("存储未就绪"); return; }
      let h=null, inboxB=null, inboxC=null, clearedAt=null;
      try{ h=await papr.db.get("board:history"); }catch{}
      try{ inboxB=await papr.db.get("inbox:board"); }catch{}
      try{ inboxC=await papr.db.get("inbox:canvas"); }catch{}
      try{ clearedAt=await papr.db.get("board:clearedAt"); }catch{}
      if(Array.isArray(h) && h.length){
        const normed = h.filter(x=>x&&x.op!=="clear").map(normalizeHistoryEntry).filter(Boolean);
        if(normed.length){
          const last = normed[normed.length-1];
          setHistory(normed); setBoard(last); boardRef.current=last;
          await persist(normed);
          pushToast(`已恢复：${last.title}`);
          return;
        }
      }
      const pick = (arr)=>{
        if(!Array.isArray(arr)||!arr.length) return null;
        const filtered = clearedAt ? arr.filter(it=> (it.ts||it.payload?.ts||0) > clearedAt) : arr;
        const src = filtered.length? filtered : arr;
        const last = src[src.length-1];
        return last?.payload || last || null;
      };
      const p = pick(inboxB) || pick(inboxC);
      if(p){
        const nb=normalizeBoard(p);
        if(nb){ setBoard(nb); boardRef.current=nb; const nh=[nb]; setHistory(nh); await persist(nh); pushToast(`已恢复：${nb.title}`); return; }
      }
      pushToast("没有可恢复的历史");
    }catch(e){ pushToast("恢复失败：" + (e?.message||"未知")); }
    finally{ setRecovering(false); }
  };

  return html`
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <div class="mark">▦</div>
          <div class="brand-text">
            <div class="title">${board?.title||"看板"}</div>
            <div class="sub">${board?.subtitle||"等待 Agent 推送 · 支持 表格/图表/示意图/Diff/待办"}</div>
          </div>
          <span class="badge">${board? `${board.blocks.length} 块` : "空"}</span>
        </div>
        <div class="actions">
          <button class="btn primary" onClick=${()=> setShowHist(true)}>查看历史${history.length? ` · ${history.length}`:""}</button>
        </div>
      </header>

      <main class="stage">
        ${!board || !board.blocks.length? html`
          <div class="canvas">
            <div class="empty">
              <div class="mark">▦</div>
              <h2>暂无看板</h2>
              <p>等待 Agent 推送。推送后在此展示，历史可在右上角查看。</p>
              <div style=${{display:"flex",gap:"8px",justifyContent:"center",marginTop:"14px",flexWrap:"wrap"}}>
                <button class="btn primary" onClick=${doRecover} disabled=${recovering}>${recovering? "恢复中…": "恢复最近一条"}</button>
                <button class="btn" onClick=${()=> setShowHist(true)}>查看历史${history.length? ` · ${history.length}`:""}</button>
              </div>
              <div class="hint">
                <b>推送方式</b> · 在 Agent 中执行：<br/>
                <code>app_publish({ appId: "cursor-canvas", channel: "board", payload: { op:"replace", title:"标题", blocks:[...] } })</code><br/>
                <span style=${{color:"var(--muted-2)"}}>支持 op: replace / append / patch / clear · 块类型: stats / table / chart / diagram / diff / todo / text / callout / columns</span>
                <div style=${{marginTop:"8px",fontSize:"11px",color:"var(--muted-2)"}}>若刷新后空白，点“恢复最近一条”会从 sqlite / 收件箱重建</div>
              </div>
            </div>
          </div>
        ` : html`
          <div class="canvas">
            <div class="board-head">
              <h1>${board.title}</h1>
              ${board.subtitle? html`<p>${board.subtitle}</p>`:null}
              <div class="board-meta">
                <span class="meta-tag">${board.blocks.length} 块</span>
                <span class="meta-tag mono">${new Date(board.ts).toLocaleString()}</span>
              </div>
            </div>
            <div style=${{display:"flex",flexDirection:"column",gap:"14px"}}>
              ${board.blocks.map(b=> html`<${BlockRenderer} key=${b.id} block=${b} />`)}
            </div>
          </div>
        `}
      </main>

      <footer class="statusbar">
        <span>本地 · 离线可用 · 数据存 sqlite</span>
        <span class="mono">${board? `${board.blocks.length} 块` : "0 块"} · ${history.length} 历史</span>
      </footer>

      ${toast? html`<div class="toast">${toast}</div>`:null}

      ${showHist? html`
        <dialog open style=${{display:"block"}} onClick=${(e)=>{ if(e.target.tagName==="DIALOG") setShowHist(false); }}>
          <div class="dlg-head">
            <h3>查看历史</h3>
            <button class="btn icon" onClick=${()=> setShowHist(false)}>✕</button>
          </div>
          <div class="dlg-body">
            ${history.length? html`<div class="hlist">
              ${[...history].reverse().map((h,i)=>{
                const idx=history.length-1-i;
                const active=board && h.ts===board.ts;
                try{
                return html`<div key=${h.ts+"_"+i} class=${"hrow"+(active?" active":"")}>
                  <div class="hrow-main" onClick=${()=> restore(idx)} style=${{cursor:"pointer"}}>
                    <div class="hrow-title">${h.title||"未命名"}</div>
                    <div class="hrow-meta">
                      <span class="mono">${h.ts? new Date(h.ts).toLocaleString(): "—"}</span>
                      <span class="badge">${h.blocks?.length||0} 块</span>
                      ${active? html`<span class="badge" style=${{background:"var(--accent)",color:"var(--accent-fg)",borderColor:"var(--accent)"}}>当前</span>`:null}
                    </div>
                    ${h.subtitle? html`<div style=${{fontSize:"11px",color:"var(--muted)",marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>${h.subtitle}</div>`:null}
                  </div>
                  <div class="hrow-actions">
                    <button class="btn sm" onClick=${()=> restore(idx)}>查看</button>
                    <button class="btn sm" onClick=${()=> downloadHtml(h)}>下载</button>
                    <button class="btn sm danger" onClick=${(e)=> deleteOne(idx,e)}>删除</button>
                  </div>
                </div>`;
                }catch(e){
                  console.error("[board] history row render fail", h?.title, e);
                  return html`<div key=${h.ts+"_"+i} class="hrow" style=${{borderColor:"var(--danger)"}}>
                    <div class="hrow-main">
                      <div class="hrow-title">${h.title||"未命名"} · 渲染失败</div>
                      <div class="hrow-meta"><span class="mono" style=${{color:"var(--danger)"}}>${String(e.message).slice(0,120)}</span></div>
                    </div>
                    <div class="hrow-actions">
                      <button class="btn sm" onClick=${()=> downloadHtml(h)}>下载</button>
                      <button class="btn sm danger" onClick=${(e)=> deleteOne(idx,e)}>删除</button>
                    </div>
                  </div>`;
                }
              })}
            </div>` : html`<div class="empty-hist">暂无历史<br/><span style=${{fontSize:"11px"}}>推送后会自动保存到 sqlite，刷新不丢</span></div>`}
          </div>
          <div class="dlg-foot">
            <span style=${{fontSize:"11px",color:"var(--muted)"}}>${history.length? `共 ${history.length} 条 · 点击“查看”切换主界面` : "暂无数据"}</span>
            <div style=${{display:"flex",gap:"8px"}}>
              <button class="btn sm" onClick=${()=> setShowHist(false)}>关闭</button>
              <button class="btn sm danger" onClick=${clearAll} disabled=${history.length===0 && !board}>清空</button>
            </div>
          </div>
        </dialog>
      `:null}
    </div>
  `;
}

try{
  const rootEl=document.getElementById("root");
  if(!rootEl) throw new Error("root 容器缺失");
  const root = ReactDOM.createRoot(rootEl);
  root.render(html`<${ErrorBoundary}><${App} /></${ErrorBoundary}>`);
  window.__reactMounted = true;
  const boot=document.getElementById("boot");
  if(boot) boot.remove();
  console.log("[board] mounted, history in sqlite, inbox ready");
}catch(e){
  console.error("[board] mount fail", e);
  window.__bootErrors.push(e.message);
  const el=document.getElementById("err");
  if(el){ el.textContent="挂载失败: "+e.message; el.className="show"; }
  if(window.__plainRender) window.__plainRender();
}
