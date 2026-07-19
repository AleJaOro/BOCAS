/**
 * Business — digital menu CRUD + image upload + product options
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
import { normalizeItemOptions, optionsSummaryBadges } from '../product-options.js';
import { cacheDelPrefix } from '../cache.js';

export function categoriesCol(businessId) {
  return collection(db, 'businesses', businessId, 'categories');
}

export function menuItemsCol(businessId) {
  return collection(db, 'businesses', businessId, 'menuItems');
}

export async function listCategories(businessId) {
  const snap = await getDocs(query(categoriesCol(businessId), orderBy('order')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listMenuItems(businessId) {
  const snap = await getDocs(query(menuItemsCol(businessId), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addCategory(businessId, { name, order = 0 }) {
  return addDoc(categoriesCol(businessId), {
    name: name.trim(),
    order: Number(order) || 0,
    active: true,
    createdAt: serverTimestamp()
  });
}

export async function updateCategory(businessId, id, data) {
  await updateDoc(doc(db, 'businesses', businessId, 'categories', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteCategory(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'categories', id));
}

export async function uploadMenuImage(businessId, file) {
  if (!file) return '';
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `businesses/${businessId}/menu/${generateId('img')}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}

function sanitizeOptions(options) {
  const n = normalizeItemOptions({ options });
  const cleanList = (arr) =>
    (arr || [])
      .filter((o) => o && String(o.name || '').trim())
      .map((o) => ({
        id: o.id || generateId('opt'),
        name: String(o.name).trim(),
        priceMode: ['same', 'delta', 'absolute'].includes(o.priceMode) ? o.priceMode : 'same',
        price: Number(o.price) || 0
      }));

  return {
    variants: {
      enabled: !!n.variants.enabled && cleanList(n.variants.options).length > 0,
      label: n.variants.label || 'Variante / tamaño',
      required: n.variants.required !== false,
      options: cleanList(n.variants.options)
    },
    modifiers: {
      enabled: !!n.modifiers.enabled && cleanList(n.modifiers.options).length > 0,
      label: n.modifiers.label || 'Extras / modificadores',
      multi: n.modifiers.multi !== false,
      options: cleanList(n.modifiers.options).map((o) => ({
        ...o,
        priceMode: o.priceMode === 'absolute' ? 'delta' : o.priceMode
      }))
    },
    halves: {
      enabled: !!n.halves.enabled && cleanList(n.halves.options).length >= 2,
      label: n.halves.label || 'Mitades',
      options: cleanList(n.halves.options).map((o) => ({
        ...o,
        priceMode: o.priceMode === 'absolute' ? 'delta' : o.priceMode
      }))
    }
  };
}

export async function addMenuItem(businessId, item, imageFile) {
  let imageUrl = item.imageUrl || '';
  if (imageFile) imageUrl = await uploadMenuImage(businessId, imageFile);
  const refDoc = await addDoc(menuItemsCol(businessId), {
    name: item.name.trim(),
    description: item.description || '',
    price: Number(item.price) || 0,
    categoryId: item.categoryId || '',
    imageUrl,
    active: item.active !== false,
    available: item.available !== false,
    options: sanitizeOptions(item.options),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  cacheDelPrefix(`pub_menu_${businessId}`);
  cacheDelPrefix(`menu_${businessId}`);
  return refDoc;
}

export async function updateMenuItem(businessId, id, item, imageFile) {
  const data = {
    name: item.name?.trim(),
    description: item.description ?? '',
    price: Number(item.price) || 0,
    categoryId: item.categoryId || '',
    active: item.active !== false,
    available: item.available !== false,
    options: sanitizeOptions(item.options),
    updatedAt: serverTimestamp()
  };
  if (imageFile) data.imageUrl = await uploadMenuImage(businessId, imageFile);
  else if (item.imageUrl !== undefined) data.imageUrl = item.imageUrl;
  await updateDoc(doc(db, 'businesses', businessId, 'menuItems', id), data);
  cacheDelPrefix(`pub_menu_${businessId}`);
  cacheDelPrefix(`menu_${businessId}`);
}

export async function deleteMenuItem(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'menuItems', id));
  cacheDelPrefix(`pub_menu_${businessId}`);
}

export async function setMenuItemAvailable(businessId, id, available) {
  await updateDoc(doc(db, 'businesses', businessId, 'menuItems', id), {
    available: !!available,
    updatedAt: serverTimestamp()
  });
  cacheDelPrefix(`pub_menu_${businessId}`);
}

export function renderMenuItemsList(items, categories, container) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Aún no hay platillos. Agrega el primero.</p></div>`;
    return;
  }
  container.innerHTML = items
    .map((item) => {
      const soldOut = item.available === false;
      const badges = optionsSummaryBadges(item);
      const img = item.imageUrl
        ? `<img class="menu-item-img ${soldOut ? 'is-soldout' : ''}" src="${escapeHtml(item.imageUrl)}" alt="" />`
        : `<div class="menu-item-img placeholder">🍽️</div>`;
      return `
        <div class="menu-item-card ${soldOut ? 'soldout-card' : ''}" data-id="${item.id}">
          ${img}
          <div class="menu-item-body">
            <div class="menu-item-name">${escapeHtml(item.name)}</div>
            <div class="xs">${escapeHtml(catMap[item.categoryId] || 'Sin categoría')}</div>
            <div class="small muted truncate">${escapeHtml(item.description || '')}</div>
            <div class="mt-1 flex flex-wrap gap-1">
              ${soldOut ? '<span class="badge badge-warning">Agotado</span>' : '<span class="badge badge-success">Disponible</span>'}
              ${item.active === false ? '<span class="badge badge-danger">Oculto</span>' : ''}
              ${badges.map((b) => `<span class="badge badge-info">${escapeHtml(b)}</span>`).join('')}
            </div>
          </div>
          <div class="text-right">
            <div class="menu-item-price">${formatMoney(item.price)}</div>
            <div class="xs muted">base</div>
            <div class="flex gap-1 mt-1 flex-wrap" style="justify-content:flex-end">
              <button type="button" class="btn btn-sm ${soldOut ? 'btn-success' : 'btn-ghost'}" data-act="soldout" data-id="${item.id}">
                ${soldOut ? 'Disponible' : 'Agotar'}
              </button>
              <button type="button" class="btn btn-sm btn-secondary" data-act="edit" data-id="${item.id}">Editar</button>
              <button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="${item.id}">×</button>
            </div>
          </div>
        </div>`;
    })
    .join('');
}
