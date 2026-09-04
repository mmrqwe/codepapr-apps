import { COLORS } from './store.js';
import { copyImageToClipboard } from './images.js';

export const el = {
  scopeBadge: document.getElementById('scopeBadge'),
  searchInput: document.getElementById('searchInput'),
  filterChips: document.getElementById('filterChips'),
  noteTitle: document.getElementById('noteTitle'),
  noteBody: document.getElementById('noteBody'),
  thumbStrip: document.getElementById('thumbStrip'),
  kindToggles: document.getElementById('kindToggles'),
  colorDots: document.getElementById('colorDots'),
  btnSave: document.getElementById('btnSave'),
  pinnedSection: document.getElementById('pinnedSection'),
  pinnedList: document.getElementById('pinnedList'),
  pinnedCount: document.getElementById('pinnedCount'),
  recentSection: document.getElementById('recentSection'),
  recentList: document.getElementById('recentList'),
  recentCount: document.getElementById('recentCount'),
  emptyState: document.getElementById('emptyState'),
  btnMenu: document.getElementById('btnMenu'),
  menuPop: document.getElementById('menuPop'),
  menuExport: document.getElementById('menuExport'),
  menuClearUnpinned: document.getElementById('menuClearUnpinned'),
  menuAbout: document.getElementById('menuAbout'),
  toast: document.getElementById('toast'),
  editDialog: document.getElementById('editDialog'),
  editTitle: document.getElementById('editTitle'),
  editBody: document.getElementById('editBody'),
  editKindToggles: document.getElementById('editKindToggles'),
  editColorDots: document.getElementById('editColorDots'),
  btnEditSave: document.getElementById('btnEditSave'),
  btnEditCancel: document.getElementById('btnEditCancel'),
  btnEditClose: document.getElementById('btnEditClose'),
};

let toastTimer = 0;

export function toast(text) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2200);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const KIND_LABEL = { text: '文本', code: '代码', link: '链接', image: '图片', mixed: '混合' };

export function setActiveGroup(root, attr, value) {
  if (!root) return;
  root.querySelectorAll(`[${attr}]`).forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute(attr) === value);
  });
}

export function renderThumbs(container, images, onRemove) {
  if (!container) return;
  if (!images.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = images.map((src, i) => `
    <div class="thumb">
      <img src="${src}" alt="" />
      <button type="button" class="thumb-x" data-i="${i}" title="移除">×</button>
    </div>
  `).join('');
  container.querySelectorAll('.thumb-x').forEach((btn) => {
    btn.addEventListener('click', () => onRemove(Number(btn.dataset.i)));
  });
}

function firstUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : '';
}

function bodyHtml(entry, expanded) {
  const body = entry.body || '';
  if (entry.kind === 'code') {
    return `<pre class="note-body code">${escapeHtml(body) || ' '}</pre>`;
  }
  if (entry.kind === 'link') {
    const url = firstUrl(body) || body.trim();
    const rest = body.replace(url, '').trim();
    const link = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`
      : escapeHtml(body);
    return `<div class="note-body">${link}${rest ? '\n' + escapeHtml(rest) : ''}</div>`;
  }
  return `<div class="note-body">${escapeHtml(body)}</div>`;
}

function cardHtml(entry, expanded) {
  const title = entry.title ? `<div class="note-title">${escapeHtml(entry.title)}</div>` : '';
  const imgs = (entry.images || []).map((src, i) =>
    `<img src="${src}" alt="" data-copy="${i}" />`
  ).join('');
  const tags = (entry.tags || []).map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  return `
    <article class="note-card color-${entry.color}${expanded ? ' expanded' : ''}" data-id="${escapeHtml(entry.id)}">
      <div class="note-head">
        ${title || `<div class="note-title" style="font-weight:600;color:var(--muted)">${KIND_LABEL[entry.kind] || '笔记'}</div>`}
      </div>
      <div class="note-meta">
        <span class="meta-chip">${KIND_LABEL[entry.kind] || entry.kind}</span>
        ${entry.pinned ? '<span class="meta-chip">钉</span>' : ''}
      </div>
      ${bodyHtml(entry, expanded)}
      ${imgs ? `<div class="note-images">${imgs}</div>` : ''}
      ${tags ? `<div class="note-tags">${tags}</div>` : ''}
      <div class="note-foot">
        <span class="note-time">${formatTime(entry.updatedAt)}</span>
        <div class="note-actions">
          <button type="button" class="btn sm ghost" data-act="expand">${expanded ? '收起' : '展开'}</button>
          <button type="button" class="btn sm ghost" data-act="copy">复制</button>
          ${entry.images?.length ? '<button type="button" class="btn sm ghost" data-act="copyimg">复制图</button>' : ''}
          <button type="button" class="btn sm ghost" data-act="pin">${entry.pinned ? '取消钉' : '钉住'}</button>
          <button type="button" class="btn sm ghost" data-act="color">色</button>
          <button type="button" class="btn sm ghost" data-act="edit">改</button>
          <button type="button" class="btn sm danger" data-act="delete">删</button>
        </div>
      </div>
    </article>
  `;
}

export function filterEntries(entries, { q, filter }) {
  const query = String(q || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (filter === 'image' && !(e.images && e.images.length)) return false;
    if (filter === 'link' && e.kind !== 'link' && e.kind !== 'mixed') return false;
    if (filter === 'link' && e.kind === 'mixed' && !looksUrl(e.body)) return false;
    if (filter === 'pinned' && !e.pinned) return false;
    if (!query) return true;
    const hay = `${e.title}\n${e.body}\n${(e.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(query);
  });
}

function looksUrl(text) {
  return /https?:\/\/\S+/i.test(String(text || ''));
}

export function renderLists({ pinned, recent, expandedIds }) {
  const exp = expandedIds instanceof Set ? expandedIds : new Set();
  const hasAny = pinned.length + recent.length > 0;
  el.emptyState.classList.toggle('hidden', hasAny);
  el.pinnedSection.classList.toggle('hidden', !pinned.length);
  el.recentSection.classList.toggle('hidden', !recent.length);
  el.pinnedCount.textContent = String(pinned.length);
  el.recentCount.textContent = String(recent.length);
  el.pinnedList.innerHTML = pinned.map((e) => cardHtml(e, exp.has(e.id))).join('');
  el.recentList.innerHTML = recent.map((e) => cardHtml(e, exp.has(e.id))).join('');
}

export function bindCardList(root, handlers) {
  if (!root) return;
  root.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    const card = ev.target.closest('.note-card');
    if (!card) return;
    const id = card.getAttribute('data-id');
    if (ev.target.matches('.note-images img')) {
      openLightbox(ev.target.src);
      return;
    }
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'expand') handlers.onExpand(id);
    else if (act === 'copy') handlers.onCopy(id);
    else if (act === 'copyimg') handlers.onCopyImage(id);
    else if (act === 'pin') handlers.onPin(id);
    else if (act === 'delete') handlers.onDelete(id);
    else if (act === 'edit') handlers.onEdit(id);
    else if (act === 'color') handlers.onCycleColor(id);
  });
}

export function openLightbox(src) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${src}" alt="" />`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}

export async function copyText(text) {
  const t = String(text || '');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(t);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

export { copyImageToClipboard, COLORS };
