export const FALLBACK_BASE = (typeof location !== "undefined" && location.origin && location.origin !== "null" && !String(location.origin).startsWith("codepapr-app")) ? location.origin : "http://127.0.0.1:4617";
export const BASE = window.__PAPR_BACKEND_URL || FALLBACK_BASE;
