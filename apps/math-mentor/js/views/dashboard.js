import { DOMAIN_META } from "../config.js";
import { diagSkillIds } from "../adaptive.js";
import { state, skillById } from "../state.js";
import { masteryColor, masteryOf, htmlEscape } from "../utils.js";
import { navigate } from "../navigation.js";
import { loadingBox, emptyBox } from "../ui.js";
import { tracksForDomain, makeStepChain } from "../components.js";
import { outlineOf, getLastSkill, getLastSection } from "../storage.js";

export async function vDashboard(main) {
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const skills = state.skills.filter(s => s.domain === state.domain);
  const hasDiag = !!state.diagnosis[state.domain];
  const goal = state.settings["goal:" + state.domain] || "";
  const timeB = state.settings["time:" + state.domain] || "30";
  const stats = state.stats[state.domain] || { attempts: 0, correct: 0, due: 0, questions: 0 };
  const acc = stats.attempts ? Math.round(100 * stats.correct / stats.attempts) : 0;

  // 断点续学：继续上次学习（按学科隔离，刷新不丢）
  {
    const lastId = getLastSkill(state.domain);
    const lastSk = lastId ? skillById(lastId) : null;
    if (lastSk && lastSk.domain === state.domain) {
      const secIdx = getLastSection(lastSk.id);
      const secsLen = (() => { try { const v = state.settings["read-secs:" + lastSk.id]; const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a.length : 0; } catch(e){ return 0; } })();
      const n = (() => { try { const o = outlineOf(lastSk.id); return o.length || 1; } catch(e){ return 1; } })();
      const secLabel = secIdx != null && n > 1 ? " · 第 " + (secIdx + 1) + " / " + n + " 节" : "";
      const rc = document.createElement("div"); rc.className = "card";
      rc.style.borderColor = "var(--accent)";
      rc.innerHTML = "<h2>▶️ 继续上次学习</h2><p class='muted' style='margin:6px 0 10px'>" + htmlEscape(lastSk.name) + secLabel + " · " + htmlEscape(lastSk.description.slice(0, 80)) + (lastSk.description.length > 80 ? "…" : "") + "</p>";
      const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
      const go = document.createElement("button"); go.className = "btn"; go.textContent = "▶ 继续学习";
      go.onclick = async () => { const m = await import("./learn.js"); m.openLearn(lastSk.id); };
      const toPath = document.createElement("button"); toPath.className = "btn ghost small"; toPath.textContent = "🗺️ 查看路径";
      toPath.onclick = () => navigate("path");
      row.append(go, toPath);
      if (secsLen) { const tag = document.createElement("span"); tag.className = "tag acc"; tag.textContent = "已读 " + secsLen + " 节"; row.appendChild(tag); }
      rc.appendChild(row);
      wrap.appendChild(rc);
    }
  }

  // 路线位置：该学科所在的学习路线（含前后学科）
  const inTracks = tracksForDomain(state.domain);
  if (inTracks.length) {
    const rc = document.createElement("div"); rc.className = "card";
    rc.innerHTML = "<h2>🗺️ 路线位置 <span class='muted' style='font-size:13px;font-weight:400'>你在这些学习路径中的位置</span></h2>";
    inTracks.forEach(({ track }) => {
      const row = document.createElement("div"); row.className = "route-row";
      const title = document.createElement("div"); title.className = "route-title";
      title.textContent = track.emoji + " " + track.title + "（" + track.audience + "）";
      row.appendChild(title);
      const chain = makeStepChain(track, state.domain);
      chain.classList.add("compact");
      row.appendChild(chain);
      rc.appendChild(row);
    });
    wrap.appendChild(rc);
  }

  const card1 = document.createElement("div"); card1.className = "card";
  if (!hasDiag) {
    card1.innerHTML = "<h2>🎯 开始学习</h2><p class='muted'>" + htmlEscape(DOMAIN_META[state.domain].label) +
      "尚未进行能力诊断。建议先读「领域导览」建立整体图景，再花 5 道题完成诊断，找到合适起点并生成个性化学习路径。</p>";
    const bRow = document.createElement("div"); bRow.style.cssText = "margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;";
    const g = document.createElement("button"); g.className = "btn ghost";
    g.textContent = "📚 先读领域导览";
    g.onclick = () => navigate("intro");
    const b = document.createElement("button"); b.className = "btn";
    b.textContent = "🚀 开始能力诊断";
    b.onclick = async () => { const m = await import("./diagnose.js"); m.startDiagnose(); };
    bRow.appendChild(g); bRow.appendChild(b);
    card1.appendChild(bRow);
  } else {
    const diag = state.diagnosis[state.domain];
    card1.innerHTML = "<h2>📊 能力画像</h2>";
    const box = document.createElement("div"); box.className = "chart-box sm";
    card1.appendChild(box);
    const vals = diagSkillIds().map(sid => {
      const sk = skills.find(x => x.id === sid);
      return { name: sk ? sk.name : sid, value: Number(diag.profile[sid] ?? 0.1) };
    });
    setTimeout(() => {
      const chart = echarts.init(box);
      chart.setOption({
        grid: { left: 10, right: 60, top: 6, bottom: 6, containLabel: true },
        xAxis: { type: "value", max: 1, axisLabel: { color: "#999" } },
        yAxis: { type: "category", data: vals.map(v => v.name), axisLabel: { color: "#999" } },
        series: [{ type: "bar", data: vals.map(v => ({ value: v.value, itemStyle: { color: masteryColor(v.value), borderRadius: [0, 6, 6, 0] } })), barMaxWidth: 22, label: { show: true, position: "right", formatter: p => Math.round(p.value * 100) + "%", color: "#999" } }],
        backgroundColor: "transparent"
      });
    }, 30);
    if (diag.summary) {
      const p = document.createElement("p"); p.className = "muted"; p.style.marginTop = "8px";
      p.textContent = "💬 " + diag.summary; card1.appendChild(p);
    }
    const b = document.createElement("button"); b.className = "btn ghost small"; b.style.marginTop = "10px";
    b.textContent = "🔄 重新诊断"; b.onclick = async () => { const m = await import("./diagnose.js"); m.startDiagnose(); };
    card1.appendChild(b);
  }
  wrap.appendChild(card1);

  const card2 = document.createElement("div"); card2.className = "card";
  card2.innerHTML = "<h2>🧭 下一步学什么</h2>";
  if (!hasDiag) {
    card2.appendChild(emptyBox("🧭", "完成诊断后，这里会显示个性化学习建议"));
  } else {
    const ld = loadingBox("正在生成学习建议…");
    card2.appendChild(ld);
    (await import("./misc.js")).planNext().then(plan => {
      card2.innerHTML = "<h2>🧭 下一步学什么</h2>";
      const list = document.createElement("div");
      (plan.next_nodes || []).forEach(n => {
        const sk = skills.find(x => x.id === n.skill_id);
        if (!sk) return;
        const row = document.createElement("div"); row.className = "skill-row";
        const m = masteryOf(sk.id);
        row.innerHTML = '<span class="skill-dot" style="background:' + masteryColor(m) + '"></span>' +
          '<span class="skill-name">' + htmlEscape(sk.name) + '</span>' +
          '<span class="skill-m">' + Math.round(m * 100) + "%</span>";
        row.onclick = async () => { const m = await import("./learn.js"); m.openLearn(sk.id); };
        list.appendChild(row);
        const why = document.createElement("div"); why.className = "muted"; why.style.padding = "0 12px 8px 32px"; why.style.fontSize = "12.5px";
        why.textContent = "理由：" + (n.reason || "");
        list.appendChild(why);
      });
      if (!(plan.next_nodes || []).length) list.appendChild(emptyBox("🎉", "该领域已全部掌握！可以挑战更高难度或换个领域"));
      card2.appendChild(list);
      if (plan.advice) {
        const p = document.createElement("p"); p.className = "muted"; p.style.marginTop = "10px";
        p.textContent = "💡 " + plan.advice; card2.appendChild(p);
      }
    }).catch(e => {
      card2.innerHTML = "<h2>🧭 下一步学什么</h2><p class='muted'>建议生成失败：" + htmlEscape(e.message) + "</p>";
    });
  }
  wrap.appendChild(card2);

  const card3 = document.createElement("div"); card3.className = "card";
  card3.innerHTML = "<h2>📈 学习统计</h2>";
  const r = document.createElement("div"); r.className = "row";
  const boxes = [
    ["答题总数", stats.attempts],
    ["正确率", stats.attempts ? acc + "%" : "—"],
    ["待复习", stats.due],
    ["题库题目", stats.questions]
  ];
  boxes.forEach(([l, n]) => {
    const b = document.createElement("div"); b.className = "stat-box";
    b.innerHTML = '<div class="num">' + n + '</div><div class="lbl">' + l + "</div>";
    r.appendChild(b);
  });
  card3.appendChild(r);
  wrap.appendChild(card3);

  const card4 = document.createElement("div"); card4.className = "card";
  card4.innerHTML = "<h2>🎯 学习目标</h2>";
  const p = document.createElement("p"); p.className = "muted";
  p.textContent = goal ? "目标：" + goal + "　·　每日可用时间：" + timeB + " 分钟" : "尚未设置学习目标。";
  card4.appendChild(p);
  const b = document.createElement("button"); b.className = "btn ghost small"; b.style.marginTop = "8px";
  b.textContent = "✏️ 设置目标"; b.onclick = async () => { const m = await import("./misc.js"); m.openSettings(); };
  card4.appendChild(b);
  wrap.appendChild(card4);

  main.appendChild(wrap);
}

