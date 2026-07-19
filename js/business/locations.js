/**
 * Business — express locations & fees
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

export function locationsCol(businessId) {
  return collection(db, 'businesses', businessId, 'locations');
}

export async function listLocations(businessId) {
  const snap = await getDocs(query(locationsCol(businessId), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addLocation(businessId, { name, expressFee }) {
  return addDoc(locationsCol(businessId), {
    name: name.trim(),
    expressFee: Number(expressFee) || 0,
    active: true,
    createdAt: serverTimestamp()
  });
}

export async function updateLocation(businessId, id, data) {
  await updateDoc(doc(db, 'businesses', businessId, 'locations', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteLocation(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'locations', id));
}

export function renderLocationsTable(locations, tbody) {
  if (!locations.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📍</div><p>Sin ubicaciones. Agrega zonas de express.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = locations
    .map(
      (l) => `<tr data-id="${l.id}">
        <td><strong>${escapeHtml(l.name)}</strong></td>
        <td>${formatMoney(l.expressFee)}</td>
        <td>${l.active === false ? '<span class="badge badge-warning">Inactiva</span>' : '<span class="badge badge-success">Activa</span>'}</td>
        <td>
          <div class="flex gap-1">
            <button type="button" class="btn btn-sm btn-secondary" data-act="edit" data-id="${l.id}">Editar</button>
            <button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="${l.id}">Eliminar</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}
