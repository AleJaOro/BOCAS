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

export function menuPublicUrl(businessId, origin = window.location.origin) {
  return `${origin}/menu/?b=${encodeURIComponent(businessId)}`;
}
