/** @typedef {{ id: string, label: string, pros?: string[], cons?: string[], risk?: string }} DecisionOption */
/** @typedef {{ id: string, question: string, options: DecisionOption[], recommend?: string, status: string, choice?: string|null, blocking?: boolean, impact?: string[] }} DecisionItem */
/** @typedef {{ title: string, context: string, items: DecisionItem[] }} BoardState */

export const STATE_KEY = 'board:state';
export const INBOX_KEY = 'inbox:decisions';

/** @returns {BoardState} */
export function emptyBoard() {
  return { title: '', context: '', items: [] };
}

/**
 * @param {unknown} raw
 * @returns {BoardState}
 */
export function normalizeBoard(raw) {
  if (!raw || typeof raw !== 'object') return emptyBoard();
  const o = /** @type {Record<string, unknown>} */ (raw);
  const items = Array.isArray(o.items) ? o.items.map(normalizeItem).filter(Boolean) : [];
  return {
    title: typeof o.title === 'string' ? o.title : '',
    context: typeof o.context === 'string' ? o.context : '',
    items: /** @type {DecisionItem[]} */ (items),
  };
}

/**
 * @param {unknown} raw
 * @returns {DecisionItem | null}
 */
function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : '';
  const question = typeof o.question === 'string' ? o.question.trim() : '';
  if (!id || !question) return null;
  const options = Array.isArray(o.options)
    ? o.options.map(normalizeOption).filter(Boolean).slice(0, 4)
    : [];
  if (options.length < 2) return null;
  const status = ['open', 'chosen', 'deferred', 'dismissed'].includes(/** @type {string} */ (o.status))
    ? /** @type {string} */ (o.status)
    : 'open';
  return {
    id,
    question,
    options: /** @type {DecisionOption[]} */ (options),
    recommend: typeof o.recommend === 'string' ? o.recommend : undefined,
    status,
    choice: typeof o.choice === 'string' ? o.choice : null,
    blocking: o.blocking === true,
    impact: Array.isArray(o.impact)
      ? o.impact.filter((x) => typeof x === 'string').slice(0, 8)
      : undefined,
  };
}

/**
 * @param {unknown} raw
 * @returns {DecisionOption | null}
 */
function normalizeOption(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : '';
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  if (!id || !label) return null;
  return {
    id,
    label,
    pros: Array.isArray(o.pros) ? o.pros.filter((x) => typeof x === 'string').slice(0, 4) : undefined,
    cons: Array.isArray(o.cons) ? o.cons.filter((x) => typeof x === 'string').slice(0, 4) : undefined,
    risk: typeof o.risk === 'string' ? o.risk : undefined,
  };
}

/**
 * @param {BoardState} board
 * @param {unknown} payload
 * @returns {BoardState}
 */
export function applyDecisionsPayload(board, payload) {
  if (!payload || typeof payload !== 'object') return board;
  const p = /** @type {Record<string, unknown>} */ (payload);
  const op = typeof p.op === 'string' ? p.op : 'replace';

  if (op === 'clear') return emptyBoard();

  const incoming = normalizeBoard({
    title: p.title ?? board.title,
    context: p.context ?? board.context,
    items: p.items,
  });

  if (op === 'replace') {
    return {
      title: incoming.title || board.title,
      context: incoming.context || board.context,
      items: incoming.items.slice(0, 5),
    };
  }

  if (op === 'append') {
    const map = new Map(board.items.map((it) => [it.id, it]));
    for (const it of incoming.items) {
      if (!map.has(it.id) && map.size < 5) map.set(it.id, it);
    }
    return {
      title: incoming.title || board.title,
      context: incoming.context || board.context,
      items: [...map.values()],
    };
  }

  if (op === 'patch') {
    const map = new Map(board.items.map((it) => [it.id, { ...it }]));
    for (const it of incoming.items) {
      const prev = map.get(it.id);
      if (!prev) {
        if (map.size < 5) map.set(it.id, it);
        continue;
      }
      map.set(it.id, {
        ...prev,
        ...it,
        options: it.options?.length ? it.options : prev.options,
        impact: it.impact ?? prev.impact,
      });
    }
    return {
      title: typeof p.title === 'string' ? p.title : board.title,
      context: typeof p.context === 'string' ? p.context : board.context,
      items: [...map.values()].slice(0, 5),
    };
  }

  return board;
}

/**
 * @param {BoardState} board
 * @param {string} decisionId
 * @param {string} optionId
 */
export function chooseOption(board, decisionId, optionId) {
  return {
    ...board,
    items: board.items.map((it) =>
      it.id === decisionId ? { ...it, status: 'chosen', choice: optionId } : it,
    ),
  };
}

/**
 * @param {BoardState} board
 * @param {string} decisionId
 * @param {'deferred'|'dismissed'} status
 */
export function setStatus(board, decisionId, status) {
  return {
    ...board,
    items: board.items.map((it) =>
      it.id === decisionId ? { ...it, status, choice: null } : it,
    ),
  };
}

/**
 * @param {BoardState} board
 */
export function clearResolved(board) {
  return {
    ...board,
    items: board.items.filter((it) => it.status === 'open'),
  };
}

/**
 * @param {DecisionItem} item
 */
export function buildItemSummary(item) {
  const opt = item.options.find((o) => o.id === item.choice);
  if (!opt) return `已决「${item.question}」`;
  return `已决：${item.question} → ${opt.label}`;
}

/**
 * @param {BoardState} board
 */
export function buildBoardSummary(board) {
  const chosen = board.items.filter((it) => it.status === 'chosen' && it.choice);
  if (!chosen.length) return '';
  const lines = chosen.map((it) => `- ${buildItemSummary(it)}`);
  const head = board.context ? `上下文：${board.context}\n` : '';
  return `${head}请遵守以下已决约束（Plan 按此继续执行）：\n${lines.join('\n')}`;
}
