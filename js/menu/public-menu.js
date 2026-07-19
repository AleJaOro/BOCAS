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
import { cachedFetch } from '../cache.js';
import { getOpenStatus } from '../schedule.js';

export async function loadPublicBusiness(businessId) {
  return cachedFetch(
    `pub_biz_${businessId}`,
    async () => {
      const snap = await getDoc(doc(db, 'businesses', businessId));
      if (!snap.exists()) return null;
      const data = { id: snap.id, ...snap.data() };
      if (data.status === 'deleted' || data.status === 'paused') return { ...data, blocked: true };
      const end = data.license?.endDate?.toDate ? data.license.endDate.toDate() : null;
      if (end && end < new Date()) return { ...data, blocked: true, reason: 'license' };

      const openStatus = getOpenStatus(data.settings?.schedule);
      return { ...data, openStatus, menuHoursClosed: openStatus.open === false };
    },
    30_000
  );
}

async function safeCollection(businessId, sub, orderField, orderDir = 'asc') {
  const col = collection(db, 'businesses', businessId, sub);
  try {
    if (orderField) {
      const snap = await getDocs(query(col, orderBy(orderField, orderDir)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn(`[menu] orderBy ${sub}.${orderField} failed, fallback`, err?.message || err);
  }
  try {
    const snap = await getDocs(col);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn(`[menu] load ${sub} failed`, err?.message || err);
    return [];
  }
}

export async function loadPublicMenu(businessId, { fresh = false } = {}) {
  const key = `pub_menu_${businessId}`;
  if (fresh) {
    const { cacheDel } = await import('../cache.js');
    cacheDel(key);
  }
  return cachedFetch(
    key,
    async () => {
      const [categoriesRaw, itemsRaw, locationsRaw, promotionsRaw] = await Promise.all([
        safeCollection(businessId, 'categories', 'order', 'asc'),
        safeCollection(businessId, 'menuItems', 'name', 'asc'),
        safeCollection(businessId, 'locations', 'name', 'asc'),
        safeCollection(businessId, 'promotions', 'createdAt', 'desc')
      ]);

      const categories = categoriesRaw.filter((c) => c.active !== false);
      // Include sold-out items so clients see them (disabled)
      const items = itemsRaw.filter((i) => i.active !== false);
      const locations = locationsRaw.filter((l) => l.active !== false);
      const promotions = promotionsRaw.filter((p) => p.active !== false);

      return { categories, items, locations, promotions };
    },
    12_000
  );
}

export async function placePublicOrder(businessId, payload) {
  // Re-check hours (no stale cache for writes)
  const bizSnap = await getDoc(doc(db, 'businesses', businessId));
  if (!bizSnap.exists()) throw new Error('Negocio no encontrado');
  const biz = bizSnap.data();
  if (biz.settings?.menuOpen === false) throw new Error('El menú está cerrado temporalmente');
  const openStatus = getOpenStatus(biz.settings?.schedule);
  if (!openStatus.open) {
    throw new Error(openStatus.label || 'Fuera de horario de atención');
  }

  const items = (payload.items || []).filter((i) => i.qty > 0);
  if (!items.length) throw new Error('El carrito está vacío');
  if (!payload.client?.name?.trim()) throw new Error('Indica tu nombre');
  if (!payload.client?.phone?.trim()) throw new Error('Indica tu teléfono');

  // Block sold-out items
  for (const line of items) {
    if (line.soldOut || line.available === false) {
      throw new Error(`"${line.name}" está agotado`);
    }
  }

  const expressFee = payload.isExpress ? Number(payload.expressFee) || 0 : 0;
  const { subtotal, total } = orderTotal(items, expressFee);

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
    /* optional */
  }

  const order = {
    client: {
      name: payload.client.name.trim(),
      phone,
      address: payload.client.address || ''
    },
    clientId,
    items: items.map((i) => ({
      id: i.menuItemId || i.id || null,
      name: i.name,
      price: Number(i.price) || 0,
      qty: Number(i.qty) || 1,
      notes: i.notes || '',
      kind: i.kind || 'item',
      optionsNote: i.optionsNote || '',
      selection: i.selection || null
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
    /* optional */
  }

  return { id: ref.id, total, ...order };
}

export function resolveBusinessId() {
  return getQueryParam('b') || getQueryParam('id') || getQueryParam('biz') || '';
}

function optionBadgesHtml(item) {
  const o = item?.options || {};
  const bits = [];
  if (o.variants?.enabled && o.variants?.options?.length) {
    bits.push(`<span class="badge badge-info">Variantes</span>`);
  }
  if (o.modifiers?.enabled && o.modifiers?.options?.length) {
    bits.push(`<span class="badge badge-info">Extras</span>`);
  }
  if (o.halves?.enabled && o.halves?.options?.length >= 2) {
    bits.push(`<span class="badge badge-info">Mitades</span>`);
  }
  if (!bits.length) return '';
  return `<div class="dish-opt-badges">${bits.join('')}</div>`;
}

export function renderMenuSections({ categories, items, promotions = [] }, container) {
  let html = '';

  const activePromos = (promotions || []).filter((p) => p.active !== false);
  if (activePromos.length) {
    html += `
      <section class="cat-section" id="cat-promos">
        <h2 class="cat-title">🎁 Promos y combos</h2>
        <div class="dish-list">
          ${activePromos
            .map((p) => {
              const sold = p.available === false;
              const img = p.imageUrl
                ? `<img class="dish-img ${sold ? 'is-soldout' : ''}" src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy" />`
                : `<div class="dish-img placeholder">${p.type === 'combo' ? '🍱' : '🏷️'}</div>`;
              return `
              <button type="button" class="dish-card ${sold ? 'dish-soldout' : ''}" data-add-promo="${p.id}" ${sold ? 'disabled' : ''}>
                ${img}
                <div class="dish-info">
                  <div class="dish-name">${escapeHtml(p.name)} ${
                    sold
                      ? '<span class="badge badge-warning">Agotado</span>'
                      : `<span class="badge badge-info">${p.type === 'combo' ? 'Combo' : 'Promo'}</span>`
                  }</div>
                  <div class="dish-desc">${escapeHtml(p.description || '')}</div>
                  <div class="dish-price">${formatMoney(p.price)}</div>
                </div>
              </button>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  if (!items.length && !activePromos.length) {
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

  // Items without category and no categories at all
  if (!sections.length && items.length) {
    sections.push({ cat: { id: '_all', name: 'Menú' }, items });
  }

  const chips = document.getElementById('catChips');
  if (chips) {
    const chipList = [];
    if (activePromos.length) chipList.push({ id: 'promos', name: 'Promos' });
    sections.forEach((s) => chipList.push({ id: s.cat.id, name: s.cat.name }));
    chips.innerHTML = chipList
      .map(
        (s, idx) =>
          `<button type="button" class="cat-chip ${idx === 0 ? 'active' : ''}" data-target="cat-${s.id}">${escapeHtml(s.name)}</button>`
      )
      .join('');
  }

  html += sections
    .map(
      (s) => `
      <section class="cat-section" id="cat-${s.cat.id}">
        <h2 class="cat-title">${escapeHtml(s.cat.name)}</h2>
        <div class="dish-list">
          ${s.items
            .map((item) => {
              const sold = item.available === false;
              const hasOpts =
                (item.options?.variants?.enabled && item.options?.variants?.options?.length) ||
                (item.options?.modifiers?.enabled && item.options?.modifiers?.options?.length) ||
                (item.options?.halves?.enabled && item.options?.halves?.options?.length >= 2);
              return `
            <button type="button" class="dish-card ${sold ? 'dish-soldout' : ''}" data-add="${item.id}" ${sold ? 'disabled' : ''}>
              ${
                item.imageUrl
                  ? `<img class="dish-img ${sold ? 'is-soldout' : ''}" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" />`
                  : `<div class="dish-img placeholder">🍽️</div>`
              }
              <div class="dish-info">
                <div class="dish-name">${escapeHtml(item.name)} ${sold ? '<span class="badge badge-warning">Agotado</span>' : ''}</div>
                <div class="dish-desc">${escapeHtml(item.description || '')}</div>
                ${optionBadgesHtml(item)}
                <div class="dish-price">${formatMoney(item.price)}${
                  hasOpts && !sold ? ' <span class="xs" style="font-weight:500;color:var(--accent)">· Personalizar</span>' : ''
                }</div>
              </div>
            </button>`;
            })
            .join('')}
        </div>
      </section>`
    )
    .join('');

  container.innerHTML = html;
}

export { formatMoney, escapeHtml, toast, getOpenStatus };
