/**
 * weather-hud 存储层
 * 三级回退：papr.db (sqlite) → localStorage → 内存
 * papr.db 与插件同目录：全局安装 ~/.codepapr/apps/<appId>/db.sqlite，项目安装 .CodePapr/apps/<appId>/db.sqlite
 * 天气跟用户走，不按当前打开的项目拆库、也不打所属项目字段
 * localStorage 仅为宿主时序（manifest not loaded）时的临时回退，数据会在 papr.db 就绪后自动迁回 sqlite
 */
const LS_PREFIX = "weather-hud:";
const MEM = new Map();
let _backend = "unknown"; // papr.db (sqlite) | localStorage | memory
let _lastError = "";
let _migrateTimer = null;

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch (e) {
    return undefined;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
    return true;
  } catch (e) {
    _lastError = e?.message || String(e);
    return false;
  }
}
function lsDel(key) {
  try { localStorage.removeItem(LS_PREFIX + key); return true; } catch { return false; }
}
function memGet(key) { return MEM.has(key) ? MEM.get(key) : undefined; }
function memSet(key, val) { MEM.set(key, val); return true; }
function memDel(key) { MEM.delete(key); return true; }

export function getPapr() { return window.papr || null; }
export function getBackend() { return _backend; }
export function getLastError() { return _lastError; }

export async function waitForPapr(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.papr?.db) return window.papr;
    await new Promise(r => setTimeout(r, 80));
  }
  return window.papr || null;
}
function scheduleMigrate(){
  if(_migrateTimer) return;
  _migrateTimer = setTimeout(async()=>{
    _migrateTimer=null;
    if(!window.papr?.db) return;
    try{
      const keys=[];
      try{
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(k && k.startsWith(LS_PREFIX)) keys.push(k.slice(LS_PREFIX.length));
        }
      }catch{}
      for(const k of keys){
        const v=lsGet(k);
        if(v===undefined) continue;
        const cur=await tryPapr("get",k);
        if(cur.ok && cur.value!==undefined) continue; // sqlite 已有值，不覆盖
        await tryPapr("set",k,v);
      }
      if(keys.length) console.log("[weather-db] migrated",keys.length,"keys from localStorage to papr.db (sqlite)");
    }catch(e){ console.warn("[weather-db] migrate failed",e); }
  }, 1200);
}

// 尝试 papr.db 操作，带重试与错误捕获
async function tryPapr(op, key, val) {
  const papr = window.papr;
  if (!papr?.db) return { ok: false, reason: "no papr.db" };
  try {
    if (op === "get") {
      const v = await papr.db.get(key);
      // papr.db.get 返回 undefined 表示无值，也算成功
      return { ok: true, value: v };
    }
    if (op === "set") {
      await papr.db.set(key, val);
      // 回读校验
      const check = await papr.db.get(key);
      // 允许 undefined / null 的校验宽松处理
      return { ok: true, value: check };
    }
    if (op === "delete") {
      await papr.db.delete(key);
      return { ok: true };
    }
    if (op === "keys") {
      const ks = await papr.db.keys();
      return { ok: true, value: ks };
    }
  } catch (e) {
    const msg = e?.message || String(e);
    _lastError = msg;
    // manifest not loaded 等宿主时序错误，直接视为不可用，回退
    return { ok: false, reason: msg };
  }
  return { ok: false, reason: "unknown op" };
}

export async function dbGet(key) {
  // 1) 优先 papr.db (sqlite)
  const r1 = await tryPapr("get", key);
  if (r1.ok) {
    if (r1.value !== undefined){
      _backend = "papr.db (sqlite)";
      return r1.value;
    }
    // sqlite 为空，尝试从 localStorage 迁回（旧数据）
    const ls = lsGet(key);
    if (ls !== undefined) {
      // 后台迁回 sqlite，不阻塞读取
      tryPapr("set", key, ls).then(res=>{
        if(res.ok) console.log("[weather-db] migrated key",key,"to sqlite");
      });
      _backend = "localStorage (待迁回 sqlite)";
      return ls;
    }
    const mem = memGet(key);
    if (mem !== undefined) {
      _backend = "memory";
      return mem;
    }
    _backend = "papr.db (sqlite)";
    return undefined;
  }
  // 2) papr 不可用，回退 localStorage
  const ls = lsGet(key);
  if (ls !== undefined) {
    _backend = "localStorage (papr 不可用，回退)";
    if(r1.reason) _lastError=r1.reason;
    scheduleMigrate();
    return ls;
  }
  // 3) memory
  const mem = memGet(key);
  if (mem !== undefined) {
    _backend = "memory";
    return mem;
  }
  if (r1.reason) _lastError = r1.reason;
  _backend = r1.reason ? `localStorage(空, 回退原因: ${r1.reason})` : "memory";
  return undefined;
}

export async function dbSet(key, val) {
  // 优先 papr.db (sqlite)
  const r1 = await tryPapr("set", key, val);
  if (r1.ok) {
    _backend = "papr.db (sqlite)";
    // 同步镜像到 LS 与内存，便于降级恢复，但主份是 sqlite
    lsSet(key, val);
    memSet(key, val);
    return { ok: true, backend: "papr.db (sqlite)" };
  }
  // 回退 localStorage（临时）
  const lsOk = lsSet(key, val);
  if (lsOk) {
    memSet(key, val);
    _backend = "localStorage (papr 不可用，回退)";
    scheduleMigrate();
    return { ok: true, backend: "localStorage (回退)", warn: r1.reason };
  }
  // 回退 memory
  memSet(key, val);
  _backend = "memory";
  return { ok: true, backend: "memory", warn: _lastError || r1.reason };
}

export async function dbDelete(key) {
  const r1 = await tryPapr("delete", key);
  lsDel(key);
  memDel(key);
  if (r1.ok) {
    _backend = "papr.db (sqlite)";
    return { ok: true, backend: "papr.db (sqlite)" };
  }
  return { ok: true, backend: _backend, warn: r1.reason };
}

export async function dbKeys() {
  const r1 = await tryPapr("keys");
  if (r1.ok && Array.isArray(r1.value)) {
    _backend = "papr.db (sqlite)";
    return r1.value;
  }
  // 合并 LS 与 memory 的 keys
  const keys = new Set();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.add(k.slice(LS_PREFIX.length));
    }
  } catch {}
  for (const k of MEM.keys()) keys.add(k);
  return [...keys];
}

// 自检：写入回读
export async function selfTest() {
  const testKey = "__selftest__";
  const testVal = { t: Date.now(), v: Math.random().toString(36).slice(2) };
  const w = await dbSet(testKey, testVal);
  const r = await dbGet(testKey);
  await dbDelete(testKey);
  const pass = r && r.v === testVal.v;
  return {
    pass,
    writeBackend: w.backend,
    readBackend: getBackend(),
    warn: w.warn || "",
    lastError: getLastError(),
    readValue: r,
    writeValue: testVal,
  };
}

// 兼容旧代码的 DB 对象
export const db = {
  get: dbGet,
  set: async (k, v) => { const r = await dbSet(k, v); if (!r.ok) throw new Error(r.warn || "set failed"); return r; },
  delete: dbDelete,
  keys: dbKeys,
};
