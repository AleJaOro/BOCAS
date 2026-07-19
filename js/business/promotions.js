/**
 * Promotions & combos for digital menu (+ image upload)
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
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { db, storage } from '../firebase-config.js';
import { formatMoney, escapeHtml, generateId } from '../utils.js';
import { cacheDelPrefix } from '../cache.js';

export function promosCol(businessId) {
  return collection(db, 'businesses', businessId, 'promotions');
}

function bustMenuCache(businessId) {
  cacheDelPrefix(`menu_${businessId}`);
  cacheDelPrefix(`pub_menu_${businessId}`);
  cacheDelPrefix(`pub_biz_${businessId}`);
}

export async function listPromotions(businessId) {
  try {
    const snap = await getDocs(query(promosCol(businessId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback if index / missing createdAt
    const snap = await getDocs(promosCol(businessId));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
  }
}

export async function uploadPromoImage(businessId, file) {
  if (!file) return '';
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `businesses/${businessId}/promos/${generateId('promo')}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(r);
}

export async function addPromotion(businessId, data, imageFile) {
  let imageUrl = data.imageUrl || '';
  if (imageFile) imageUrl = await uploadPromoImage(businessId, imageFile);
  const refDoc = await addDoc(promosCol(businessId), {
    name: data.name.trim(),
    description: data.description || '',
    type: data.type === 'combo' ? 'combo' : 'promo',
    price: Number(data.price) || 0,
    imageUrl: imageUrl || '',
    active: data.active !== false,
    available: data.available !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  bustMenuCache(businessId);
  return refDoc.id;
}

export async function updatePromotion(businessId, id, data, imageFile) {
  const payload = {
    name: data.name?.trim(),
    description: data.description ?? '',
    type: data.type === 'combo' ? 'combo' : 'promo',
    price: Number(data.price) || 0,
    active: data.active !== false,
    available: data.available !== false,
    updatedAt: serverTimestamp()
  };
  if (imageFile) {
    payload.imageUrl = await uploadPromoImage(businessId, imageFile);
  } else if (data.imageUrl !== undefined) {
    payload.imageUrl = data.imageUrl || '';
  }
  await updateDoc(doc(db, 'businesses', businessId, 'promotions', id), payload);
  bustMenuCache(businessId);
}

export async function deletePromotion(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'promotions', id));
  bustMenuCache(businessId);
}

export function renderPromotionsList(list, container) {
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎁</div><p>Sin promociones ni combos aún.</p></div>`;
    return;
  }
  container.innerHTML = list
    .map((p) => {
      const typeLabel = p.type === 'combo' ? 'Combo' : 'Promo';
      const img = p.imageUrl
        ? `<img class="menu-item-img" src="${escapeHtml(p.imageUrl)}" alt="" />`
        : `<div class="menu-item-img placeholder">${p.type === 'combo' ? '🍱' : '🏷️'}</div>`;
      return `
      <div class="menu-item-card" data-id="${p.id}">
        ${img}
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
