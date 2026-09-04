import {
  STATE_KEY,
  INBOX_KEY,
  emptyBoard,
  normalizeBoard,
  applyDecisionsPayload,
  chooseOption,
  setStatus,
  clearResolved,
  buildItemSummary,
  buildBoardSummary,
} from './state.js';

/** @typedef {import('./state.js').BoardState} BoardState */
/** @typedef {import('./state.js').DecisionItem} DecisionItem */

/** @type {BoardState} */
let board = emptyBoard();
let doneExpanded = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;

const el = {
  openBadge: document.getElementById('openBadge'),
  subtitle: document.getElementById('subtitle'),
  emptyState: document.getElementById('emptyState'),
  openSection: document.getElementById('openSection'),
  openList: document.getElementById('openList'),
  boardTitle: document.getElementById('boardTitle'),
  doneSection: document.getElementById('doneSection'),
  doneList: document.getElementById('doneList'),
  doneCount: document.getElementById('doneCount'),
  doneChev: document.getElementById('doneChev'),
  btnToggleDone: document.getElementById('btnToggleDone'),
  btnClearDone: document.getElementById('btnClearDone'),
  toast: document.getElementById('toast'),
};

function paprReady() {
  return typeof window.papr !== 'undefined' && window.papr;
}

async function loadState() {
  const api = paprReady();
  if (!api?.db) return;
  try {
    const saved = await api.db.get(STATE_KEY);
    if (saved) board = normalizeBoard(saved);
  } catch {
    /* ignore */
  }
  try {
    const history = await api.db.get(INBOX_KEY);
    if (Array.isArray(history) && history.length) {
      // Replay chronologically; last replace wins semantics via apply
      const sorted = [...history].sort((a, b) => (a?.seq ?? 0) - (b?.seq ?? 0));
      for (const evt of sorted) {
        board = applyDecisionsPayload(board, evt?.payload ?? evt);
      }
    }
  } catch {
    /* ignore */
  }
}

async function persist() {
  const api = paprReady();
  if (!api?.db?.set) return;
  try {
    await api.db.set(STATE_KEY, board);
  } catch {
    /* ignore */
  }
}

function showToast(text) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast?.classList.add('hidden'), 5200);
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function openItems() {
  return board.items.filter((it) => it.status === 'open');
}

function doneItems() {
  return board.items.filter((it) => it.status !== 'open');
}

function renderOptionDetails(opt, recommendId) {
  const rec = opt.id === recommendId ? '<span class="rec-badge">推荐</span>' : '';
  const risk = opt.risk ? `<span class="chip">${escapeHtml(opt.risk)}</span>` : '';
  let pc = '';
  if ((opt.pros && opt.pros.length) || (opt.cons && opt.cons.length)) {
    pc = `<div class="pros-cons">
      <div class="pros"><strong>利</strong><ul>${(opt.pros || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>
      <div class="cons"><strong>弊</strong><ul>${(opt.cons || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>
    </div>`;
  }
  return `<div class="opt-head">${escapeHtml(opt.label)} ${rec} ${risk}</div>${pc}`;
}

/**
 * @param {DecisionItem} item
 * @param {boolean} isDone
 */
