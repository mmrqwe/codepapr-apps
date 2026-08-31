import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

function loadScope() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(join(dir, 'projectScope.js'), 'utf8');
  const ctx = createContext({});
  runInContext(code, ctx);
  return ctx.__paprProjectScope;
}

test('filters history and inbox by workspaceId; untagged rows stay hidden', () => {
  const ps = loadScope();
  const history = [
    { title: 'A', workspaceId: '/p/a' },
    { title: 'B', workspaceId: '/p/b' },
    { title: 'legacy' },
  ];
  assert.deepEqual(ps.filterRecords(history, '/p/a').map((r) => r.title), ['A']);
  const events = [
    { seq: 1, workspaceId: '/p/a', payload: { title: 'A' } },
    { seq: 2, workspaceId: '/p/b', payload: { title: 'B' } },
    { seq: 3, payload: { title: 'legacy' } },
  ];
  assert.deepEqual(ps.filterEvents(events, '/p/a').map((e) => e.seq), [1]);
});

test('merge empty slice clears one project without wiping the other', () => {
  const ps = loadScope();
  const next = ps.mergeProjectSlice(
    [
      { title: 'A', workspaceId: '/p/a' },
      { title: 'B', workspaceId: '/p/b' },
    ],
    [],
    '/p/a',
  );
  assert.deepEqual(next.map((r) => r.title), ['B']);
  assert.equal(next[0].workspaceId, '/p/b');
});
