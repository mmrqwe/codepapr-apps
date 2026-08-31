import { state, skillById } from "./state.js";
import { DOMAIN_META, TRACKS } from "./config.js";
import { htmlEscape } from "./utils.js";
import { enterDomain } from "./navigation.js";

export function makeDomainPill(id, m) {
  const sk = state.skills.filter(s => s.domain === id);
  const hasDiag = !!state.diagnosis[id];
  const done = sk.filter(s => { const v = state.mastery[s.id]; return v != null ? v >= 0.7 : false; }).length;
  const pill = document.createElement("div"); pill.className = "domain-pill"; pill.dataset.domain = id;
  const dot = document.createElement("span"); dot.className = "dp-dot" + (hasDiag ? " ok" : "");
  const mainEl = document.createElement("div"); mainEl.className = "dp-main";
  mainEl.innerHTML = '<div class="dp-name">' + m.emoji + " " + htmlEscape(m.label) + "</div>" +
    '<div class="dp-sub">' + htmlEscape(m.tagline || "") + "</div>";
  const status = document.createElement("span"); status.className = "dp-status";
  status.textContent = hasDiag ? "已定位 · 掌握 " + done + "/" + sk.length + " 章" : "未开始";
  pill.appendChild(dot); pill.appendChild(mainEl); pill.appendChild(status);
  pill.onclick = () => enterDomain(id);
  return pill;
}
export function tracksForDomain(domainId) {
  const meta = DOMAIN_META[domainId];
  const group = meta && meta.group;
  const out = [];
  (TRACKS[group] || []).forEach(t => {
    const i = t.domains.indexOf(domainId);
    if (i >= 0) out.push({ track: t, index: i });
  });
  return out;
}
export function makeStepChain(track, curDomain) {
  const chain = document.createElement("div"); chain.className = "track-steps";
  track.domains.forEach((d, i) => {
    const m = DOMAIN_META[d];
    if (!m) return;
    const step = document.createElement("button"); step.className = "step-pill";
    if (d === curDomain) step.classList.add("cur");
    if (state.diagnosis[d]) step.classList.add("ok");
    step.innerHTML = "<span class='step-num'>" + (i + 1) + "</span><span class='step-name'>" + m.emoji + " " + htmlEscape(m.label) + "</span>";
    step.title = m.label + (state.diagnosis[d] ? "（已诊断）" : "（未开始）");
    step.onclick = () => enterDomain(d);
    chain.appendChild(step);
    if (i < track.domains.length - 1) {
      const ar = document.createElement("span"); ar.className = "step-arrow"; ar.textContent = "→";
      chain.appendChild(ar);
    }
  });
  return chain;
}
export function makeTrackCard(t) {
  const card = document.createElement("div"); card.className = "track-card";
  const head = document.createElement("div"); head.className = "track-head";
  head.innerHTML = "<span class='track-emoji'>" + t.emoji + "</span>" +
    "<span class='track-title'>" + htmlEscape(t.title) + "</span>" +
    "<span class='track-audience'>" + htmlEscape(t.audience) + "</span>" +
    "<span class='muted track-desc'>" + htmlEscape(t.desc) + "</span>";
  card.appendChild(head);
  card.appendChild(makeStepChain(t, null));
  return card;
}
