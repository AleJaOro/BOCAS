/**
 * Public digital menu — customer-facing order flow
 */
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  increment,
  where,
  limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { formatMoney, escapeHtml, orderTotal, getQueryParam } from '../utils.js';
import { toast } from '../notifications.js';

export async function loadPublicBusiness(businessId) {
  const snap = await getDoc(doc(db, 'businesses', businessId));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  if (data.status === 'deleted' || data.status === 'paused') return { ...data, blocked: true };
  const end = data.license?.endDate?.toDate ? data.license.endDate.toDate() : null;
  if (end && end < new Date()) return { ...data, blocked: true, reason: 'license' };
  return data;
}

export async function loadPublicMenu(businessId) {
  const [catSnap, itemSnap, locSnap] = await Promise.all([
    getDocs(query(collection(db, 'businesses', businessId, 'categories'), orderBy('order'))),
    getDocs(query(collection(db, 'businesses', businessId, 'menuItems'), orderBy('name'))),
    getDocs(query(collection(db, 'businesses', businessId, 'locations'), orderBy('name')))
  ]);

  const categories = catSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.active !== false);

  const items = itemSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => i.active !== false && i.available !== false);

  const locations = locSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.active !== false);

  return { categories, items, locations };
}

export async function placePublicOrder(businessId, payload) {
  const items = (payload.items || []).filter((i) => i.qty > 0);
  if (!items.length) throw new Error('El carrito está vacío');
  if (!payload.client?.name?.trim()) throw new Error('Indica tu nombre');
  if (!payload.client?.phone?.trim()) throw new Error('Indica tu teléfono');

  const expressFee = payload.isExpress ? Number(payload.expressFee) || 0 : 0;
  const { subtotal, total } = orderTotal(items, expressFee);

  // Upsert client lightly
  let clientId = null;
  const phone = String(payload.client.phone).replace(/\D/g, '');
  try {
    const cq = query(
      collection(db, 'businesses', businessId, 'clients'),
      where('phone', '==', phone),
      limit(1)
    );
    const cs = await getDocs(cq);
    if (!cs.empty) {
      clientId = cs.docs[0].id;
      await updateDoc(doc(db, 'businesses', businessId, 'clients', clientId), {
        name: payload.client.name.trim(),
        address: payload.client.address || '',
        updatedAt: serverTimestamp(),
        orderCount: increment(1),
        lastOrderAt: serverTimestamp()
      });
    } else {
      const cref = await addDoc(collection(db, 'businesses', businessId, 'clients'), {
        name: payload.client.name.trim(),
        phone,
        address: payload.client.address || '',
        orderCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastOrderAt: serverTimestamp()
      });
      clientId = cref.id;
    }
  } catch {
    /* client save optional for public if rules block */
  }

  const order = {
    client: {
      name: payload.client.name.trim(),
      phone,
      address: payload.client.address || ''
    },
    clientId,
    items: items.map((i) => ({
      id: i.id || null,
      name: i.name,
      price: Number(i.price) || 0,
      qty: Number(i.qty) || 1,
      notes: i.notes || ''
    })),
    isExpress: !!payload.isExpress,
    locationId: payload.locationId || null,
    locationName: payload.locationName || '',
    expressFee,
    paymentMethod: payload.paymentMethod || 'efectivo',
    cashAmount:
      payload.paymentMethod === 'efectivo' ? Number(payload.cashAmount) || null : null,
    status: 'nuevo',
    source: 'menu',
    subtotal,
    total,
    notes: payload.notes || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'businesses', businessId, 'orders'), order);

  try {
    await updateDoc(doc(db, 'businesses', businessId), {
      'stats.totalOrders': increment(1),
      'stats.totalSales': increment(total),
      updatedAt: serverTimestamp()
    });
  } catch {
    /* stats optional */
  }

  return { id: ref.id, total, ...order };
}

export function resolveBusinessId() {
  return getQueryParam('b') || getQueryParam('id') || getQueryParam('biz') || '';
}

export function renderMenuSections({ categories, items }, container) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽️</div><p>El menú aún no tiene platillos.</p></div>`;
    return;
  }

  const uncategorized = items.filter((i) => !i.categoryId || !categories.find((c) => c.id === i.categoryId));
  const sections = categories
    .map((c) => ({ cat: c, items: items.filter((i) => i.categoryId === c.id) }))
    .filter((s) => s.items.length);

  if (uncategorized.length) {
    sections.push({ cat: { id: '_other', name: 'Otros' }, items: uncategorized });
  }

  // chips
  const chips = document.getElementById('catChips');
  if (chips) {
    chips.innerHTML = sections
      .map(
        (s, idx) =>
          `<button type="button" class="cat-chip ${idx === 0 ? 'active' : ''}" data-target="cat-${s.cat.id}">${escapeHtml(s.cat.name)}</button>`
      )
      .join('');
  }

  container.innerHTML = sections
    .map(
      (s) => `
      <section class="cat-section" id="cat-${s.cat.id}">
        <h2 class="cat-title">${escapeHtml(s.cat.name)}</h2>
        <div class="dish-list">
          ${s.items
            .map(
              (item) => `
            <button type="button" class="dish-card" data-add="${item.id}">
              ${
                item.imageUrl
                  ? `<img class="dish-img" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" />`
                  : `<div class="dish-img placeholder">🍽️</div>`
              }
              <div class="dish-info">
                <div class="dish-name">${escapeHtml(item.name)}</div>
                <div class="dish-desc">${escapeHtml(item.description || '')}</div>
                <div class="dish-price">${formatMoney(item.price)}</div>
              </div>
            </button>`
            )
            .join('')}
        </div>
      </section>`
    )
    .join('');
}

export { formatMoney, escapeHtml, toast };
