/**
 * Business — realtime orders + manual order builder
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  where,
  limit,
  increment
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import {
  formatMoney,
  formatDate,
  escapeHtml,
  waLink,
  orderStatusMessage,
  buildManualOrderMessage,
  orderTotal,
  phoneToWhatsApp
} from '../utils.js';
import { toast, playOrderSound } from '../notifications.js';

const STATUS_LABEL = {
  nuevo: 'Nuevo',
  preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

export function ordersCol(businessId) {
  return collection(db, 'businesses', businessId, 'orders');
}

export function clientsCol(businessId) {
  return collection(db, 'businesses', businessId, 'clients');
}

/**
 * Realtime listener — true push updates (better than 1s polling)
 */
export function listenOrders(businessId, { onChange, onlyActive = true } = {}) {
  let q = query(ordersCol(businessId), orderBy('createdAt', 'desc'), limit(100));
  let knownIds = new Set();
  let first = true;

  return onSnapshot(
    q,
    (snap) => {
      const orders = [];
      snap.forEach((d) => orders.push({ id: d.id, ...d.data() }));

      if (!first) {
        const incoming = orders.filter((o) => !knownIds.has(o.id) && o.status === 'nuevo');
        if (incoming.length) {
          playOrderSound();
          toast(
            incoming.length === 1
              ? `Nuevo pedido de ${incoming[0].client?.name || 'cliente'}`
              : `${incoming.length} pedidos nuevos`,
            'info',
            5000
          );
        }
      }
      knownIds = new Set(orders.map((o) => o.id));
      first = false;

      const list = onlyActive
        ? orders.filter((o) => !['entregado', 'cancelado'].includes(o.status))
        : orders;
      onChange?.(list, orders);
    },
    (err) => {
      console.error(err);
      toast('Error en tiempo real: ' + err.message, 'error');
    }
  );
}

export async function updateOrderStatus(businessId, orderId, status) {
  await updateDoc(doc(db, 'businesses', businessId, 'orders', orderId), {
    status,
    updatedAt: serverTimestamp()
  });
}

export async function upsertClient(businessId, client) {
  const phone = String(client.phone || '').replace(/\D/g, '');
  if (!phone) return null;

  // Find by phone
  const q = query(clientsCol(businessId), where('phone', '==', phone), limit(1));
  const snap = await getDocs(q);
  const payload = {
    name: client.name || '',
    phone,
    address: client.address || '',
    updatedAt: serverTimestamp()
  };

  if (!snap.empty) {
    const id = snap.docs[0].id;
    await updateDoc(doc(db, 'businesses', businessId, 'clients', id), payload);
    return id;
  }
  const ref = await addDoc(clientsCol(businessId), {
    ...payload,
    createdAt: serverTimestamp(),
    orderCount: 0
  });
  return ref.id;
}

