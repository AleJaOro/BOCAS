/**
 * Business — digital menu CRUD + image upload
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

export async function addMenuItem(businessId, item, imageFile) {
  let imageUrl = item.imageUrl || '';
  if (imageFile) imageUrl = await uploadMenuImage(businessId, imageFile);
  return addDoc(menuItemsCol(businessId), {
    name: item.name.trim(),
    description: item.description || '',
    price: Number(item.price) || 0,
    categoryId: item.categoryId || '',
    imageUrl,
    active: item.active !== false,
    available: item.available !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateMenuItem(businessId, id, item, imageFile) {
  const data = {
    name: item.name?.trim(),
    description: item.description ?? '',
    price: Number(item.price) || 0,
    categoryId: item.categoryId || '',
    active: item.active !== false,
    available: item.available !== false,
    updatedAt: serverTimestamp()
  };
  if (imageFile) data.imageUrl = await uploadMenuImage(businessId, imageFile);
  else if (item.imageUrl !== undefined) data.imageUrl = item.imageUrl;
  await updateDoc(doc(db, 'businesses', businessId, 'menuItems', id), data);
}

export async function deleteMenuItem(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'menuItems', id));
}

export function renderMenuItemsList(items, categories, container) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Aún no hay platillos. Agrega el primero.</p></div>`;
    return;
  }
  container.innerHTML = items
    .map((item) => {
      const img = item.imageUrl
        ? `<img class="menu-item-img" src="${escapeHtml(item.imageUrl)}" alt="" />`
        : `<div class="menu-item-img placeholder">🍽️</div>`;
      return `
        <div class="menu-item-card" data-id="${item.id}">
          ${img}
          <div class="menu-item-body">
            <div class="menu-item-name">${escapeHtml(item.name)}</div>
            <div class="xs">${escapeHtml(catMap[item.categoryId] || 'Sin categoría')}</div>
            <div class="small muted truncate">${escapeHtml(item.description || '')}</div>
            <div class="mt-1">
              ${item.available === false ? '<span class="badge badge-warning">Agotado</span>' : '<span class="badge badge-success">Disponible</span>'}
              ${item.active === false ? '<span class="badge badge-danger">Oculto</span>' : ''}
            </div>
          </div>
          <div class="text-right">
            <div class="menu-item-price">${formatMoney(item.price)}</div>
            <div class="flex gap-1 mt-1" style="justify-content:flex-end">
              <button type="button" class="btn btn-sm btn-secondary" data-act="edit" data-id="${item.id}">Editar</button>
              <button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="${item.id}">×</button>
            </div>
          </div>
        </div>`;
    })
    .join('');
}
