import { state, skillById } from "./state.js";
import { api } from "./utils.js";
import { adaptiveRangeFor } from "./adaptive.js";

export function outlineOf(skillId) {
  try {
    const v = state.settings["outline:" + skillId];
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}
export async function saveOutline(skillId, outline) {
  const v = JSON.stringify(outline);
  state.settings["outline:" + skillId] = v;
  try {
    await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "outline:" + skillId, value: v }) });
  } catch (e) {}
}
export async function clearOutline(skillId) {
  try { delete state.settings["outline:" + skillId]; } catch (e) {}
  try { await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "outline:" + skillId, value: "" }) }); } catch (e) {}
  try { await api("/api/lesson-sections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_id: skillId, sections: [] }) }); } catch (e) {}
  try { await api("/api/lesson", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_id: skillId, content: "" }) }); } catch (e) {}
}
export function isOutlineStale(sk, outline) {
  if (!outline || !outline.length) return false;
  const rg = adaptiveRangeFor(sk);
  if (outline.length < rg.minS || outline.length > rg.maxS + 2) return true;
  const thin = outline.filter(s => Number(s.est_chars) < rg.estMin - 50).length;
  if (thin >= Math.ceil(outline.length / 2)) return true;
  const genericTitles = ["总览：整体框架与直觉","核心概念与关键内容","重点深入：例子与辨析"];
  const genericCount = outline.filter(s => genericTitles.includes(String(s.title))).length;
  if (genericCount >= 2) return true;
  return false;
}
export function isSectionsThin(sk, sections) {
  if (!sections || !sections.length) return false;
  const rg = adaptiveRangeFor(sk);
  const total = sections.reduce((s, x) => s + (x && x.content ? x.content.length : 0), 0);
  const expectedMin = rg.minS * rg.estMin * 0.6;
  return total > 0 && total < expectedMin;
}
export function readSecsOf(skillId) {
  try { const v = state.settings["read-secs:" + skillId]; const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch(e){ return []; }
}
export function markSectionRead(skillId, idx) {
  try {
    const a = readSecsOf(skillId);
    if (!a.includes(idx)) { a.push(idx); a.sort((x,y)=>x-y); state.settings["read-secs:" + skillId] = JSON.stringify(a); api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "read-secs:" + skillId, value: JSON.stringify(a) }) }).catch(()=>{}); }
  } catch(e){}
}
export function saveLastSkill(domain, skillId) {
  state.settings["last-skill:" + domain] = skillId;
  api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "last-skill:" + domain, value: skillId }) }).catch(()=>{});
}
export function saveLastSection(skillId, idx) {
  state.settings["last-section:" + skillId] = String(idx);
  api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "last-section:" + skillId, value: String(idx) }) }).catch(()=>{});
}
export function getLastSkill(domain) { return state.settings["last-skill:" + domain] || null; }
export function getLastSection(skillId) {
  const v = state.settings["last-section:" + skillId];
  return v != null ? Number(v) : null;
}
export function restoreSectionIdx(skillId, n) {
  const v = getLastSection(skillId);
  if (v != null && v >= 0 && v < n) return v;
  return 0;
}
export function adjacentSkills(sk) {
  const all = state.skills.filter(s => s.domain === sk.domain);
  const idx = all.findIndex(s => s.id === sk.id);
  return { prev: idx > 0 ? all[idx-1] : null, next: idx < all.length-1 ? all[idx+1] : null };
}
