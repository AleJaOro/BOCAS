/**
 * Business — clients CRM
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
import { escapeHtml, formatDateShort } from '../utils.js';

export function clientsCol(businessId) {
  return collection(db, 'businesses', businessId, 'clients');
}

export async function listClients(businessId) {
  const snap = await getDocs(query(clientsCol(businessId), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addClient(businessId, data) {
  return addDoc(clientsCol(businessId), {
    name: data.name.trim(),
    phone: String(data.phone || '').replace(/\D/g, ''),
    address: data.address || '',
    notes: data.notes || '',
    orderCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateClient(businessId, id, data) {
  await updateDoc(doc(db, 'businesses', businessId, 'clients', id), {
    name: data.name?.trim(),
    phone: String(data.phone || '').replace(/\D/g, ''),
    address: data.address || '',
    notes: data.notes || '',
    updatedAt: serverTimestamp()
  });
}

export async function deleteClient(businessId, id) {
  await deleteDoc(doc(db, 'businesses', businessId, 'clients', id));
}

export function renderClientsTable(clients, tbody) {
  if (!clients.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><p>Sin clientes guardados aún.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = clients
    .map(
      (c) => `<tr data-id="${c.id}">
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(c.phone || '')}</td>
        <td class="small">${escapeHtml(c.address || '—')}</td>
        <td class="small">${c.orderCount || 0}</td>
        <td>
          <div class="flex gap-1">
            <button type="button" class="btn btn-sm btn-secondary" data-act="edit" data-id="${c.id}">Editar</button>
            <button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="${c.id}">×</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}
