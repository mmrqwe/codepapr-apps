import { htmlEscape } from "./utils.js";
export function loadingBox(text) {
  const d = document.createElement("div");
  d.className = "loading-box";
  d.innerHTML = '<span class="spinner"></span> ' + htmlEscape(text || "加载中…");
  return d;
}
export function emptyBox(emoji, text) {
  const d = document.createElement("div");
  d.className = "empty";
  d.innerHTML = '<div class="big">' + emoji + "</div>" + htmlEscape(text);
  return d;
}
