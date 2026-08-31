import { state } from "./state.js";
import { DOMAIN_META } from "./config.js";
import { api } from "./utils.js";

let _renderView = () => {};
export function setRenderView(fn) { _renderView = fn; }
export function renderView() { _renderView(); }

function navigate(view) {
  state.view = view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  _renderView();
}
function setDomain(d) {
  if (!DOMAIN_META[d]) return;
  if (state.domain === d) return;
  state.domain = d;
  state.activeSkill = null; state.lesson = null; state.quiz = []; state.diag = null;
  const sel = document.getElementById("domain-select");
  if (sel) sel.value = d;
  api("/api/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: d }) }).catch(() => {});
  loadBootstrap().then(() => _renderView());
}
function renderDomainSelect() {
  const sel = document.getElementById("domain-select");
  if (!sel) return;
  sel.innerHTML = "";
  for (const [id, m] of Object.entries(DOMAIN_META)) {
    const o = document.createElement("option");
    o.value = id; o.textContent = m.emoji + " " + m.label;
    sel.appendChild(o);
  }
  sel.value = state.domain;
}
async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.skills = data.skills; state.mastery = data.mastery;
  state.diagnosis = data.diagnosis; state.settings = data.settings; state.stats = data.stats;
  // 合并自定义专题到学科元数据（category=custom 不入门类网格，单独入口）
  try {
    Object.keys(DOMAIN_META).forEach(k => { if (DOMAIN_META[k].category === "custom") delete DOMAIN_META[k]; });
    const ct = await api("/api/custom");
    state.customTopics = ct.topics || [];
    state.customTopics.forEach(t => {
      DOMAIN_META[t.id] = { label: t.title, emoji: t.emoji || "🎨", category: "custom", group: "自定义专题", tagline: t.tagline || "自定义学习专题" };
    });
  } catch (e) { state.customTopics = []; }
  const cur = state.settings.current_domain;
  if (cur && DOMAIN_META[cur]) state.domain = cur;
  renderDomainSelect();
  updateBadges();
}
async function updateBadges() {
  try {
    const due = await api("/api/review-queue?domain=" + state.domain);
    const badge = document.getElementById("review-badge");
    badge.style.display = due.due.length ? "flex" : "none";
    badge.textContent = due.due.length;
  } catch (e) {}
}

export function enterDomain(d) {
  if (!DOMAIN_META[d]) return;
  state.domain = d;
  state.settings.current_domain = d;
  state.activeSkill = null; state.lesson = null; state.quiz = []; state.diag = null;
  const sel = document.getElementById("domain-select");
  if (sel) sel.value = d;
  api("/api/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: d }) }).catch(() => {});
  updateBadges();
  navigate("dashboard");
}
export { navigate, setDomain, renderDomainSelect, loadBootstrap, updateBadges };
