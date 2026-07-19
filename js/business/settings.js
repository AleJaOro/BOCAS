/**
 * Business settings
 */
import { doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';

export async function getBusiness(businessId) {
  const snap = await getDoc(doc(db, 'businesses', businessId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updateBusinessSettings(businessId, settings) {
  const payload = { updatedAt: serverTimestamp() };
  Object.entries(settings).forEach(([k, v]) => {
    payload[`settings.${k}`] = v;
  });
  if (settings.phone !== undefined) payload.phone = settings.phone;
  if (settings.name !== undefined) payload.name = settings.name;
  await updateDoc(doc(db, 'businesses', businessId), payload);
}

/** Public menu link (works with GitHub Pages subpath and Firebase root) */
export function menuPublicUrl(businessId) {
  const pathname = window.location.pathname.replace(/\\/g, '/');
  let baseDir = '/';
  const markers = ['/admin/', '/admin', '/business/', '/business', '/menu/', '/menu'];
  let found = false;
  for (const m of markers) {
    const idx = pathname.indexOf(m);
    if (idx >= 0) {
      baseDir = pathname.slice(0, idx) + '/';
      found = true;
      break;
    }
  }
  if (!found) {
    if (/\/[^/]+\.html$/i.test(pathname)) {
      baseDir = pathname.replace(/\/[^/]+\.html$/i, '/');
    } else if (pathname.endsWith('/')) {
      baseDir = pathname;
    }
  }
  if (!baseDir.endsWith('/')) baseDir += '/';
  return new URL(`menu/?b=${encodeURIComponent(businessId)}`, window.location.origin + baseDir).href;
}
