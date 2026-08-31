/* 看板按所属项目过滤。数据与插件同目录；未打标的旧记录不显示。 */
(function (root) {
  function normalizeWorkspaceId(path) {
    return String(path || '').trim().replace(/[/\\]+$/, '');
  }
  function recordWorkspaceId(record) {
    if (!record || typeof record !== 'object') return '';
    return normalizeWorkspaceId(record.workspaceId || record.workspacePath || '');
  }
  function eventWorkspaceId(ev) {
    if (!ev || typeof ev !== 'object') return '';
    const tagged = normalizeWorkspaceId(ev.workspaceId);
    if (tagged) return tagged;
    return recordWorkspaceId(ev.payload);
  }
  function belongsToProject(record, workspaceId) {
    const id = normalizeWorkspaceId(workspaceId);
    if (!id) return false;
    return recordWorkspaceId(record) === id;
  }
  function eventBelongsToProject(ev, workspaceId) {
    const id = normalizeWorkspaceId(workspaceId);
    if (!id) return false;
    const evId = eventWorkspaceId(ev);
    if (!evId) return false;
    return evId === id;
  }
  function stampRecord(record, workspaceId, workspaceName) {
    if (!record || typeof record !== 'object') return record;
    return Object.assign({}, record, {
      workspaceId: normalizeWorkspaceId(workspaceId),
      workspaceName: workspaceName || record.workspaceName || ''
    });
  }
  function filterRecords(list, workspaceId) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (r) { return belongsToProject(r, workspaceId); });
  }
  function filterEvents(list, workspaceId) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (ev) { return eventBelongsToProject(ev, workspaceId); });
  }
  function mergeProjectSlice(all, projectSlice, workspaceId, workspaceName) {
    const id = normalizeWorkspaceId(workspaceId);
    const others = (Array.isArray(all) ? all : []).filter(function (r) {
      return !belongsToProject(r, id);
    });
    const stamped = (Array.isArray(projectSlice) ? projectSlice : []).map(function (r) {
      return stampRecord(r, id, workspaceName);
    });
    return others.concat(stamped);
  }
  function clearedAtForProject(raw, workspaceId) {
    const id = normalizeWorkspaceId(workspaceId);
    if (!id) return 0;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const n = Number(raw[id]);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }
  function writeClearedAt(raw, workspaceId, ts) {
    const id = normalizeWorkspaceId(workspaceId);
    const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.assign({}, raw) : {};
    if (id) map[id] = ts;
    return map;
  }
  root.__paprProjectScope = {
    normalizeWorkspaceId: normalizeWorkspaceId,
    recordWorkspaceId: recordWorkspaceId,
    eventWorkspaceId: eventWorkspaceId,
    belongsToProject: belongsToProject,
    eventBelongsToProject: eventBelongsToProject,
    stampRecord: stampRecord,
    filterRecords: filterRecords,
    filterEvents: filterEvents,
    mergeProjectSlice: mergeProjectSlice,
    clearedAtForProject: clearedAtForProject,
    writeClearedAt: writeClearedAt
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
