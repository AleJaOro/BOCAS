/**
 * Generate + download QR (works on mobile browsers)
 */

function qrApiUrl(text, size = 400) {
  return (
    'https://api.qrserver.com/v1/create-qr-code/?size=' +
    size +
    'x' +
    size +
    '&margin=12&format=png&data=' +
    encodeURIComponent(text)
  );
}

/**
 * Draw QR into a canvas element.
 */
export async function drawQrToCanvas(canvas, text, size = 220) {
  if (!canvas || !text) throw new Error('Canvas o enlace vacío');

  // 1) ESM library (clean canvas, downloadable)
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const QR = mod.default || mod;
    await QR.toCanvas(canvas, text, {
      width: size,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    });
    canvas.dataset.qrMethod = 'lib';
    canvas.dataset.qrText = text;
    return { method: 'lib' };
  } catch (err) {
    console.warn('QR ESM failed, API fallback', err);
  }

  // 2) Draw from API (may taint canvas for download — we still show it)
  const url = qrApiUrl(text, size);
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve();
    };
    img.onerror = () => {
      // Last resort: paint blank + mark for download-via-api only
      canvas.width = size;
      canvas.height = size;
      reject(new Error('No se pudo dibujar el QR'));
    };
    // Cache-bust
    img.src = url + '&t=' + Date.now();
  });
  canvas.dataset.qrMethod = 'api';
  canvas.dataset.qrText = text;
  return { method: 'api', url };
}

/**
 * Force download of a Blob
 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}

/**
 * Download QR as PNG — always tries blob download (works on phone)
 * @param {string} text URL/text to encode
 * @param {string} filename
 * @param {HTMLCanvasElement} [canvas] optional already-drawn canvas
 */
export async function downloadQrPng(text, filename = 'menu-qr.png', canvas = null) {
  if (!text) throw new Error('Sin enlace para el QR');

  // A) Library → dataURL → blob (best quality, no CORS)
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const QR = mod.default || mod;
    const dataUrl = await QR.toDataURL(text, {
      width: 512,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
    return { method: 'lib-dataurl' };
  } catch (err) {
    console.warn('QR lib download failed', err);
  }

  // B) Canvas (if not tainted)
  if (canvas) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl && dataUrl.length > 200) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        triggerBlobDownload(blob, filename);
        return { method: 'canvas' };
      }
    } catch (err) {
      console.warn('Canvas tainted', err);
    }
  }

  // C) Fetch PNG from public API as blob (works for real download on most mobiles)
  try {
    const api = qrApiUrl(text, 512);
    const res = await fetch(api, { mode: 'cors' });
    if (!res.ok) throw new Error('API status ' + res.status);
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
    return { method: 'api-blob' };
  } catch (err) {
    console.warn('API blob download failed', err);
  }

  // D) Last resort: open image (user long-press save on mobile)
  const openUrl = qrApiUrl(text, 512);
  const w = window.open(openUrl, '_blank', 'noopener,noreferrer');
  if (!w) {
    // popup blocked — navigate same tab temporarily not ideal; use anchor
    const a = document.createElement('a');
    a.href = openUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  const e = new Error('OPEN_FALLBACK');
  e.code = 'OPEN_FALLBACK';
  throw e;
}
