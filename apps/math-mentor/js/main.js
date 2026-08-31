import { state } from "./state.js";
import { setRenderView, navigate, setDomain, loadBootstrap } from "./navigation.js";
import { bootAssets, reportEnv } from "./boot.js";
import { loadingBox } from "./ui.js";
import { htmlEscape } from "./utils.js";
import { vHome } from "./views/home.js";
import { vCustom, vCategory } from "./views/custom.js";
import { vDashboard } from "./views/dashboard.js";
import { vIntro } from "./views/intro.js";
import { vPath } from "./views/path.js";
import { vWrong, vReview, vRecords, openSettings } from "./views/misc.js";
import { renderLearn } from "./views/learn.js";
import { renderDiagnose } from "./views/diagnose.js";
import { renderQuiz } from "./views/quiz.js";

function renderView() {
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = "";
  const sk = state.activeSkill;
  if (state.view === "learn" && sk) { renderLearn(); return; }
  if (state.view === "diagnose" && state.diag) { renderDiagnose(); return; }
  if (state.view === "quiz" && state.quiz && state.quiz.length) { renderQuiz(); return; }
  const V = { home: vHome, category: vCategory, dashboard: vDashboard, intro: vIntro, path: vPath, wrong: vWrong, review: vReview, records: vRecords, custom: vCustom }[state.view];
  (V || vDashboard)(main);
}

setRenderView(renderView);

async function boot() {
  const main = document.getElementById("main");
  main.appendChild(loadingBox("正在加载本地资源（KaTeX / ECharts / Markdown）…"));
  try {
    await bootAssets();
  } catch (e) {
    main.innerHTML = '<div class="empty"><div class="big">⏳</div>资源加载失败，2 秒后自动重试…<br/><span class="muted">' + htmlEscape(e.message || e) + "</span></div>";
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await bootAssets();
    } catch (e2) {
      main.innerHTML = '<div class="empty"><div class="big">⚠️</div><b>静态资源加载失败</b><br/><span class="muted">' + htmlEscape(e2.message || e2) + "</span><br/><br/>"
        + "请确认：① 已在应用面板点击「▶ 启动」运行后端；② 后端 assets 目录完整（katex / echarts / marked）。"
        + '<br/><button class="btn small" id="boot-retry" style="margin-top:14px">🔄 重试</button></div>';
      const rb = document.getElementById("boot-retry");
      if (rb) rb.onclick = () => location.reload();
      return;
    }
  }
  try {
    await loadBootstrap();
    state.loaded = true;
    renderView();
    reportEnv();
  } catch (e) {
    main.innerHTML = '<div class="empty"><div class="big">🔌</div>无法连接后端服务：' + htmlEscape(e.message || e) + "<br/>请在应用面板点击「▶ 启动」运行后端。"
      + '<br/><button class="btn small" id="boot-retry2" style="margin-top:14px">🔄 重试</button></div>';
    const rb = document.getElementById("boot-retry2");
    if (rb) rb.onclick = () => location.reload();
  }
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest(".nav-btn");
  if (nav) { navigate(nav.dataset.view); return; }
  if (e.target.closest("#settings-btn")) { openSettings(); return; }
  const mask = e.target.closest(".modal-mask");
  if (mask && e.target === mask) { document.getElementById("modal-root").innerHTML = ""; }
});
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "domain-select") setDomain(e.target.value);
});

boot();
