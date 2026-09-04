/** Compress pasted/dropped images: canvas → jpeg/webp, max edge ~1600, ~1.5MB. */
export const MAX_IMAGES = 4;
export const MAX_EDGE = 1600;
export const MAX_BYTES = Math.floor(1.5 * 1024 * 1024);

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{ dataUrl: string, mime: string, w: number, h: number }>} 
 */
export async function compressImage(file) {
  const srcUrl = await blobToDataUrl(file);
  const img = await loadImage(srcUrl);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const preferWebp = (file.type || '').includes('png') || (file.type || '').includes('webp');
  const types = preferWebp ? ['image/webp', 'image/jpeg'] : ['image/jpeg', 'image/webp'];
  let best = null;
  for (const type of types) {
    for (const q of [0.82, 0.72, 0.6, 0.48]) {
      const blob = await canvasToBlob(canvas, type, q);
      if (!blob) continue;
      if (blob.size <= MAX_BYTES) {
        const dataUrl = await blobToDataUrl(blob);
        return { dataUrl, mime: type, w, h };
      }
      if (!best || blob.size < best.size) best = { blob, type };
    }
  }
  if (!best) {
    return { dataUrl: srcUrl, mime: file.type || 'image/jpeg', w, h };
  }
  const dataUrl = await blobToDataUrl(best.blob);
  return { dataUrl, mime: best.type, w, h };
}

export function filesFromClipboard(ev) {
  const items = ev?.clipboardData?.items;
  if (!items) return [];
  const out = [];
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

export async function copyImageToClipboard(dataUrl) {
  if (!dataUrl) throw new Error('no image');
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (navigator.clipboard?.write && window.ClipboardItem) {
    const type = blob.type || 'image/png';
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    return;
  }
  throw new Error('clipboard image unsupported');
}
