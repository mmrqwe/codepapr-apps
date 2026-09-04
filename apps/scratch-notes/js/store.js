import { MAX_IMAGES } from './images.js';

export const COLORS = ['gray', 'amber', 'red', 'green', 'cyan'];
export const KINDS = ['text', 'code', 'link', 'image', 'mixed'];
export const STACK_UNPINNED = 80;
const FORBIDDEN_PREFIX = 'inbox:';

function uid() {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForPapr(timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (window.papr?.db) return window.papr;
    await wait(80);
  }
  return window.papr || null;
}

function assertSafeKey(key) {
  const k = String(key || '');
  if (!k.startsWith('notes:')) throw new Error('refusing non-notes key');
  if (k.startsWith(FORBIDDEN_PREFIX) || k.includes('inbox:')) {
    throw new Error('refusing inbox:* keys');
  }
  return k;
}

const mem = new Map();

async function paprGet(key) {
  try {
    if (!window.papr?.db?.get) return undefined;
    return await window.papr.db.get(key);
  } catch {
    return undefined;
  }
}

async function paprSet(key, val) {
  if (!window.papr?.db?.set) return false;
  await window.papr.db.set(key, val);
  return true;
}

export function emptyBucket() {
  return { entries: [] };
}

export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw;
  const id = typeof o.id === 'string' && o.id ? o.id : uid();
  let kind = typeof o.kind === 'string' ? o.kind : 'text';
  if (!KINDS.includes(kind)) kind = 'text';
  const images = Array.isArray(o.images)
    ? o.images.filter((x) => typeof x === 'string' && x.startsWith('data:image/')).slice(0, MAX_IMAGES)
    : [];
  let color = typeof o.color === 'string' ? o.color : 'gray';
  if (!COLORS.includes(color)) color = 'gray';
  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()).slice(0, 12)
    : [];
  const title = typeof o.title === 'string' ? o.title : '';
  const body = typeof o.body === 'string' ? o.body : '';
  if (!title.trim() && !body.trim() && !images.length) return null;
  if (images.length && kind === 'text') kind = body.trim() ? 'mixed' : 'image';
  if (images.length && kind === 'code') kind = 'mixed';
  if (images.length && kind === 'link') kind = 'mixed';
  const now = Date.now();
  return {
    id,
    kind,
    title: title.slice(0, 160),
    body: body.slice(0, 20000),
    images,
    tags,
    color,
    pinned: !!o.pinned,
    createdAt: Number.isFinite(Number(o.createdAt)) ? Number(o.createdAt) : now,
    updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : now,
  };
}

export function normalizeBucket(raw) {
  const entries = Array.isArray(raw?.entries)
    ? raw.entries.map(normalizeEntry).filter(Boolean)
    : (Array.isArray(raw) ? raw.map(normalizeEntry).filter(Boolean) : []);
  return { entries };
}

function pruneUnpinned(entries) {
  const pinned = entries.filter((e) => e.pinned);
  let unpinned = entries.filter((e) => !e.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (unpinned.length > STACK_UNPINNED) {
    unpinned = unpinned.slice(0, STACK_UNPINNED);
  }
  return pinned.concat(unpinned);
}

export async function loadBucket(key) {
  const k = assertSafeKey(key);
  const fromPapr = await paprGet(k);
  if (fromPapr !== undefined) {
    const bucket = normalizeBucket(fromPapr);
    mem.set(k, bucket);
    return bucket;
  }
  if (mem.has(k)) return mem.get(k);
  try {
    const ls = localStorage.getItem(k);
    if (ls) {
      const bucket = normalizeBucket(JSON.parse(ls));
      mem.set(k, bucket);
      return bucket;
    }
  } catch {}
  const empty = emptyBucket();
  mem.set(k, empty);
  return empty;
}

export async function saveBucket(key, bucket) {
  const k = assertSafeKey(key);
  const next = normalizeBucket(bucket);
  next.entries = pruneUnpinned(next.entries);
  mem.set(k, next);
  try { localStorage.setItem(k, JSON.stringify(next)); } catch {}
  try { await paprSet(k, next); } catch {}
  return next;
}

export function inferKind({ body, images, preferred }) {
  const imgs = Array.isArray(images) ? images : [];
  const text = String(body || '').trim();
  if (preferred === 'code' && !imgs.length) return 'code';
  if (preferred === 'link' && !imgs.length) return 'link';
  if (imgs.length && text) return 'mixed';
  if (imgs.length) return 'image';
  if (preferred === 'code') return 'code';
  if (preferred === 'link' || looksLikeLink(text)) return 'link';
  return 'text';
}

export function looksLikeLink(text) {
  const t = String(text || '').trim();
  return /^https?:\/\/\S+$/i.test(t) || /^www\.\S+\.\S+/i.test(t);
}

export function createEntry(partial) {
  const now = Date.now();
  return normalizeEntry({
    id: uid(),
    kind: 'text',
    title: '',
    body: '',
    images: [],
    tags: [],
    color: 'gray',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  });
}