function renderCard(item, isDone) {
  const card = document.createElement('article');
  card.className = `card${item.blocking ? ' blocking' : ''}${isDone ? ' done-item' : ''}`;
  card.dataset.id = item.id;

  const chips = [];
  if (item.blocking) chips.push('<span class="chip warn">阻塞</span>');
  if (item.status === 'chosen') chips.push('<span class="chip ok">已选</span>');
  if (item.status === 'deferred') chips.push('<span class="chip">稍后</span>');
  if (item.status === 'dismissed') chips.push('<span class="chip">已否决</span>');

  const impact =
    item.impact && item.impact.length
      ? `<div class="impact">影响：${item.impact.map(escapeHtml).join(' · ')}</div>`
      : '';

  if (isDone) {
    const summary = item.status === 'chosen' ? buildItemSummary(item) : `「${item.question}」→ ${item.status}`;
    card.innerHTML = `
      <div class="meta">${chips.join('')}</div>
      <div class="q">${escapeHtml(item.question)}</div>
      <div class="done-summary">${escapeHtml(summary)}</div>
      <div class="actions">
        <button type="button" class="btn ghost" data-act="reopen">重新打开</button>
        <button type="button" class="btn" data-act="copy-one">复制</button>
      </div>`;
  } else {
    const opts = item.options
      .map((opt) => {
        const cls = [
          'option',
          opt.id === item.recommend ? 'recommend' : '',
          item.choice === opt.id ? 'chosen' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${cls}" data-act="pick" data-opt="${escapeAttr(opt.id)}">${renderOptionDetails(opt, item.recommend)}</button>`;
      })
      .join('');
    card.innerHTML = `
      <div class="meta">${chips.join('')}</div>
      <div class="q">${escapeHtml(item.question)}</div>
      <div class="options">${opts}</div>
      ${impact}
      <div class="actions">
        <button type="button" class="btn ghost" data-act="defer">稍后</button>
        <button type="button" class="btn ghost" data-act="dismiss">否决</button>
      </div>
      <div class="impact" style="margin-top:8px">点选项即选用；Plan 将按此继续执行。</div>`;
  }

  card.addEventListener('click', async (ev) => {
    const t = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target.closest('[data-act]') : null);
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'pick') {
      const optId = t.dataset.opt;
      if (!optId) return;
      board = chooseOption(board, item.id, optId);
      await persist();
      render();
      const summary = buildBoardSummary(board);
      const ok = await copyText(summary);
      showToast((ok ? '已复制已决摘要，可粘贴进对话：\n' : '已决摘要（请手动复制）：\n') + summary);
      return;
    }
    if (act === 'defer') {
      board = setStatus(board, item.id, 'deferred');
      await persist();
      render();
      return;
    }
    if (act === 'dismiss') {
      board = setStatus(board, item.id, 'dismissed');
      await persist();
      render();
      return;
    }
    if (act === 'reopen') {
      board = {
        ...board,
        items: board.items.map((it) =>
          it.id === item.id ? { ...it, status: 'open', choice: null } : it,
        ),
      };
      await persist();
      render();
      return;
    }
    if (act === 'copy-one') {
      const text = item.status === 'chosen' ? buildItemSummary(item) : item.question;
      const ok = await copyText(text);
      showToast(ok ? '已复制' : text);
    }
  });

  return card;
}

function render() {
  const opens = openItems();
  const dones = doneItems();

  if (el.openBadge) {
    el.openBadge.textContent = `${opens.length} 待决`;
    el.openBadge.classList.toggle('has-open', opens.length > 0);
  }
  if (el.subtitle) {
    el.subtitle.textContent = board.context
      ? board.context
      : board.title || 'Plan 专用';
  }

  const hasAny = board.items.length > 0;
  el.emptyState?.classList.toggle('hidden', hasAny);
  el.openSection?.classList.toggle('hidden', opens.length === 0);
  el.doneSection?.classList.toggle('hidden', dones.length === 0);

  if (el.boardTitle) el.boardTitle.textContent = board.title || '';
  if (el.openList) {
    el.openList.innerHTML = '';
    for (const it of opens) el.openList.appendChild(renderCard(it, false));
  }
  if (el.doneCount) el.doneCount.textContent = String(dones.length);
  if (el.doneChev) el.doneChev.textContent = doneExpanded ? '▾' : '▸';
  if (el.doneList) {
    el.doneList.classList.toggle('hidden', !doneExpanded);
    el.doneList.innerHTML = '';
    if (doneExpanded) {
      for (const it of dones) el.doneList.appendChild(renderCard(it, true));
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function onInboxEvent(evt) {
  const payload = evt?.payload ?? evt;
  board = applyDecisionsPayload(board, payload);
  void persist().then(render);
}

async function boot() {
  await loadState();
  render();

  el.btnToggleDone?.addEventListener('click', () => {
    doneExpanded = !doneExpanded;
    render();
  });
  el.btnClearDone?.addEventListener('click', async () => {
    board = clearResolved(board);
    await persist();
    render();
  });

  const api = paprReady();
  if (api?.events?.on) {
    api.events.on('decisions', onInboxEvent);
  }
}

boot();
