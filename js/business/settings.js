/**
 * Business settings (+ cache for speed)
 */
import { doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { cachedFetch, cacheDel } from '../cache.js';
import { defaultSchedule } from '../schedule.js';

export async function getBusiness(businessId, { fresh = false } = {}) {
  const key = `biz_${businessId}`;
  if (fresh) cacheDel(key);
  return cachedFetch(
    key,
    async () => {
      const snap = await getDoc(doc(db, 'businesses', businessId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    },
    45_000
  );
}

export async function updateBusinessSettings(businessId, settings) {
  const payload = { updatedAt: serverTimestamp() };
  Object.entries(settings).forEach(([k, v]) => {
    if (k === 'name' || k === 'phone') return;
    // nested objects (schedule) written as whole field
    if (k === 'schedule') {
      payload['settings.schedule'] = v;
      return;
    }
    payload[`settings.${k}`] = v;
  });
  if (settings.phone !== undefined) payload.phone = settings.phone;
  if (settings.name !== undefined) payload.name = settings.name;
  await updateDoc(doc(db, 'businesses', businessId), payload);
  cacheDel(`biz_${businessId}`);
}

export async function updateBusinessSchedule(businessId, schedule) {
  await updateDoc(doc(db, 'businesses', businessId), {
    'settings.schedule': schedule,
    updatedAt: serverTimestamp()
  });
  cacheDel(`biz_${businessId}`);
}

export function ensureSchedule(settings) {
  const s = settings?.schedule;
  if (s && s.days) return s;
  return defaultSchedule();
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
