import { resolveScope } from './scope.js';
import {
  waitForPapr, loadBucket, saveBucket, createEntry, inferKind, COLORS,
} from './store.js';
import { compressImage, filesFromClipboard, MAX_IMAGES, copyImageToClipboard } from './images.js';
import {
  el, toast, setActiveGroup, renderThumbs, renderLists, bindCardList,
  filterEntries, copyText,
} from './ui.js';

const draft = {
  kind: 'text',
  color: 'gray',
  images: [],
};
const editDraft = { id: '', kind: 'text', color: 'gray' };

let scope = { kind: 'global', key: 'notes:global', badge: '全局', name: '' };
let entries = [];
let filter = 'all';
let query = '';
const expanded = new Set();

function extractTags(text) {
  const tags = [];
  String(text || '').replace(/#([\w\u4e00-\u9fff-]{1,24})/g, (_, t) => {
    if (!tags.includes(t)) tags.push(t);
    return _;
  });
  return tags;
}

function visible() {
  const filtered = filterEntries(entries, { q: query, filter });
  const pinned = filtered.filter((e) => e.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = filtered.filter((e) => !e.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  return { pinned, recent };
}

function render() {
  el.scopeBadge.textContent = scope.badge;
  const { pinned, recent } = visible();
  renderLists({ pinned, recent, expandedIds: expanded });
}

async function persist() {
  await saveBucket(scope.key, { entries });
}

function findEntry(id) {
  return entries.find((e) => e.id === id);
}

async function boot() {
  await waitForPapr(4000);
  try { scope = await resolveScope(); } catch {}
  el.scopeBadge.textContent = scope.badge;
  try {
    const bucket = await loadBucket(scope.key);
    entries = bucket.entries || [];
  } catch (e) {
    entries = [];
  }
  render();
}

function resetComposer() {
  draft.kind = 'text';
  draft.color = 'gray';
  draft.images = [];
  el.noteTitle.value = '';
  el.noteBody.value = '';
  el.noteBody.classList.remove('kind-code');
  setActiveGroup(el.kindToggles, 'data-kind', 'text');
  setActiveGroup(el.colorDots, 'data-color', 'gray');
  renderThumbs(el.thumbStrip, [], () => {});
}

function refreshDraftThumbs() {
  renderThumbs(el.thumbStrip, draft.images, (i) => {
    draft.images.splice(i, 1);
    refreshDraftThumbs();
  });
}

async function addImages(files) {
  const room = MAX_IMAGES - draft.images.length;
  if (room <= 0) {
    toast(`每条最多 ${MAX_IMAGES} 张图`);
    return;
  }
  const take = files.slice(0, room);
  for (const f of take) {
    try {
      const c = await compressImage(f);
      draft.images.push(c.dataUrl);
    } catch {
      toast('图片处理失败');
    }
  }
  if (files.length > room) toast(`已截到 ${MAX_IMAGES} 张`);
  refreshDraftThumbs();
}

async function saveNote() {
  const title = el.noteTitle.value.trim();
  const body = el.noteBody.value;
  if (!title && !body.trim() && !draft.images.length) {
    toast('先写点什么');
    return;
  }
  const kind = inferKind({ body, images: draft.images, preferred: draft.kind });
  const entry = createEntry({
    kind,
    title,
    body,
    images: draft.images.slice(),
    tags: extractTags(`${title} ${body}`),
    color: draft.color,
    pinned: false,
  });
  if (!entry) {
    toast('内容无效');
    return;
  }
  entries.unshift(entry);
  await persist();
  resetComposer();
  render();
  toast('已存入');
}

function wireComposer() {
  el.kindToggles.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-kind]');
    if (!btn) return;
    draft.kind = btn.getAttribute('data-kind');
    setActiveGroup(el.kindToggles, 'data-kind', draft.kind);
    el.noteBody.classList.toggle('kind-code', draft.kind === 'code');
  });
  el.colorDots.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-color]');
    if (!btn) return;
    draft.color = btn.getAttribute('data-color');
    setActiveGroup(el.colorDots, 'data-color', draft.color);
  });
  el.btnSave.addEventListener('click', () => { saveNote(); });
  el.noteBody.addEventListener('paste', async (ev) => {
    const files = filesFromClipboard(ev);
    if (!files.length) return;
    ev.preventDefault();
    await addImages(files);
  });
  el.noteBody.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      ev.preventDefault();
      saveNote();
    }
  });
}