export async function createOrder(businessId, orderData, businessName) {
  const items = (orderData.items || []).filter((i) => i.name && Number(i.qty) > 0);
  if (!items.length) throw new Error('Agrega al menos un producto');

  const expressFee = orderData.isExpress ? Number(orderData.expressFee) || 0 : 0;
  const { subtotal, total } = orderTotal(items, expressFee);

  // Save / update client
  let clientId = null;
  if (orderData.client?.phone) {
    clientId = await upsertClient(businessId, orderData.client);
  }

  const order = {
    client: {
      name: orderData.client?.name || 'Cliente',
      phone: orderData.client?.phone || '',
      address: orderData.client?.address || ''
    },
    clientId,
    items: items.map((i) => ({
      name: i.name,
      price: Number(i.price) || 0,
      qty: Number(i.qty) || 1,
      notes: i.notes || ''
    })),
    isExpress: !!orderData.isExpress,
    locationId: orderData.locationId || null,
    locationName: orderData.locationName || '',
    expressFee,
    paymentMethod: orderData.paymentMethod || 'efectivo',
    cashAmount: orderData.paymentMethod === 'efectivo' ? Number(orderData.cashAmount) || null : null,
    status: 'nuevo',
    source: orderData.source || 'manual',
    subtotal,
    total,
    notes: orderData.notes || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(ordersCol(businessId), order);

  // Aggregate stats on business
  await updateDoc(doc(db, 'businesses', businessId), {
    'stats.totalOrders': increment(1),
    'stats.totalSales': increment(total),
    updatedAt: serverTimestamp()
  });

  if (clientId) {
    await updateDoc(doc(db, 'businesses', businessId, 'clients', clientId), {
      orderCount: increment(1),
      lastOrderAt: serverTimestamp()
    });
  }

  return { id: ref.id, ...order, total, subtotal };
}

export function whatsappForOrder(order, businessName) {
  const phone = order.client?.phone;
  if (!phone) return null;
  const msg = orderStatusMessage(order, businessName);
  return waLink(phone, msg);
}

export function whatsappConfirmOrder(order, businessName) {
  const phone = order.client?.phone;
  if (!phone) return null;
  return waLink(phone, buildManualOrderMessage(order, businessName));
}

export function renderOrderCard(order, businessName) {
  const itemsHtml = (order.items || [])
    .map(
      (i) =>
        `<li><span>${escapeHtml(String(i.qty))}× ${escapeHtml(i.name)}</span><span>${formatMoney(i.price * i.qty)}</span></li>`
    )
    .join('');

  const meta = [];
  meta.push(
    order.isExpress
      ? `<span class="badge badge-info">🛵 ${escapeHtml(order.locationName || 'Express')}</span>`
      : `<span class="badge badge-neutral">🏪 Local</span>`
  );
  meta.push(
    order.paymentMethod === 'sinpe'
      ? `<span class="badge badge-success">Sinpe</span>`
      : `<span class="badge badge-neutral">Efectivo${order.cashAmount ? ' · paga ' + formatMoney(order.cashAmount) : ''}</span>`
  );
  if (order.source === 'menu') meta.push(`<span class="badge badge-info">Menú web</span>`);
  else meta.push(`<span class="badge badge-neutral">Manual</span>`);

  const waStatus = whatsappForOrder(order, businessName);
  const isNew = order.status === 'nuevo';

  return `
    <article class="order-card ${isNew ? 'is-new' : ''}" data-order-id="${order.id}">
      <div class="order-card-header">
        <div>
          <div class="order-id">#${escapeHtml(order.id.slice(-6).toUpperCase())} · ${formatDate(order.createdAt)}</div>
          <div class="order-client">${escapeHtml(order.client?.name || 'Cliente')}</div>
          <div class="xs">${escapeHtml(order.client?.phone || '')}${order.client?.address ? ' · ' + escapeHtml(order.client.address) : ''}</div>
        </div>
      </div>
      <div class="order-meta">${meta.join('')}</div>
      <ul class="order-items">${itemsHtml || '<li class="muted">Sin ítems</li>'}</ul>
      ${order.notes ? `<div class="small muted">📝 ${escapeHtml(order.notes)}</div>` : ''}
      ${
        order.isExpress && order.expressFee
          ? `<div class="small muted">Express: ${formatMoney(order.expressFee)}</div>`
          : ''
      }
      <div class="order-total-row">
        <span>Total</span>
        <span>${formatMoney(order.total)}</span>
      </div>
      <select class="order-status-select status-${escapeHtml(order.status)}" data-status data-id="${order.id}">
        <option value="nuevo" ${order.status === 'nuevo' ? 'selected' : ''}>Nuevo</option>
        <option value="preparacion" ${order.status === 'preparacion' ? 'selected' : ''}>En preparación</option>
        <option value="listo" ${order.status === 'listo' ? 'selected' : ''}>Listo</option>
        <option value="entregado" ${order.status === 'entregado' ? 'selected' : ''}>Entregado</option>
        <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
      </select>
      <div class="order-actions">
        ${
          waStatus
            ? `<a class="btn btn-whatsapp btn-sm" href="${waStatus}" target="_blank" rel="noopener">WhatsApp (${STATUS_LABEL[order.status] || order.status})</a>`
            : `<button type="button" class="btn btn-secondary btn-sm" disabled>Sin teléfono</button>`
        }
      </div>
    </article>
  `;
}

export function renderOrdersBoard(orders, container, businessName, mode = 'grid') {
  if (!orders.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🍽️</div>
        <p>No hay pedidos activos</p>
        <p class="small muted">Los nuevos aparecerán aquí al instante</p>
      </div>`;
    return;
  }

  if (mode === 'kanban') {
    const cols = [
      { key: 'nuevo', label: 'Nuevo' },
      { key: 'preparacion', label: 'En preparación' },
      { key: 'listo', label: 'Listo' }
    ];
    container.className = 'kanban';
    container.innerHTML = cols
      .map((c) => {
        const list = orders.filter((o) => o.status === c.key);
        return `
          <div class="kanban-col" data-col="${c.key}">
            <div class="kanban-col-header">
              <span>${c.label}</span>
              <span class="kanban-count">${list.length}</span>
            </div>
            ${list.map((o) => renderOrderCard(o, businessName)).join('')}
          </div>`;
      })
      .join('');
  } else {
    container.className = 'orders-grid';
    container.innerHTML = orders.map((o) => renderOrderCard(o, businessName)).join('');
  }
}

export async function loadMenuItems(businessId) {
  const snap = await getDocs(
    query(collection(db, 'businesses', businessId, 'menuItems'), orderBy('name'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.active !== false);
}

export async function loadLocations(businessId) {
  const snap = await getDocs(
    query(collection(db, 'businesses', businessId, 'locations'), orderBy('name'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.active !== false);
}

export async function searchClients(businessId, term) {
  const snap = await getDocs(query(clientsCol(businessId), orderBy('name'), limit(200)));
  const t = (term || '').toLowerCase();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (c) =>
        !t ||
        (c.name || '').toLowerCase().includes(t) ||
        String(c.phone || '').includes(t)
    )
    .slice(0, 8);
}
