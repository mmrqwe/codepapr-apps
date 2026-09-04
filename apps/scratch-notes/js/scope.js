/**
 * Resolve current workspace/folder vs global bucket.
 * Host sets data-theme/data-mode via papr SDK; workspace via papr.app.info().
 */
const GLOBAL_KEY = 'notes:global';

export function normalizePath(path) {
  const raw = String(path || '').trim().replace(/[/\\]+$/, '');
  if (!raw) return '';
  const safe = raw.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return safe || '';
}

function basename(path) {
  const s = String(path || '').replace(/[/\\]+$/, '');
  const parts = s.split(/[/\\]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : s;
}

function pickPath(info) {
  if (!info || typeof info !== 'object') return '';
  const keys = [
    'workspacePath', 'workspaceId', 'folderPath', 'projectPath',
    'cwd', 'root', 'path', 'workspace'
  ];
  for (const k of keys) {
    const v = info[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  if (info.workspace && typeof info.workspace === 'object') {
    const nested = info.workspace.path || info.workspace.id || info.workspace.root;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return '';
}

function pickName(info, path) {
  if (!info || typeof info !== 'object') return basename(path);
  const name = info.workspaceName || info.projectName || info.folderName || info.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return basename(path);
}

async function tryInfo(papr) {
  const fns = [];
  if (papr?.app?.info) fns.push(() => papr.app.info());
  if (papr?.workspace?.info) fns.push(() => papr.workspace.info());
  if (papr?.context?.info) fns.push(() => papr.context.info());
  if (typeof papr?.info === 'function') fns.push(() => papr.info());
  for (const fn of fns) {
    try {
      const info = await fn();
      if (info && typeof info === 'object') return info;
    } catch {}
  }
  return null;
}

/**
 * @returns {Promise<{ kind: 'project'|'global', key: string, label: string, badge: string, path: string, name: string }>} 
 */
export async function resolveScope() {
  const papr = window.papr;
  let info = null;
  try { info = await tryInfo(papr); } catch {}
  const path = pickPath(info);
  const safe = normalizePath(path);
  if (safe) {
    const name = pickName(info, path);
    return {
      kind: 'project',
      key: `notes:ws:${safe}`,
      label: name,
      badge: `项目: ${name}`,
      path,
      name,
    };
  }
  return {
    kind: 'global',
    key: GLOBAL_KEY,
    label: '全局',
    badge: '全局',
    path: '',
    name: '',
  };
}

export { GLOBAL_KEY };