function wireToolbar() {
  el.filterChips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.getAttribute('data-filter');
    setActiveGroup(el.filterChips, 'data-filter', filter);
    render();
  });
  el.searchInput.addEventListener('input', () => {
    query = el.searchInput.value;
    render();
  });
  el.btnMenu.addEventListener('click', (ev) => {
    ev.stopPropagation();
    el.menuPop.classList.toggle('hidden');
  });
  document.addEventListener('click', () => el.menuPop.classList.add('hidden'));
  el.menuPop.addEventListener('click', (ev) => ev.stopPropagation());
  el.menuExport.addEventListener('click', async () => {
    el.menuPop.classList.add('hidden');
    try {
      await copyText(JSON.stringify({ scope, entries }, null, 2));
      toast('已复制 JSON');
    } catch {
      toast('复制失败');
    }
  });
  el.menuClearUnpinned.addEventListener('click', async () => {
    el.menuPop.classList.add('hidden');
    const n = entries.filter((e) => !e.pinned).length;
    if (!n) { toast('没有未钉笔记'); return; }
    if (!confirm(`清空 ${n} 条未钉笔记？`)) return;
    entries = entries.filter((e) => e.pinned);
    await persist();
    render();
    toast('已清空未钉');
  });
  el.menuAbout.addEventListener('click', () => {
    el.menuPop.classList.add('hidden');
    toast('仅本人 · 按项目分桶 · 无 Agent');
  });
}

function nextColor(cur) {
  const i = COLORS.indexOf(cur);
  return COLORS[(i + 1) % COLORS.length];
}

function wireCards() {
  const handlers = {
    onExpand(id) {
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
    },
    async onCopy(id) {
      const e = findEntry(id);
      if (!e) return;
      const text = [e.title, e.body].filter(Boolean).join('\n');
      try {
        await copyText(text);
        toast('已复制文本');
      } catch { toast('复制失败'); }
    },
    async onCopyImage(id) {
      const e = findEntry(id);
      const src = e?.images?.[0];
      if (!src) { toast('没有图片'); return; }
      try {
        await copyImageToClipboard(src);
        toast('已复制图片');
      } catch { toast('复制图片失败'); }
    },
    async onPin(id) {
      const e = findEntry(id);
      if (!e) return;
      e.pinned = !e.pinned;
      e.updatedAt = Date.now();
      await persist();
      render();
    },
    async onDelete(id) {
      const e = findEntry(id);
      if (!e) return;
      entries = entries.filter((x) => x.id !== id);
      await persist();
      render();
      toast('已删除');
    },
    onEdit(id) {
      openEdit(id);
    },
    async onCycleColor(id) {
      const e = findEntry(id);
      if (!e) return;
      e.color = nextColor(e.color);
      e.updatedAt = Date.now();
      await persist();
      render();
    },
  };
  bindCardList(el.pinnedList, handlers);
  bindCardList(el.recentList, handlers);
}

function openEdit(id) {
  const e = findEntry(id);
  if (!e) return;
  editDraft.id = e.id;
  editDraft.kind = e.kind === 'mixed' || e.kind === 'image' ? 'text' : e.kind;
  editDraft.color = e.color;
  el.editTitle.value = e.title || '';
  el.editBody.value = e.body || '';
  setActiveGroup(el.editKindToggles, 'data-kind', editDraft.kind);
  setActiveGroup(el.editColorDots, 'data-color', editDraft.color);
  if (typeof el.editDialog.showModal === 'function') el.editDialog.showModal();
  else el.editDialog.setAttribute('open', '');
}

function closeEdit() {
  if (typeof el.editDialog.close === 'function') el.editDialog.close();
  else el.editDialog.removeAttribute('open');
}

function wireEdit() {
  el.editKindToggles.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-kind]');
    if (!btn) return;
    editDraft.kind = btn.getAttribute('data-kind');
    setActiveGroup(el.editKindToggles, 'data-kind', editDraft.kind);
  });
  el.editColorDots.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-color]');
    if (!btn) return;
    editDraft.color = btn.getAttribute('data-color');
    setActiveGroup(el.editColorDots, 'data-color', editDraft.color);
  });
  el.btnEditCancel.addEventListener('click', closeEdit);
  el.btnEditClose.addEventListener('click', closeEdit);
  el.btnEditSave.addEventListener('click', async () => {
    const e = findEntry(editDraft.id);
    if (!e) { closeEdit(); return; }
    e.title = el.editTitle.value.trim().slice(0, 160);
    e.body = el.editBody.value.slice(0, 20000);
    e.kind = inferKind({ body: e.body, images: e.images, preferred: editDraft.kind });
    e.color = editDraft.color;
    e.tags = extractTags(`${e.title} ${e.body}`);
    e.updatedAt = Date.now();
    await persist();
    closeEdit();
    render();
    toast('已保存');
  });
}

wireComposer();
wireToolbar();
wireCards();
wireEdit();
boot();
