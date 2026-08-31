import { BASE } from "./env.js";
import { loadCSS, loadJS } from "./loader.js";

function reportEnv() {
  try {
    const info = {
      t: new Date().toISOString(),
      href: location.href,
      origin: location.origin,
      papr: typeof window.papr,
      paprKeys: window.papr ? Object.keys(window.papr) : [],
      paprAgent: window.papr && window.papr.agent ? Object.keys(window.papr.agent) : null,
      paprFs: window.papr && window.papr.fs ? Object.keys(window.papr.fs) : null,
      paprHttp: window.papr && window.papr.http ? Object.keys(window.papr.http) : null,
      paprDb: window.papr && window.papr.db ? Object.keys(window.papr.db) : null,
      paprApp: window.papr && window.papr.app ? Object.keys(window.papr.app) : null,
      framed: (function () { try { return window.top !== window.self; } catch (e) { return "cross-origin"; } })(),
      clipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
      anchorDownload: (function () { try { return "download" in document.createElement("a"); } catch (e) { return false; } })()
    };
    fetch(BASE + "/api/diag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(info)
    }).catch(() => {});
  } catch (e) { /* 静默 */ }
}
async function bootAssets() {
  await loadCSS("/assets/katex.min.css");
  await loadJS("/assets/katex.min.js");
  await loadJS("/assets/echarts.min.js");
  await loadJS("/assets/marked.min.js");
  if (!window.katex || !window.echarts || !window.marked) {
    throw new Error("内置库未就绪（katex/echarts/marked 注入后未挂载全局）");
  }
}
export { reportEnv, bootAssets };
