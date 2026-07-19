/**
 * Promotions & combos for digital menu
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { formatMoney, escapeHtml } from '../utils.js';
import { cacheDelPrefix } from '../cache.js';

export function promosCol(businessId) {
  return collection(db, 'businesses', businessId, 'promotions');
}

export async function listPromotions(businessId) {
  const snap = await getDocs(query(promosCol(businessId), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addPromotion(businessId, data) {
  const ref = await addDoc(promosCol(businessId), {
    name: data.name.trim(),
    description: data.description || '',
    type: data.type === 'combo' ? 'combo' : 'promo',
    price: Number(data.price) || 0,
    active: data.active !== false,
    available: data.available !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  cacheDelPrefix(`menu_${businessId}`);
  return ref.id;
}

export async function updatePromotion(businessId, id, data) {
  await updateDoc(doc(db, 'businesses', businessId, 'promotions', id), {
    name: data.name?.trim(),
    description: data.description ?? '',
    type: data.type === 'combo' ? 'combo' : 'promo',
    price: Number(data.price) || 0,
    active: data.active !== false,
    available: data.available !== false,
    updatedAt: serverTimestamp()
  });
  cacheDelPrefix(`menu_${businessId}`);
}

export async function deletePromotion(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'promotions', id));
  cacheDelPrefix(`menu_${businessId}`);
}

export function renderPromotionsList(list, container) {
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎁</div><p>Sin promociones ni combos aún.</p></div>`;
    return;
  }
  container.innerHTML = list
    .map((p) => {
      const typeLabel = p.type === 'combo' ? 'Combo' : 'Promo';
      return `
      <div class="menu-item-card" data-id="${p.id}">
        <div class="menu-item-img placeholder">${p.type === 'combo' ? '🍱' : '🏷️'}</div>
        <div class="menu-item-body">
          <div class="menu-item-name">${escapeHtml(p.name)}</div>
          <div class="xs"><span class="badge badge-info">${typeLabel}</span>
            ${p.available === false ? '<span class="badge badge-warning">Agotado</span>' : ''}
            ${p.active === false ? '<span class="badge badge-danger">Oculto</span>' : ''}
          </div>
          <div class="small muted truncate">${escapeHtml(p.description || '')}</div>
        </div>
        <div class="text-right">
          <div class="menu-item-price">${formatMoney(p.price)}</div>
          <div class="flex gap-1 mt-1" style="justify-content:flex-end">
            <button type="button" class="btn btn-sm btn-secondary" data-act="edit-promo" data-id="${p.id}">Editar</button>
            <button type="button" class="btn btn-sm btn-ghost" data-act="toggle-promo" data-id="${p.id}">${p.available === false ? 'Disponible' : 'Agotar'}</button>
            <button type="button" class="btn btn-sm btn-danger" data-act="del-promo" data-id="${p.id}">×</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
}
