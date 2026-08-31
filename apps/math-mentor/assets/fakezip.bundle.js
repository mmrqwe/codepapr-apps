// 自实现 ZIP writer（STORE 不压缩）+ Fake JSZip —— 用于替代 JSZip 3.x 在受限浏览器环境中的挂起问题
// 纯同步实现：无 worker、无 promise 链、无 setImmediate，确定性执行

function crc32(u8) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ table[(crc ^ u8[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

const te = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
function strToU8(s) {
  if (te) return te.encode(s);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
function u8From(data, isBase64) {
  if (isBase64) {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof data === "string") return strToU8(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  return strToU8(String(data));
}

const WR = new DataView(new ArrayBuffer(8));
function w16(v) { WR.setUint16(0, v, true); return [WR.getUint8(0), WR.getUint8(1)]; }
function w32(v) { WR.setUint32(0, v, true); return [WR.getUint8(0), WR.getUint8(1), WR.getUint8(2), WR.getUint8(3)]; }

// 同步打包：entries = [{name, data:Uint8Array}] → Uint8Array(zip)
function zipStoreSync(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const e of entries) {
    const nameU8 = strToU8(e.name);
    const data = e.data;
    const crc = crc32(data);
    // local file header
    const lh = [
      0x50, 0x4b, 0x03, 0x04,        // signature
      ...w16(20),                    // version needed
      ...w16(0x0800),                // flags: UTF-8
      ...w16(0),                     // method: STORE
      ...w16(dosTime), ...w16(dosDate),
      ...w32(crc), ...w32(data.length), ...w32(data.length),
      ...w16(nameU8.length), ...w16(0)
    ];
    chunks.push(new Uint8Array(lh), nameU8, data);
    // central directory record
    const cd = [
      0x50, 0x4b, 0x01, 0x02,        // signature
      ...w16(20), ...w16(20),        // version made by / needed
      ...w16(0x0800), ...w16(0),     // flags, method
      ...w16(dosTime), ...w16(dosDate),
      ...w32(crc), ...w32(data.length), ...w32(data.length),
      ...w16(nameU8.length), ...w16(0), ...w16(0), // nameLen, extraLen, commentLen
      ...w16(0), ...w16(0), ...w32(0), // diskStart, intAttr, extAttr
      ...w32(offset)
    ];
    central.push(new Uint8Array(cd), nameU8);
    offset += lh.length + nameU8.length + data.length;
  }
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = [
    0x50, 0x4b, 0x05, 0x06,
    ...w16(0), ...w16(0),
    ...w16(entries.length), ...w16(entries.length),
    ...w32(centralSize), ...w32(offset),
    ...w16(0)
  ];
  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out;
}

// SVG 公式注入：对已打包的 PPTX entries 后处理——为占位 PNG 添加 svgBlip（Office 2016+/WPS 优先渲染 SVG，主 PNG 保底）
// injections: [{ slideNo, seq, svgStr, wIn, hIn }]；slideNo=页码(1起)，seq=该页第几个图片(1起)
function injectSvgs(entries, injections) {
  if (!injections || !injections.length) return entries;
  const findEntry = (name) => entries.find((e) => e.name === name);
  const utf8 = (u8) => (typeof TextDecoder !== "undefined" ? new TextDecoder().decode(u8) : String.fromCharCode.apply(null, u8));
  const enc = (s) => strToU8(s);
  for (const inj of injections) {
    const slideNo = inj.slideNo, seq = inj.seq;
    const slideName = "ppt/slides/slide" + slideNo + ".xml";
    const relsName = "ppt/slides/_rels/slide" + slideNo + ".xml.rels";
    const slideE = findEntry(slideName);
    const relsE = findEntry(relsName);
    if (!slideE || !relsE) continue;
    let slideXml = utf8(slideE.data);
    let relsXml = utf8(relsE.data);
    // 定位第 seq 个 <a:blip r:embed="rIdN"/>（占位 PNG 的主 blip；兼容自闭合与配对标签两种形式）
    const blipRe = /<a:blip r:embed="(rId\d+)"[^>]*>/g;
    let m, count = 0, targetRid = null;
    while ((m = blipRe.exec(slideXml)) !== null) {
      count++;
      if (count === seq) { targetRid = m[1]; break; }
    }
    if (!targetRid) continue;
    const newRid = "rId" + (900 + seq);
    const blipPos = slideXml.indexOf('r:embed="' + targetRid + '"');
    const blipFillEnd = slideXml.indexOf("</p:blipFill>", blipPos);
    if (blipFillEnd < 0) continue;
    const ext = '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' + newRid + '"/></a:ext></a:extLst>';
    slideXml = slideXml.slice(0, blipFillEnd) + ext + slideXml.slice(blipFillEnd);
    // rels：新增 SVG 关系（rId900+ 避免与现有 rId 冲突）
    const svgMedia = "image-" + slideNo + "-" + seq + ".svg";
    const rel = '<Relationship Id="' + newRid + '" Type="http://schemas.microsoft.com/office/2016/07/media/svg" Target="../media/' + svgMedia + '"/>';
    relsXml = relsXml.replace("</Relationships>", rel + "</Relationships>");
    slideE.data = enc(slideXml);
    relsE.data = enc(relsXml);
    // SVG media 文件：宽高改为像素（PowerPoint 不认 ex 单位），矢量内容无损
    let svgStr = inj.svgStr;
    svgStr = svgStr.replace(/width="[^"]*"/, 'width="' + Math.round(inj.wIn * 96 * 100) / 100 + 'px"')
      .replace(/height="[^"]*"/, 'height="' + Math.round(inj.hIn * 96 * 100) / 100 + 'px"');
    entries.push({ name: "ppt/media/" + svgMedia, data: enc(svgStr) });
  }
  return entries;
}

// Fake JSZip：模拟 pptxgen 用到的 API（file/folder/generateAsync），generateAsync 用同步打包实现
function makeFakeZipCtor() {
  function Folder(prefix, root) { this._prefix = prefix; this._root = root; }
  Folder.prototype.folder = function (name) {
    return new Folder(this._prefix + name + "/", this._root);
  };
  Folder.prototype.file = function (name, data, opts) {
    this._root._add(this._prefix + name, data, opts);
    return this;
  };
  function FakeZip() { this._entries = []; }
  FakeZip.prototype._add = function (name, data, opts) {
    this._entries.push({ name: name, data: u8From(data, !!(opts && opts.base64)) });
  };
  FakeZip.prototype.file = function (name, data, opts) {
    this._add(name, data, opts);
    return this;
  };
  FakeZip.prototype.folder = function (name) {
    return new Folder(name.replace(/\/$/, "") + "/", this);
  };
  FakeZip.prototype.remove = function (name) {
    this._entries = this._entries.filter((e) => e.name !== name && !e.name.startsWith(name));
    return this;
  };
  FakeZip.prototype.forEach = function (cb) { this._entries.forEach((e) => cb(e.name, e)); };
  FakeZip.prototype.filter = function (cb) {
    return this._entries.filter((e, i) => cb(e.name, e, i));
  };
  FakeZip.prototype.generateAsync = function (opts) {
    // SVG 公式注入（全局清单由前端导出逻辑写入 window.__PPT_INJECTIONS）
    let entries = this._entries;
    try { if (typeof window !== "undefined" && window.__PPT_INJECTIONS && window.__PPT_INJECTIONS.length) entries = injectSvgs(entries, window.__PPT_INJECTIONS); } catch (e) { /* 注入失败不影响主流程 */ }
    const bytes = zipStoreSync(entries);
    const type = (opts && opts.type) || "blob";
    let result;
    if (type === "blob") {
      result = typeof Blob !== "undefined" ? new Blob([bytes], { type: "application/zip" }) : bytes;
    } else if (type === "base64") {
      let bin = "";
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      result = btoa(bin);
    } else if (type === "uint8array" || type === "arraybuffer" || type === "nodebuffer") {
      result = type === "arraybuffer" ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
    } else {
      result = bytes;
    }
    return Promise.resolve(result);
  };
  return FakeZip;
}

// 浏览器自动挂载：供 pptxgen.bundle.js（已 patch）优先使用本实现替代内嵌 JSZip 3.10.1
window.__PPTGEN_FAKE_ZIP = makeFakeZipCtor();
if (!window.JSZip) window.JSZip = window.__PPTGEN_FAKE_ZIP;
