/* 看板 (Cursor Canvas) · 零依赖极简原生版
   - 纯原生零依赖运行时，秒级响应，永不报 vendor 缺失
   - 推送协议：app_publish({ appId:"cursor-canvas", channel:"board", payload:{op,title,blocks} })
   - 数据存储：papr.db (SQLite): board:history / board:clearedAt / inbox:board
   - 历史抽屉：支持 查看 / 删除 / 清空 / 导出下载独立HTML / 恢复最近一条
*/

(function () {
  'use strict';

  // ---------- 工具函数 ----------
  const uid = () => Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const fmt = (n) => {
    if (typeof n === 'string' && isNaN(Number(n))) return n;
    const v = Number(n);
    if (Number.isNaN(v)) return String(n ?? '');
    return new Intl.NumberFormat('zh-CN').format(v);
  };

  // ---------- Diff 解析 ----------
  function parseDiff(diffStr) {
    if (typeof diffStr !== 'string') return [];
    const lines = [];
    diffStr.split('\n').forEach((l) => {
      if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('@@')) return;
      if (l.startsWith('+')) lines.push({ op: 'add', code: l.slice(1) });
      else if (l.startsWith('-')) lines.push({ op: 'del', code: l.slice(1) });
      else lines.push({ op: 'ctx', code: l.replace(/^ /, '') });
    });
    return lines;
  }

  // ---------- 数据归一化 (兼容各种数据格式) ----------
  function normalizeBlocks(rawBlocks) {
    if (!Array.isArray(rawBlocks)) return [];
    return rawBlocks.map((b) => {
      if (!b || typeof b !== 'object') return { id: `b_${uid()}`, type: 'text', content: String(b) };
      const t = (b.type || 'text').toLowerCase();
      const base = {
        id: b.id || `b_${uid()}`,
        type: t,
        title: b.title || b.heading || '',
        caption: b.caption || b.desc || '',
        raw: b
      };

      if (t === 'stats') {
        base.items = (b.items || []).map((it) => ({
          label: it.label || it.name || '',
          value: it.value ?? it.val ?? '',
          delta: it.delta || it.change || '',
          trend: it.trend || (String(it.delta || '').startsWith('+') ? 'up' : String(it.delta || '').startsWith('-') ? 'down' : ''),
          caption: it.caption || it.sub || '',
          spark: it.spark || it.trendData || null
        }));
      } else if (t === 'table') {
        base.columns = b.columns || b.header || b.cols || [];
        if (b.rows) {
          base.rows = b.rows;
        } else if (b.data && Array.isArray(b.data)) {
          const cols = base.columns.length ? base.columns : Object.keys(b.data[0] || {});
          base.columns = cols;
          base.rows = b.data.map((r) => cols.map((c) => r[c] ?? ''));
        } else {
          base.rows = [];
        }
      } else if (t === 'chart') {
        base.chartType = (b.chartType || b.type2 || b.variant || 'bar').toLowerCase();
        base.data = b.data || b.values || b.points || [];
        base.unit = b.unit || '';
        base.xKey = b.xKey || 'name';
        base.yKey = b.yKey || 'value';
      } else if (t === 'diagram') {
        base.nodes = (b.nodes || []).map((n, i) => ({
          id: String(n.id || `n${i}`),
          label: n.label || n.title || n.name || n.id,
          sub: n.sub || n.detail || n.desc || n.type || '',
          kind: (n.kind || n.type || 'default').toLowerCase(),
          color: n.color || '',
          x: typeof n.x === 'number' ? n.x : null,
          y: typeof n.y === 'number' ? n.y : null
        }));
        base.edges = (b.edges || []).map((e) => ({
          from: String(e.from || e.source || e.a || ''),
          to: String(e.to || e.target || e.b || ''),
          label: e.label || '',
          dashed: !!e.dashed
        })).filter((e) => e.from && e.to);
      } else if (t === 'diff') {
        base.file = b.file || b.path || '';
        if (b.diff) base.lines = parseDiff(b.diff);
        else if (b.lines) base.lines = b.lines.map((l) => ({
          op: l.op || (l.type === 'add' ? 'add' : l.type === 'del' ? 'del' : 'ctx'),
          code: l.code || l.text || ''
        }));
        else base.lines = [];
      } else if (t === 'todo') {
        base.items = (b.items || b.todos || []).map((it) =>
          typeof it === 'string'
            ? { label: it, done: false }
            : {
                label: it.label || it.title || it.text || '',
                done: !!it.done,
                meta: it.meta || it.desc || '',
                priority: it.priority || ''
              }
        );
      } else if (t === 'text') {
        base.content = b.content || b.text || b.body || '';
        base.code = b.code || '';
        base.lang = b.lang || '';
        base.items = b.items || b.list || null;
        base.callout = b.callout || '';
      } else if (t === 'callout') {
        base.tone = (b.tone || 'info').toLowerCase();
        base.content = b.content || b.text || b.body || '';
      } else if (t === 'box') {
        base.content = b.content || b.text || '';
        base.variant = b.variant || 'default';
        base.items = b.items || null;
      } else if (t === 'columns') {
        base.cols = b.cols || b.columns || 2;
        base.blocks = normalizeBlocks(b.blocks || b.children || []);
      }
      return base;
    });
  }

  function legacyToBlocks(payload) {
    const blocks = [];
    const layout = (payload.layout || 'graph').toLowerCase();
    if (layout === 'graph' && payload.nodes) {
      blocks.push({
        type: 'diagram',
        title: payload.title || '示意图',
        nodes: payload.nodes.map((n) => ({
          id: n.id,
          label: n.label || n.title,
          sub: n.detail || n.desc || n.type,
          kind: n.type || 'service',
          color: n.color
        })),
        edges: payload.edges || []
      });
      if (payload.summary) blocks.push({ type: 'callout', tone: 'info', content: payload.summary });
      return blocks;
    }
    if (layout === 'doc') {
      if (payload.sections) {
        payload.sections.forEach((s) => {
          blocks.push({
            type: 'text',
            title: s.heading || s.title,
            content: s.content || s.text || '',
            code: s.code || '',
            lang: s.lang || '',
            items: s.items || null,
            callout: s.callout || ''
          });
        });
      } else if (payload.nodes) {
        payload.nodes.forEach((n) => blocks.push({ type: 'text', title: n.label, content: n.detail || '' }));
      }
      if (payload.summary) blocks.push({ type: 'callout', tone: 'info', content: payload.summary });
      return blocks;
    }
    if (layout === 'cards') {
      blocks.push({
        type: 'columns',
        cols: Math.min(3, payload.nodes?.length || 2),
        blocks: (payload.nodes || []).map((n) => ({
          type: 'box',
          title: n.label,
          content: n.detail || '',
          items: n.tags || null
        }))
      });
      if (payload.summary) blocks.push({ type: 'callout', content: payload.summary });
      return blocks;
    }
    if (layout === 'timeline') {
      blocks.push({
        type: 'todo',
        title: payload.title || '步骤',
        items: (payload.nodes || []).map((n) => ({ label: n.label, meta: n.detail || '', done: false }))
      });
      if (payload.summary) blocks.push({ type: 'callout', content: payload.summary });
      return blocks;
    }
    if (layout === 'mindmap') {
      blocks.push({
        type: 'diagram',
        title: payload.title || '脑图',
        nodes: payload.nodes || [],
        edges: payload.edges || []
      });
      if (payload.summary) blocks.push({ type: 'callout', content: payload.summary });
      return blocks;
    }
    if (payload.nodes) {
      blocks.push({ type: 'diagram', nodes: payload.nodes, edges: payload.edges || [] });
    }
    if (payload.summary) blocks.push({ type: 'callout', content: payload.summary });
    return blocks;
  }

  function normalizeBoard(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const op = (payload.op || 'replace').toLowerCase();
    if (op === 'clear') return { op, ts: Date.now(), title: '', subtitle: '', blocks: [] };
    let blocks = payload.blocks || payload.cards || null;
    if (blocks) blocks = normalizeBlocks(blocks);
    else if (payload.layout || payload.nodes) blocks = normalizeBlocks(legacyToBlocks(payload));
    else blocks = [];
    return {
      op,
      ts: payload.ts || Date.now(),
      title: payload.title || payload.name || '看板',
      subtitle: payload.subtitle || payload.desc || '',
      blocks,
      raw: payload
    };
  }

  // ---------- 调色板与主题 ----------
  const PALETTE_LIGHT = ['#0a0a0b', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'];
  const PALETTE_DARK = ['#f4f4f5', '#9ca3af', '#6b7280', '#52525b', '#3f3f46'];

  function getThemeMode() {
    const m = document.documentElement.getAttribute('data-mode') || document.documentElement.getAttribute('data-theme');
    if (m === 'dark' || m === 'light') return m;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // ---------- 单个 Block 渲染器 (返回 HTML 字符串) ----------

  function renderSparkline(data, width = 64, height = 20) {
    if (!Array.isArray(data) || !data.length) return '';
    const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
    const step = data.length > 1 ? width / (data.length - 1) : width;
    const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ');
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">
      <polyline fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" points="${pts}" opacity="0.9" />
    </svg>`;
  }

  function renderStatsBlock(block) {
    const items = (block.items || []).map((it) => {
      const deltaHtml = it.delta
        ? `<div class="stat-delta ${it.trend || ''}">${it.trend === 'up' ? '↑' : it.trend === 'down' ? '↓' : '•'} ${esc(it.delta)}</div>`
        : '<span></span>';
      const sparkHtml = it.spark ? renderSparkline(it.spark) : '';
      const captionHtml = it.caption ? `<div style="margin-top:6px;font-size:11px;color:var(--muted);line-height:1.4">${esc(it.caption)}</div>` : '';
      return `
        <div class="stat">
          <div class="stat-label">${esc(it.label)}</div>
          <div class="stat-value">${esc(it.value)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px">
            ${deltaHtml}
            ${sparkHtml}
          </div>
          ${captionHtml}
        </div>
      `;
    }).join('');
    return `<div class="stats">${items}</div>`;
  }

  function renderTableBlock(block) {
    const cols = block.columns || [];
    const rows = block.rows || [];
    const ths = cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const trs = rows.map((r) => {
      const cells = (Array.isArray(r) ? r : cols.map((c) => r[c] ?? '')).map((cell) => {
        const v = String(cell ?? '');
        const isStatus = /^(✓|✔|ok|done|通过|成功)/i.test(v);
        const isWarn = /^(⚠|warn|待定|风险)/i.test(v);
        const cellContent = (isStatus || isWarn)
          ? `<span class="badge-cell ${isStatus ? 'ok' : 'warn'}">${esc(v)}</span>`
          : esc(v);
        return `<td>${cellContent}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `
      <div class="block">
        <div class="block-head">
          <div class="block-title">${esc(block.title || '表格')}</div>
          ${block.caption ? `<span class="block-sub">${esc(block.caption)}</span>` : ''}
        </div>
        <div class="block-body" style="padding-top:10px">
          <div class="table-wrap">
            <table>
              <thead><tr>${ths}</tr></thead>
              <tbody>${trs}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderChartBlock(block) {
    const data = block.data || [];
    const type = block.chartType || 'bar';
    const isDark = getThemeMode() === 'dark';
    const colors = isDark ? PALETTE_DARK : PALETTE_LIGHT;

    if (!data.length) {
      return `
        <div class="block">
          <div class="block-head"><div class="block-title">${esc(block.title || '图表')}</div></div>
          <div class="block-body" style="color:var(--muted)">暂无数据</div>
        </div>
      `;
    }

    const norm = data.map((d) => {
      if (typeof d === 'number') return { name: '', value: d };
      if (Array.isArray(d)) return { name: String(d[0]), value: Number(d[1]) };
      return {
        name: String(d[block.xKey] ?? d.name ?? d.label ?? ''),
        value: Number(d[block.yKey] ?? d.value ?? 0)
      };
    }).filter((d) => !isNaN(d.value));

    const max = Math.max(0, ...norm.map((d) => d.value));
    const min = Math.min(0, ...norm.map((d) => d.value));
    const range = max - min || 1;

    // 环形图 / 饼图
    if (type === 'donut' || type === 'pie') {
      const total = norm.reduce((s, d) => s + d.value, 0) || 1;
      let acc = 0;
      const R = 62, r = 36, cx = 80, cy = 80;
      const rad = (deg) => (deg * Math.PI) / 180;
      const segs = norm.map((d, i) => {
        const start = (acc / total) * 360 - 90;
        acc += d.value;
        const end = (acc / total) * 360 - 90;
        const large = (end - start) > 180 ? 1 : 0;
        const x1 = cx + Math.cos(rad(start)) * R, y1 = cy + Math.sin(rad(start)) * R;
        const x2 = cx + Math.cos(rad(end)) * R, y2 = cy + Math.sin(rad(end)) * R;
        const x3 = cx + Math.cos(rad(end)) * r, y3 = cy + Math.sin(rad(end)) * r;
        const x4 = cx + Math.cos(rad(start)) * r, y4 = cy + Math.sin(rad(start)) * r;
        const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
        return { d, path, color: colors[i % colors.length] };
      });

      const pathsSvg = segs.map((s) => `<path d="${s.path}" fill="${s.color}" stroke="var(--panel)" stroke-width="2" />`).join('');
      const legendRows = segs.map((s) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-2);font-size:12px">
          <span style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>${esc(s.d.name)}</span>
          <span style="font-weight:700;font-variant-numeric:tabular-nums">${fmt(s.d.value)}${esc(block.unit || '')} · ${Math.round((s.d.value / total) * 100)}%</span>
        </div>
      `).join('');

      return `
        <div class="block">
          <div class="block-head"><div class="block-title">${esc(block.title || '占比')}</div><div class="block-sub">${esc(block.caption || '')}</div></div>
          <div class="block-body">
            <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
              <svg width="160" height="160" viewBox="0 0 160 160" style="flex:0 0 auto">
                ${pathsSvg}
                <text x="80" y="78" text-anchor="middle" font-size="13" font-weight="800" fill="var(--fg)">${fmt(Math.round(total))}${esc(block.unit || '')}</text>
                <text x="80" y="94" text-anchor="middle" font-size="10" fill="var(--muted)">总计</text>
              </svg>
              <div style="flex:1;min-width:160px">${legendRows}</div>
            </div>
            ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ''}
          </div>
        </div>
      `;
    }

    // 折线图 / 面积图
    if (type === 'line' || type === 'area') {
      const W = 640, H = 172, padL = 36, padR = 12, padT = 12, padB = 28;
      const iw = W - padL - padR, ih = H - padT - padB;
      const step = norm.length > 1 ? iw / (norm.length - 1) : iw;
      const y = (v) => padT + ih - ((v - min) / range) * ih;
      const x = (i) => padL + i * step;
      const pts = norm.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
      const areaPts = `M ${x(0)},${y(min)} L ${norm.map((d, i) => `${x(i)},${y(d.value)}`).join(' L ')} L ${x(norm.length - 1)},${y(min)} Z`;
      const ticks = 4;

      const gridLines = Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = min + (range * i) / ticks;
        const yy = y(v);
        return `
          <g>
            <line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--line)" stroke-width="1" />
            <text x="${padL - 8}" y="${yy + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(Math.round(v))}${esc(block.unit || '')}</text>
          </g>
        `;
      }).join('');

      const pointDots = norm.map((d, i) => `
        <g>
          <circle cx="${x(i)}" cy="${y(d.value)}" r="3.2" fill="var(--panel)" stroke="var(--accent)" stroke-width="1.8" />
          <text x="${x(i)}" y="${y(d.value) - 10}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--fg)" style="font-variant-numeric:tabular-nums">${fmt(d.value)}${esc(block.unit || '')}</text>
          <text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(d.name)}</text>
        </g>
      `).join('');

      return `
        <div class="block">
          <div class="block-head"><div class="block-title">${esc(block.title || '趋势')}</div><div class="block-sub">${esc(block.caption || '')}</div></div>
          <div class="block-body">
            <svg viewBox="0 0 ${W} ${H}" width="100%" height="172" style="display:block">
              ${gridLines}
              ${type === 'area' ? `<path d="${areaPts}" fill="color-mix(in srgb, var(--accent) 8%, transparent)" stroke="none" />` : ''}
              <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}" />
              ${pointDots}
            </svg>
            ${block.caption ? `<div class="caption">${esc(block.caption)} · 零基线</div>` : ''}
          </div>
        </div>
      `;
    }

    // 横向柱状图
    const isH = type === 'barh' || type === 'hbar' || type === 'horizontal';
    if (isH) {
      const W = 640, H = Math.max(120, norm.length * 34 + 40), padL = 108, padR = 24, padT = 8, padB = 16;
      const iw = W - padL - padR, ih = H - padT - padB;
      const barH = Math.max(14, Math.min(26, (ih / norm.length) * 0.58));
      const gap = (ih - norm.length * barH) / (norm.length + 1);
      const x0 = padL + ((0 - min) / range) * iw;

      const bars = norm.map((d, i) => {
        const y = padT + gap + i * (barH + gap);
        const w = (Math.abs(d.value) / range) * iw;
        const x = d.value >= 0 ? x0 : x0 - w;
        const fill = i === 0 ? 'var(--accent)' : colors[i % colors.length];
        return `
          <g>
            <text x="${padL - 8}" y="${y + barH / 2 + 3}" text-anchor="end" font-size="11" font-weight="600" fill="var(--fg)">${esc(d.name)}</text>
            <rect x="${x}" y="${y}" width="${w}" height="${barH}" rx="6" fill="${fill}" />
            <text x="${x + w + 6}" y="${y + barH / 2 + 3}" font-size="11" font-weight="700" fill="var(--fg)" style="font-variant-numeric:tabular-nums">${fmt(d.value)}${esc(block.unit || '')}</text>
          </g>
        `;
      }).join('');

      return `
        <div class="block">
          <div class="block-head"><div class="block-title">${esc(block.title || '对比')}</div><div class="block-sub">${esc(block.caption || '')}</div></div>
          <div class="block-body">
            <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
              <line x1="${x0}" y1="${padT}" x2="${x0}" y2="${H - padB}" stroke="var(--line-strong)" stroke-width="1" />
              ${bars}
            </svg>
            ${block.caption ? `<div class="caption">${esc(block.caption)} · 横向便于对比</div>` : ''}
          </div>
        </div>
      `;
    }

    // 纵向柱状图 (默认)
    {
      const W = 640, H = 192, padL = 32, padR = 12, padT = 16, padB = 30;
      const iw = W - padL - padR, ih = H - padT - padB;
      const bw = Math.max(18, Math.min(40, (iw / norm.length) * 0.58));
      const gap = (iw - norm.length * bw) / (norm.length + 1);
      const y0 = padT + ih - ((0 - min) / range) * ih;

      const gridLines = Array.from({ length: 4 }).map((_, i) => {
        const v = min + (range * i) / 4;
        const yy = padT + ih - ((v - min) / range) * ih;
        return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--line)" stroke-width="1" />`;
      }).join('');

      const bars = norm.map((d, i) => {
        const x = padL + gap + i * (bw + gap);
        const h = (Math.abs(d.value) / range) * ih;
        const y = d.value >= 0 ? y0 - h : y0;
        const fill = colors[i % colors.length];
        return `
          <g>
            <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="7" fill="${fill}" />
            <text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--fg)" style="font-variant-numeric:tabular-nums">${fmt(d.value)}${esc(block.unit || '')}</text>
            <text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)" style="font-weight:600">${esc(d.name)}</text>
          </g>
        `;
      }).join('');

      return `
        <div class="block">
          <div class="block-head"><div class="block-title">${esc(block.title || '对比')}</div><div class="block-sub">${esc(block.caption || '')}</div></div>
          <div class="block-body">
            <svg viewBox="0 0 ${W} ${H}" width="100%" height="192" style="display:block">
              ${gridLines}
              <line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="var(--line-strong)" stroke-width="1.2" />
              ${bars}
            </svg>
            ${block.caption ? `<div class="caption">${esc(block.caption)} · 零基线</div>` : ''}
          </div>
        </div>
      `;
    }
  }

  function renderDiagramBlock(block, selectedNodeId) {
    const nodes = block.nodes || [];
    const edges = block.edges || [];
    if (!nodes.length) {
      return `
        <div class="block">
          <div class="block-body" style="color:var(--muted)">暂无节点</div>
        </div>
      `;
    }

    const nodeW = 154, nodeH = 52, gapX = 32, gapY = 20;
    const hasPos = nodes.some((n) => n.x != null);
    const pos = new Map();
    let maxComputedX = 0;

    if (hasPos) {
      nodes.forEach((n) => {
        const nx = n.x || 0;
        const ny = n.y || 0;
        pos.set(n.id, { x: nx, y: ny });
        if (nx + nodeW > maxComputedX) maxComputedX = nx + nodeW;
      });
    } else {
      const indeg = new Map(nodes.map((n) => [n.id, 0]));
      edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) || 0) + 1));
      const adj = new Map();
      edges.forEach((e) => {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from).push(e.to);
      });
      const layer = new Map();
      const q = [];
      nodes.forEach((n) => {
        if ((indeg.get(n.id) || 0) === 0) {
          q.push(n.id);
          layer.set(n.id, 0);
        }
      });
      const visited = new Set(q);
      while (q.length) {
        const cur = q.shift();
        const curL = layer.get(cur) || 0;
        (adj.get(cur) || []).forEach((nb) => {
          const nl = Math.max(layer.get(nb) ?? 0, curL + 1);
          layer.set(nb, nl);
          if (!visited.has(nb)) {
            visited.add(nb);
            q.push(nb);
          }
        });
      }
      nodes.forEach((n) => {
        if (!layer.has(n.id)) layer.set(n.id, 0);
      });
      const maxL = Math.max(0, ...[...layer.values()]);
      const byLayer = Array.from({ length: maxL + 1 }, () => []);
      nodes.forEach((n) => byLayer[layer.get(n.id)].push(n));
      const colW = nodeW + gapX;
      const totalW = byLayer.length * colW - gapX;
      const startX = totalW > 800 ? 24 : Math.max(24, (860 - totalW) / 2);

      byLayer.forEach((col, li) => {
        const colH = col.length * (nodeH + gapY) - gapY;
        const startY = 36 + Math.max(0, (200 - colH) / 2);
        col.forEach((n, idx) => {
          const nx = startX + li * colW;
          const ny = startY + idx * (nodeH + gapY);
          pos.set(n.id, { x: nx, y: ny });
          if (nx + nodeW > maxComputedX) maxComputedX = nx + nodeW;
        });
      });
    }

    const W = Math.max(860, maxComputedX + 36);
    const maxY = Math.max(...[...pos.values()].map((p) => p.y));
    const H = Math.max(190, maxY + nodeH + 28);

    const edgesSvg = edges.map((e) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return '';
      const ax = a.x + nodeW, ay = a.y + nodeH / 2, bx = b.x, by = b.y + nodeH / 2;
      const mx = (ax + bx) / 2;
      const dx = bx - ax;
      const path = `M ${ax} ${ay} C ${ax + dx * 0.32} ${ay}, ${bx - dx * 0.32} ${by}, ${bx} ${by}`;
      const edgeColor = e.dashed ? 'var(--muted-2)' : 'var(--line-strong)';
      const marker = e.dashed ? 'url(#arr-m)' : 'url(#arr)';
      const labelText = e.label ? `<text x="${mx}" y="${(ay + by) / 2 - 6}" text-anchor="middle" class="edge-label">${esc(e.label)}</text>` : '';
      return `
        <g style="color:${edgeColor}">
          <path d="${path}" class="edge${e.dashed ? ' dashed' : ''}" marker-end="${marker}" />
          ${labelText}
        </g>
      `;
    }).join('');

    const nodesSvg = nodes.map((n) => {
      const p = pos.get(n.id) || { x: 0, y: 0 };
      const isSel = selectedNodeId === n.id;
      const fill = n.color ? n.color : 'var(--panel)';
      return `
        <g class="diagram-node" data-node-id="${esc(n.id)}" transform="translate(${p.x},${p.y})" style="cursor:pointer">
          <rect width="${nodeW}" height="${nodeH}" rx="9" class="node-rect${isSel ? ' selected' : ''}" fill="${fill}" />
          <text x="${nodeW / 2}" y="19" text-anchor="middle" font-size="12" font-weight="700" fill="var(--fg)">${esc(n.label)}</text>
          <text x="${nodeW / 2}" y="33" text-anchor="middle" font-size="10.5" fill="var(--muted)">${esc(n.sub || '')}</text>
        </g>
      `;
    }).join('');

    return `
      <div class="block">
        <div class="block-head"><div class="block-title">${esc(block.title || '示意图')}</div><div class="block-sub">${esc(block.caption || '点击框体')}</div></div>
        <div class="block-body" style="padding:10px">
          <div class="diagram" style="overflow-x:auto;max-width:100%">
            <svg class="diagram-svg" viewBox="0 0 ${W} ${H}" style="min-width:${W}px;width:100%;height:${H}px">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>
                <marker id="arr-m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.35" /></marker>
              </defs>
              ${edgesSvg}
              ${nodesSvg}
            </svg>
          </div>
          ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderDiffBlock(block) {
    const lines = block.lines || [];
    const adds = lines.filter((l) => l.op === 'add').length;
    const dels = lines.filter((l) => l.op === 'del').length;
    const linesHtml = lines.map((l) => `
      <div class="diff-line ${l.op}">
        <span class="diff-gutter">${l.op === 'add' ? '+' : l.op === 'del' ? '-' : ' '}</span>
        <span class="diff-code">${esc(l.code)}</span>
      </div>
    `).join('');

    return `
      <div class="block">
        <div class="block-head">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="block-title">${esc(block.title || 'Diff')}</div>
            ${block.file ? `<span class="badge mono" style="font-size:11px">${esc(block.file)}</span>` : ''}
          </div>
          <span class="block-sub">${adds} ++ · ${dels} --</span>
        </div>
        <div class="block-body" style="padding:0">
          <div class="diff">
            <div class="diff-body">${linesHtml}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTodoBlock(block, blockIndex) {
    const items = block.items || [];
    const done = items.filter((i) => i.done).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;

    const itemsHtml = items.map((it, i) => `
      <div class="todo-item${it.done ? ' done' : ''}" data-todo-block="${blockIndex}" data-todo-idx="${i}" style="cursor:pointer">
        <div class="todo-check${it.done ? ' done' : ''}">${it.done ? '✓' : ''}</div>
        <div class="todo-text">
          <div class="todo-title${it.done ? ' done' : ''}">${esc(it.label)}</div>
          ${it.meta ? `<div class="todo-meta">${esc(it.meta)}</div>` : ''}
        </div>
        ${it.priority ? `<span class="badge" style="font-size:10px">${esc(it.priority)}</span>` : ''}
      </div>
    `).join('');

    return `
      <div class="block">
        <div class="block-head">
          <div class="block-title">${esc(block.title || '待办')}</div>
          <div class="block-sub">${done}/${items.length} · ${pct}%</div>
        </div>
        <div class="block-body">
          <div class="progress" style="margin-bottom:10px"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="todo">${itemsHtml}</div>
          ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderTextBlock(block) {
    const contentHtml = block.content ? `<p style="white-space:pre-wrap;margin:0">${esc(block.content)}</p>` : '';
    const itemsHtml = block.items ? `<ul style="margin:8px 0 0 18px">${block.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>` : '';
    const codeHtml = block.code ? `<pre><code>${esc(block.code)}</code></pre>` : '';
    const calloutHtml = block.callout ? `<div class="callout tone-info" style="margin-top:10px">💡 ${esc(block.callout)}</div>` : '';

    return `
      <div class="block">
        ${block.title ? `<div class="block-head"><div class="block-title">${esc(block.title)}</div></div>` : ''}
        <div class="block-body">
          <div class="prose">
            ${contentHtml}
            ${itemsHtml}
            ${codeHtml}
            ${calloutHtml}
          </div>
          ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderCalloutBlock(block) {
    const tone = block.tone || 'info';
    const icon = tone === 'warn' ? '⚠' : tone === 'ok' ? '✓' : '💡';
    const titleHtml = block.title ? `<strong style="margin-right:6px">${esc(block.title)}</strong>` : '';
    return `<div class="callout tone-${tone}">${icon} <span style="flex:1">${titleHtml}${esc(block.content)}</span></div>`;
  }

  function renderBoxBlock(block) {
    const contentHtml = block.content ? `<div style="font-size:13px;line-height:1.6">${esc(block.content)}</div>` : '';
    const itemsHtml = block.items ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${block.items.map((it) => `<span class="badge">${esc(it)}</span>`).join('')}</div>` : '';
    const accentStyle = block.variant === 'accent' ? 'style="border-color:var(--accent)"' : '';
    return `
      <div class="block" ${accentStyle}>
        ${block.title ? `<div class="block-head"><div class="block-title">${esc(block.title)}</div></div>` : ''}
        <div class="block-body">
          ${contentHtml}
          ${itemsHtml}
          ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderColumnsBlock(block, blockIndex, selectedNodeId) {
    const cols = clamp(Number(block.cols) || 2, 1, 3);
    const innerBlocksHtml = (block.blocks || []).map((b, idx) => renderBlock(b, `${blockIndex}_${idx}`, selectedNodeId)).join('');
    return `<div class="columns c${cols}">${innerBlocksHtml}</div>`;
  }

  function renderBlock(block, blockIndex, selectedNodeId) {
    if (!block || !block.type) return '';
    switch (block.type) {
      case 'stats': return renderStatsBlock(block);
      case 'table': return renderTableBlock(block);
      case 'chart': return renderChartBlock(block);
      case 'diagram': return renderDiagramBlock(block, selectedNodeId);
      case 'diff': return renderDiffBlock(block);
      case 'todo': return renderTodoBlock(block, blockIndex);
      case 'text': return renderTextBlock(block);
      case 'callout': return renderCalloutBlock(block);
      case 'box': return renderBoxBlock(block);
      case 'columns': return renderColumnsBlock(block, blockIndex, selectedNodeId);
      default: return renderTextBlock(block);
    }
  }

  // ---------- HTML 单文件离线导出 ----------
  function boardToHtml(board) {
    const when = board.ts ? new Date(board.ts).toLocaleString('zh-CN', { hour12: false }) : '';
    const title = esc(board.title || '看板');
    const subtitle = esc(board.subtitle || '');
    const blocksHtml = (board.blocks || []).map((b, idx) => renderBlock(b, idx, null)).join('\n');

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:ui-sans-system,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9f9f9;color:#0a0a0b;line-height:1.5;font-size:13px}
  .block{background:#fff;border:1px solid #ececef;border-radius:12px;overflow:hidden;margin-bottom:14px}
  .block-head{padding:11px 14px;border-bottom:1px solid #f2f2f4;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .block-title{font-weight:700;font-size:13px}
  .block-sub{font-size:11px;color:#6e6e7a}
  .block-body{padding:12px 14px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .stat{background:#fff;border:1px solid #ececef;border-radius:12px;padding:14px}
  .stat-label{font-size:10px;font-weight:700;color:#6e6e7a;text-transform:uppercase}
  .stat-value{font-size:22px;font-weight:800;margin-top:6px}
  .stat-delta{font-size:11px;color:#6e6e7a;margin-top:6px}
  .stat-delta.up{color:#0e9f6e} .stat-delta.down{color:#e5484d}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-size:11px;color:#6e6e7a;background:#f9f9f9;padding:8px 10px;border-bottom:1px solid #ececef}
  td{padding:8px 10px;border-bottom:1px solid #f2f2f4}
  .badge-cell{padding:2px 7px;border-radius:999px;font-size:11px;background:#f6f6f7;border:1px solid #ececef}
  .badge-cell.ok{color:#0e9f6e;background:#ecfdf5;border-color:#a7f3d0}
  .badge-cell.warn{color:#b7791f;background:#fffbeb;border-color:#fde68a}
  .callout{padding:10px 12px;border-radius:9px;border:1px solid #bfdbfe;background:#eff6ff;font-size:13px;display:flex;gap:8px}
  .callout.tone-ok{border-color:#a7f3d0;background:#ecfdf5}
  .callout.tone-warn{border-color:#fde68a;background:#fffbeb}
  .diff{border:1px solid #ececef;border-radius:9px;overflow:hidden;background:#fff}
  .diff-line{display:flex;font-family:monospace;font-size:12px;line-height:1.6}
  .diff-gutter{width:28px;text-align:center;background:#f9f9f9;border-right:1px solid #ececef;color:#9a9aa3}
  .diff-line.add{background:#ecfdf5} .diff-line.add .diff-gutter{color:#0e9f6e;background:#d1fae5}
  .diff-line.del{background:#fef2f2} .diff-line.del .diff-gutter{color:#e5484d;background:#fee2e2}
  .todo-item{display:flex;gap:10px;padding:9px 11px;background:#f9f9f9;border:1px solid #ececef;border-radius:9px;margin-bottom:7px}
  .todo-check{width:18px;height:18px;border-radius:6px;border:1.5px solid #e3e3e6;background:#fff;display:grid;place-items:center;font-size:11px}
  .todo-check.done{background:#0a0a0b;color:#fff}
  .todo-title.done{text-decoration:line-through;color:#9a9aa3}
  .columns{display:grid;gap:12px} .columns.c2{grid-template-columns:1fr 1fr} .columns.c3{grid-template-columns:1fr 1fr 1fr}
</style>
</head>
<body>
  <div style="max-width:860px;margin:0 auto;padding:28px 16px 40px">
    <header style="padding:8px 0 16px;border-bottom:1px solid #ececef;margin-bottom:16px">
      <h1 style="margin:0;font-size:24px;letter-spacing:-.03em">${title}</h1>
      ${subtitle ? `<p style="margin:6px 0 0;color:#6e6e7a;font-size:13px">${subtitle}</p>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid #ececef;color:#6e6e7a">${(board.blocks || []).length} 块</span>
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

  function downloadHtml(board) {
    const htmlStr = boardToHtml(board);
    const blob = new Blob([htmlStr], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (board.title || '看板').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '看板';
    const ts = new Date(board.ts || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `${safe}-${ts}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  // ---------- 状态管理与核心 App ----------
  class BoardApp {
    constructor(rootEl) {
      this.rootEl = rootEl;
      this.board = null;
      this.history = [];
      this.showHist = false;
      this.toast = '';
      this.toastTimer = null;
      this.recovering = false;
      this.selectedNodeId = null;

      this.initEvents();
      this.initStorage();
    }

    pushToast(msg) {
      this.toast = msg;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toast = '';
        this.render();
      }, 2200);
      this.render();
    }

    async persistHistory(nextHist) {
      try {
        if (window.papr?.db) {
          await window.papr.db.set('board:history', nextHist);
        }
      } catch (e) {
        console.warn('[board] persist fail', e);
      }
    }

    async waitPapr(ms = 2500) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (window.papr?.db) return true;
        await new Promise((r) => setTimeout(r, 60));
      }
      return !!window.papr?.db;
    }

    async initStorage() {
      try {
        const ok = await this.waitPapr(2500);
        if (!ok) {
          this.pushToast('存储就绪中…');
          this.render();
          return;
        }

        let h = null, clearedAt = null, inboxBoard = null, inboxCanvas = null;
        try { h = await window.papr.db.get('board:history'); } catch {}
        try { clearedAt = await window.papr.db.get('board:clearedAt'); } catch {}

        if (Array.isArray(h) && h.length > 0) {
          const filtered = h.filter((x) => x && x.op !== 'clear');
          if (filtered.length) {
            const normed = filtered.map(normalizeBoard).filter(Boolean);
            if (normed.length) {
              this.history = normed;
              this.board = normed[normed.length - 1];
              this.render();
              return;
            }
          }
          if (h.length === 1 && h[0]?.op === 'clear') {
            this.render();
            return;
          }
        }

        if (Array.isArray(h) && h.length === 0 && clearedAt) {
          this.render();
          return;
        }

        // 回退 inbox
        try { inboxBoard = await window.papr.db.get('inbox:board'); } catch {}
        try { inboxCanvas = await window.papr.db.get('inbox:canvas'); } catch {}

        const pick = (arr) => {
          if (!Array.isArray(arr) || !arr.length) return null;
          const filtered = clearedAt ? arr.filter((it) => (it.ts || it.payload?.ts || 0) > clearedAt) : arr;
          const src = filtered.length ? filtered : arr;
          const last = src[src.length - 1];
          return last?.payload || last || null;
        };

        const p = pick(inboxBoard) || pick(inboxCanvas);
        if (p) {
          const nb = normalizeBoard(p);
          if (nb && nb.blocks.length) {
            this.board = nb;
            this.history = [nb];
            await this.persistHistory(this.history);
            this.pushToast(`已恢复：${nb.title}`);
          }
        }
      } catch (e) {
        console.error('[board] init error', e);
      } finally {
        this.render();
      }
    }

    initEvents() {
      // 监听 papr 实时推送
      if (window.papr?.events) {
        const handler = async (evt) => {
          const payload = evt?.payload;
          if (!payload) return;
          const op = (payload.op || 'replace').toLowerCase();
          if (op === 'clear') {
            const now = Date.now();
            this.board = null;
            this.history = [];
            try {
              if (window.papr?.db) {
                await window.papr.db.set('board:history', []);
                await window.papr.db.set('board:clearedAt', now);
              }
            } catch {}
            this.pushToast('看板已清空');
            this.render();
            return;
          }

          const nb = normalizeBoard(payload);
          if (!nb) return;

          if (op === 'append' && this.board) {
            const merged = {
              ...this.board,
              title: payload.title || this.board.title,
              subtitle: payload.subtitle || this.board.subtitle,
              blocks: [...this.board.blocks, ...nb.blocks],
              ts: Date.now(),
              op: 'append'
            };
            this.board = merged;
            this.history = [...this.history, merged].slice(-60);
            this.persistHistory(this.history);
            this.pushToast(`已追加 ${nb.blocks.length} 块`);
            this.render();
            return;
          }

          if (op === 'patch' && this.board) {
            const patched = {
              ...this.board,
              title: payload.title || this.board.title,
              subtitle: payload.subtitle || this.board.subtitle,
              ts: Date.now(),
              op: 'patch',
              blocks: nb.blocks.length ? nb.blocks : this.board.blocks
            };
            if (payload.blocks && this.board.blocks.length) {
              const curBlocks = [...this.board.blocks];
              const byId = new Map(curBlocks.map((b) => [b.id, b]));
              let patchedById = false;
              payload.blocks.forEach((pb, pidx) => {
                if (pb.id && byId.has(pb.id)) {
                  byId.set(pb.id, { ...byId.get(pb.id), ...pb, id: pb.id });
                  patchedById = true;
                } else if (!pb.id && pidx < curBlocks.length) {
                  const old = curBlocks[pidx];
                  byId.set(old.id, { ...old, ...pb, id: old.id });
                  patchedById = true;
                }
              });
              if (patchedById) patched.blocks = [...byId.values()];
            }
            this.board = patched;
            this.history = [...this.history, patched].slice(-60);
            this.persistHistory(this.history);
            this.pushToast('已更新');
            this.render();
            return;
          }

          this.board = nb;
          this.history = [...this.history, nb].slice(-60);
          this.persistHistory(this.history);
          this.pushToast(`已更新：${nb.title}`);
          this.render();
        };

        window.papr.events.on('board', handler);
        window.papr.events.on('canvas', handler);
      }

      // 键盘快捷键 Escape
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.showHist) {
          this.showHist = false;
          this.render();
        }
      });

      // 全局代理点击交互
      this.rootEl.addEventListener('click', async (e) => {
        const target = e.target;

        // 打开历史抽屉
        if (target.closest('[data-action="open-hist"]')) {
          this.showHist = true;
          this.render();
          return;
        }

        // 关闭历史抽屉
        if (target.closest('[data-action="close-hist"]') || target.tagName === 'DIALOG') {
          this.showHist = false;
          this.render();
          return;
        }

        // 恢复最近一条
        if (target.closest('[data-action="recover"]')) {
          await this.doRecover();
          return;
        }

        // 历史项：查看
        const restoreBtn = target.closest('[data-action="restore"]');
        if (restoreBtn) {
          const idx = Number(restoreBtn.dataset.idx);
          if (!isNaN(idx) && this.history[idx]) {
            this.board = this.history[idx];
            this.pushToast(`已切换：${this.board.title}`);
            this.render();
          }
          return;
        }

        // 历史项：下载
        const downloadBtn = target.closest('[data-action="download"]');
        if (downloadBtn) {
          const idx = Number(downloadBtn.dataset.idx);
          if (!isNaN(idx) && this.history[idx]) {
            downloadHtml(this.history[idx]);
          }
          return;
        }

        // 历史项：删除单条
        const deleteBtn = target.closest('[data-action="delete"]');
        if (deleteBtn) {
          const idx = Number(deleteBtn.dataset.idx);
          if (!isNaN(idx) && this.history[idx]) {
            const targetEntry = this.history[idx];
            this.history = this.history.filter((_, i) => i !== idx);
            if (this.board && targetEntry.ts === this.board.ts && targetEntry.title === this.board.title) {
              this.board = this.history.length ? this.history[this.history.length - 1] : null;
            }
            await this.persistHistory(this.history);
            if (this.history.length === 0 && window.papr?.db) {
              try { await window.papr.db.set('board:clearedAt', Date.now()); } catch {}
            }
            this.pushToast(`已删除：${targetEntry.title}`);
            this.render();
          }
          return;
        }

        // 历史项：全部清空
        if (target.closest('[data-action="clear-all"]')) {
          if (this.history.length === 0 && !this.board) {
            this.pushToast('已经是空的');
            return;
          }
          if (this.history.length > 0 && !confirm(`确定清空全部 ${this.history.length} 条历史？此操作不可撤销。`)) {
            return;
          }
          const now = Date.now();
          this.board = null;
          this.history = [];
          if (window.papr?.db) {
            try {
              await window.papr.db.set('board:history', []);
              await window.papr.db.set('board:clearedAt', now);
              await window.papr.db.delete('inbox:board');
              await window.papr.db.delete('inbox:canvas');
            } catch {}
          }
          this.pushToast('已清空');
          this.render();
          return;
        }

        // Todo 勾选切换
        const todoItem = target.closest('[data-todo-block]');
        if (todoItem) {
          const bIdx = todoItem.dataset.todoBlock;
          const iIdx = Number(todoItem.dataset.todoIdx);
          if (this.board && this.board.blocks) {
            const block = this.board.blocks[bIdx];
            if (block && block.items && block.items[iIdx]) {
              block.items[iIdx].done = !block.items[iIdx].done;
              this.render();
            }
          }
          return;
        }

        // 拓扑图节点点击选中
        const nodeEl = target.closest('.diagram-node');
        if (nodeEl) {
          const nid = nodeEl.dataset.nodeId;
          this.selectedNodeId = this.selectedNodeId === nid ? null : nid;
          this.render();
          return;
        }
      });

      // 挂载全局调试对象
      window.__board = {
        push: async (p) => {
          const nb = normalizeBoard(p);
          if (!nb) return;
          this.board = nb;
          this.history = [...this.history, nb].slice(-60);
          await this.persistHistory(this.history);
          this.render();
        },
        get board() { return window.__appInstance?.board; },
        get history() { return window.__appInstance?.history; }
      };
    }

    async doRecover() {
      if (this.recovering) return;
      this.recovering = true;
      this.render();
      try {
        const ok = await this.waitPapr(2000);
        if (!ok) {
          this.pushToast('存储未就绪');
          return;
        }
        let h = null, inboxB = null, inboxC = null, clearedAt = null;
        try { h = await window.papr.db.get('board:history'); } catch {}
        try { inboxB = await window.papr.db.get('inbox:board'); } catch {}
        try { inboxC = await window.papr.db.get('inbox:canvas'); } catch {}
        try { clearedAt = await window.papr.db.get('board:clearedAt'); } catch {}

        if (Array.isArray(h) && h.length) {
          const normed = h.filter((x) => x && x.op !== 'clear').map(normalizeBoard).filter(Boolean);
          if (normed.length) {
            this.history = normed;
            this.board = normed[normed.length - 1];
            await this.persistHistory(normed);
            this.pushToast(`已恢复：${this.board.title}`);
            return;
          }
        }

        const pick = (arr) => {
          if (!Array.isArray(arr) || !arr.length) return null;
          const filtered = clearedAt ? arr.filter((it) => (it.ts || it.payload?.ts || 0) > clearedAt) : arr;
          const src = filtered.length ? filtered : arr;
          const last = src[src.length - 1];
          return last?.payload || last || null;
        };

        const p = pick(inboxB) || pick(inboxC);
        if (p) {
          const nb = normalizeBoard(p);
          if (nb) {
            this.board = nb;
            this.history = [nb];
            await this.persistHistory(this.history);
            this.pushToast(`已恢复：${nb.title}`);
            return;
          }
        }
        this.pushToast('没有可恢复的历史');
      } catch (e) {
        this.pushToast('恢复失败：' + (e?.message || '未知'));
      } finally {
        this.recovering = false;
        this.render();
      }
    }

    render() {
      const board = this.board;
      const history = this.history;

      const headerHtml = `
        <header class="topbar">
          <div class="brand">
            <div class="mark">▦</div>
            <div class="brand-text">
              <div class="title">${esc(board?.title || '看板')}</div>
              <div class="sub">${esc(board?.subtitle || '等待 Agent 推送 · 支持 表格/图表/示意图/Diff/待办')}</div>
            </div>
            <span class="badge">${board ? `${board.blocks.length} 块` : '空'}</span>
          </div>
          <div class="actions">
            <button class="btn primary" data-action="open-hist">查看历史${history.length ? ` · ${history.length}` : ''}</button>
          </div>
        </header>
      `;

      let stageContentHtml = '';
      if (!board || !board.blocks || !board.blocks.length) {
        stageContentHtml = `
          <div class="canvas">
            <div class="empty">
              <div class="mark">▦</div>
              <h2>暂无看板</h2>
              <p>等待 Agent 推送。推送后在此展示，历史可在右上角查看。</p>
              <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap">
                <button class="btn primary" data-action="recover" ${this.recovering ? 'disabled' : ''}>${this.recovering ? '恢复中…' : '恢复最近一条'}</button>
                <button class="btn" data-action="open-hist">查看历史${history.length ? ` · ${history.length}` : ''}</button>
              </div>
              <div class="hint">
                <b>推送方式</b> · 在 Agent 中执行：<br/>
                <code>app_publish({ appId: "cursor-canvas", channel: "board", payload: { op:"replace", title:"标题", blocks:[...] } })</code><br/>
                <span style="color:var(--muted-2)">支持 op: replace / append / patch / clear · 块类型: stats / table / chart / diagram / diff / todo / text / callout / columns / box</span>
                <div style="margin-top:8px;font-size:11px;color:var(--muted-2)">若刷新后空白，点“恢复最近一条”会从 sqlite / 收件箱重建</div>
              </div>
            </div>
          </div>
        `;
      } else {
        const blocksHtml = board.blocks.map((b, idx) => renderBlock(b, idx, this.selectedNodeId)).join('');
        stageContentHtml = `
          <div class="canvas">
            <div class="board-head">
              <h1>${esc(board.title)}</h1>
              ${board.subtitle ? `<p>${esc(board.subtitle)}</p>` : ''}
              <div class="board-meta">
                <span class="meta-tag">${board.blocks.length} 块</span>
                <span class="meta-tag mono">${new Date(board.ts).toLocaleString()}</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px">${blocksHtml}</div>
          </div>
        `;
      }

      const footerHtml = `
        <footer class="statusbar">
          <span>本地 · 离线可用 · 数据存 sqlite</span>
          <span class="mono">${board ? `${board.blocks.length} 块` : '0 块'} · ${history.length} 历史</span>
        </footer>
      `;

      const toastHtml = this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '';

      let dialogHtml = '';
      if (this.showHist) {
        const historyRows = history.length
          ? [...history].reverse().map((h, i) => {
              const idx = history.length - 1 - i;
              const active = board && h.ts === board.ts;
              return `
                <div class="hrow${active ? ' active' : ''}">
                  <div class="hrow-main" data-action="restore" data-idx="${idx}" style="cursor:pointer">
                    <div class="hrow-title">${esc(h.title || '未命名')}</div>
                    <div class="hrow-meta">
                      <span class="mono">${h.ts ? new Date(h.ts).toLocaleString() : '—'}</span>
                      <span class="badge">${h.blocks?.length || 0} 块</span>
                      ${active ? `<span class="badge" style="background:var(--accent);color:var(--accent-fg);border-color:var(--accent)">当前</span>` : ''}
                    </div>
                    ${h.subtitle ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.subtitle)}</div>` : ''}
                  </div>
                  <div class="hrow-actions">
                    <button class="btn sm" data-action="restore" data-idx="${idx}">查看</button>
                    <button class="btn sm" data-action="download" data-idx="${idx}">下载</button>
                    <button class="btn sm danger" data-action="delete" data-idx="${idx}">删除</button>
                  </div>
                </div>
              `;
            }).join('')
          : `<div class="empty-hist">暂无历史<br/><span style="font-size:11px">推送后会自动保存到 sqlite，刷新不丢</span></div>`;

        dialogHtml = `
          <dialog open style="display:block">
            <div class="dlg-head">
              <h3>查看历史</h3>
              <button class="btn icon" data-action="close-hist">✕</button>
            </div>
            <div class="dlg-body">
              <div class="hlist">${historyRows}</div>
            </div>
            <div class="dlg-foot">
              <span style="font-size:11px;color:var(--muted)">${history.length ? `共 ${history.length} 条 · 点击“查看”切换主界面` : '暂无数据'}</span>
              <div style="display:flex;gap:8px">
                <button class="btn sm" data-action="close-hist">关闭</button>
                <button class="btn sm danger" data-action="clear-all" ${history.length === 0 && !board ? 'disabled' : ''}>清空</button>
              </div>
            </div>
          </dialog>
        `;
      }

      this.rootEl.innerHTML = `
        <div class="app">
          ${headerHtml}
          <main class="stage">${stageContentHtml}</main>
          ${footerHtml}
          ${toastHtml}
          ${dialogHtml}
        </div>
      `;
    }
  }

  // 启动挂载
  try {
    const rootEl = document.getElementById('root');
    if (!rootEl) throw new Error('缺少 #root 节点');
    window.__appInstance = new BoardApp(rootEl);
    window.__appInstance.render();
    console.log('[board] Zero-dependency Canvas mounted, SQLite ready');
  } catch (err) {
    console.error('[board] mount error', err);
    const errEl = document.getElementById('err');
    if (errEl) {
      errEl.textContent = '⚠ 挂载失败: ' + err.message;
      errEl.className = 'show';
    }
  }
})();
