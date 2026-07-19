/**
 * Generate QR reliably (ESM + image API fallback)
 */

/**
 * Draw QR into a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {number} size
 */
export async function drawQrToCanvas(canvas, text, size = 220) {
  if (!canvas || !text) throw new Error('Canvas o enlace vacío');

  // 1) Prefer ESM build of "qrcode"
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const QR = mod.default || mod;
    await QR.toCanvas(canvas, text, {
      width: size,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    });
    return { method: 'canvas' };
  } catch (err) {
    console.warn('QR ESM failed, trying fallback', err);
  }

  // 2) Global from classic script (if present)
  try {
    if (typeof window.QRCode !== 'undefined' && window.QRCode.toCanvas) {
      await new Promise((resolve, reject) => {
        window.QRCode.toCanvas(
          canvas,
          text,
          { width: size, margin: 2, color: { dark: '#111827', light: '#ffffff' } },
          (e) => (e ? reject(e) : resolve())
        );
      });
      return { method: 'global' };
    }
  } catch (err) {
    console.warn('QR global failed', err);
  }

  // 3) Image API fallback (always works online)
  const url =
    'https://api.qrserver.com/v1/create-qr-code/?size=' +
    size +
    'x' +
    size +
    '&margin=8&data=' +
    encodeURIComponent(text);

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
    img.onerror = () => reject(new Error('No se pudo cargar el QR (API)'));
    img.src = url;
  });
  return { method: 'api', url };
}

/**
 * Download canvas as PNG
 */
export function downloadCanvasPng(canvas, filename = 'menu-qr.png') {
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = filename;
  try {
    a.href = canvas.toDataURL('image/png');
  } catch {
    // tainted canvas — open image fallback
    toastFallback(canvas);
    return;
  }
  a.click();
}

function toastFallback(canvas) {
  // If canvas is tainted, open data from a re-fetch is hard; just notify via alert-less console
  console.warn('No se pudo descargar el canvas (CORS). Usa captura de pantalla del QR.');
  const data = canvas.toDataURL?.('image/png');
  if (data && data.length > 100) {
    const a = document.createElement('a');
    a.download = 'menu-qr.png';
    a.href = data;
    a.click();
  }
}
