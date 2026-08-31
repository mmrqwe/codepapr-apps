import { BASE } from "./env.js";
/* ============ 资源加载 ============
   沙箱 CSP：script-src 仅 'self' https: 'unsafe-inline'（无 http:、无 unsafe-eval）。
   因此三个库不能用 <script src=http://...>（无 http:），也不能 eval（无 unsafe-eval）。
   方案：运行时从后端 fetch 源码，再作为“内联脚本元素”（textContent）注入执行——'unsafe-inline' 允许内联脚本。
   KaTeX 样式：优先 <link>；被 CSP 拦截时 fetch 内联，并把字体转成 data URI。 */
function loadCSS(href) {
  return new Promise((res, rej) => {
    const url = BASE + href;
    const t = setTimeout(() => rej(new Error("CSS 加载超时：" + href)), 20000);
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = url;
    l.onload = () => { clearTimeout(t); res(); };
    l.onerror = async () => {
      clearTimeout(t);
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        let css = await r.text();
        const fonts = [...new Set([...css.matchAll(/url\(fonts\/([^)\s]+)\)/g)].map((m) => m[1]))];
        const pairs = await Promise.all(fonts.map(async (f) => {
          try {
            const fr = await fetch(BASE + "/assets/fonts/" + f, { cache: "no-store" });
            if (!fr.ok) return null;
            const blob = await fr.blob();
            const dataUrl = await new Promise((res2, rej2) => {
              const rd = new FileReader();
              rd.onload = () => res2(rd.result);
              rd.onerror = () => rej2(new Error("read error"));
              rd.readAsDataURL(blob);
            });
            return [f, dataUrl];
          } catch (e) { return null; }
        }));
        for (const pair of pairs) {
          if (pair) css = css.split("url(fonts/" + pair[0] + ")").join("url(" + pair[1] + ")");
        }
        const st = document.createElement("style");
        st.textContent = css;
        document.head.appendChild(st);
        res();
      } catch (e2) {
        rej(new Error("样式加载失败 " + href + "：" + (e2 && e2.message || e2)));
      }
    };
    document.head.appendChild(l);
  });
}
function loadJS(src) {
  return new Promise((res, rej) => {
    const url = BASE + src;
    const t = setTimeout(() => rej(new Error("脚本加载超时：" + src)), 25000);
    fetch(url, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then((code) => {
        clearTimeout(t);
        let s;
        try {
          s = document.createElement("script");
          s.textContent = code;
        } catch (e) {
          rej(new Error("脚本注入被策略拦截：" + src));
          return;
        }
        s.onload = () => res();
        s.onerror = () => rej(new Error("脚本执行失败：" + src));
        document.head.appendChild(s);
        // 内联脚本同步执行；下一拍视为已尝试，最终由 bootAssets 检查全局对象确认
        setTimeout(res, 0);
      })
      .catch((e) => {
        clearTimeout(t);
        rej(new Error("脚本加载失败 " + src + "：" + (e && e.message || e)));
      });
  });
}

export { loadCSS, loadJS };
