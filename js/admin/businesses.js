/**
 * Admin — create / manage business licenses
 */
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { db } from '../firebase-config.js';
import { slugify, generateId, daysRemaining, licenseStatus, formatDateShort, formatMoney, escapeHtml } from '../utils.js';
import { toast, confirmDialog } from '../notifications.js';

const secondaryConfig = {
  apiKey: 'AIzaSyDmfdlvwsxhXro9RR53AOVOMzKC7q6h2yo',
  authDomain: 'bocas-7848a.firebaseapp.com',
  projectId: 'bocas-7848a',
  storageBucket: 'bocas-7848a.firebasestorage.app',
  messagingSenderId: '173538393456',
  appId: '1:173538393456:web:a60fed0cb21d81ffb663b5'
};

/**
 * Create business user without logging out the admin
 * (secondary Firebase app trick)
 */
async function createBusinessAuthUser(email, password) {
  const app2 = initializeApp(secondaryConfig, 'Secondary-' + Date.now());
  const auth2 = getAuth(app2);
  try {
    const cred = await createUserWithEmailAndPassword(auth2, email, password);
    await signOut(auth2);
    return cred.user.uid;
  } finally {
    await deleteApp(app2);
  }
}

export async function createBusiness({
  businessName,
  ownerName,
  email,
  password,
  phone,
  durationDays,
  plan = 'standard'
}) {
  const days = Number(durationDays) || 30;
  const uid = await createBusinessAuthUser(email.trim(), password);
  const businessId = generateId('biz');
  const slug = slugify(businessName) + '-' + businessId.slice(-5);
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  const business = {
    name: businessName.trim(),
    slug,
    ownerUid: uid,
    ownerName: ownerName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone || '',
    status: 'active',
    plan,
    license: {
      startDate: Timestamp.fromDate(start),
      endDate: Timestamp.fromDate(end),
      durationDays: days,
      history: [
        {
          action: 'created',
          days,
          at: Timestamp.fromDate(start)
        }
      ]
    },
    settings: {
      whatsapp: phone || '',
      sinpeNumber: '',
      sinpeName: '',
      currency: 'CRC',
      menuOpen: true,
      expressEnabled: true,
      welcomeMessage: '¡Bienvenido! Revisa nuestro menú y haz tu pedido.'
    },
    stats: {
      totalOrders: 0,
      totalSales: 0
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, 'businesses', businessId), business);

  await setDoc(doc(db, 'users', uid), {
    email: email.trim().toLowerCase(),
    name: ownerName.trim(),
    role: 'business',
    businessId,
    businessName: businessName.trim(),
    status: 'active',
    phone: phone || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { businessId, uid, slug };
}

export async function listBusinesses() {
  const q = query(collection(db, 'businesses'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function setBusinessStatus(businessId, status) {
  const bRef = doc(db, 'businesses', businessId);
  const bSnap = await getDoc(bRef);
  if (!bSnap.exists()) throw new Error('Negocio no encontrado');
  const ownerUid = bSnap.data().ownerUid;

  await updateDoc(bRef, {
    status,
    updatedAt: serverTimestamp()
  });

  if (ownerUid) {
    await updateDoc(doc(db, 'users', ownerUid), {
      status: status === 'deleted' ? 'deleted' : status === 'paused' ? 'paused' : 'active',
      updatedAt: serverTimestamp()
    });
  }
}

export async function renewLicense(businessId, extraDays) {
  const days = Number(extraDays) || 30;
  const bRef = doc(db, 'businesses', businessId);
  const bSnap = await getDoc(bRef);
  if (!bSnap.exists()) throw new Error('Negocio no encontrado');
  const data = bSnap.data();
  const currentEnd = data.license?.endDate?.toDate
    ? data.license.endDate.toDate()
    : new Date();
  const base = currentEnd > new Date() ? currentEnd : new Date();
  const newEnd = new Date(base);
  newEnd.setDate(newEnd.getDate() + days);

  const history = Array.isArray(data.license?.history) ? [...data.license.history] : [];
  history.push({
    action: 'renewed',
    days,
    at: Timestamp.now()
  });

  await updateDoc(bRef, {
    status: 'active',
    'license.endDate': Timestamp.fromDate(newEnd),
    'license.durationDays': (data.license?.durationDays || 0) + days,
    'license.history': history,
    updatedAt: serverTimestamp()
  });

  if (data.ownerUid) {
    await updateDoc(doc(db, 'users', data.ownerUid), {
      status: 'active',
      updatedAt: serverTimestamp()
    });
  }

  return newEnd;
}

export function renderBusinessRows(businesses, tbody) {
  if (!businesses.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state"><div class="empty-icon">🏪</div>
        <p>No hay negocios aún. Crea el primero.</p></div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = businesses
    .map((b) => {
      const ls = licenseStatus(b.license?.endDate, b.status);
      const days = daysRemaining(b.license?.endDate);
      const sales = formatMoney(b.stats?.totalSales || 0);
      return `
        <tr data-id="${b.id}">
          <td>
            <strong>${escapeHtml(b.name)}</strong>
            <div class="xs">${escapeHtml(b.ownerName || '')}</div>
          </td>
          <td class="small">${escapeHtml(b.email || '')}</td>
          <td><span class="badge ${ls.class}">${escapeHtml(ls.label)}</span></td>
          <td class="small">${formatDateShort(b.license?.endDate)}</td>
          <td class="small">${days} días</td>
          <td class="small">${sales}</td>
          <td>
            <div class="flex gap-1 flex-wrap">
              <button type="button" class="btn btn-sm btn-secondary" data-act="renew" data-id="${b.id}">Renovar</button>
              ${
                b.status === 'active'
                  ? `<button type="button" class="btn btn-sm btn-ghost" data-act="pause" data-id="${b.id}">Pausar</button>`
                  : b.status === 'paused'
                    ? `<button type="button" class="btn btn-sm btn-success" data-act="activate" data-id="${b.id}">Activar</button>`
                    : `<button type="button" class="btn btn-sm btn-success" data-act="activate" data-id="${b.id}">Restaurar</button>`
              }
              ${
                b.status !== 'deleted'
                  ? `<button type="button" class="btn btn-sm btn-danger" data-act="delete" data-id="${b.id}">Eliminar</button>`
                  : ''
              }
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

export async function bindBusinessActions(tbody, onRefresh) {
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');

    try {
      if (act === 'pause') {
        const ok = await confirmDialog({
          title: 'Pausar negocio',
          message: 'El negocio no podrá iniciar sesión hasta que lo actives de nuevo.',
          confirmText: 'Pausar',
          danger: true
        });
        if (!ok) return;
        await setBusinessStatus(id, 'paused');
        toast('Negocio pausado', 'warning');
      } else if (act === 'activate') {
        await setBusinessStatus(id, 'active');
        toast('Negocio activado', 'success');
      } else if (act === 'delete') {
        const ok = await confirmDialog({
          title: 'Eliminar negocio',
          message: 'Se desactivará la cuenta. Puedes restaurarla después.',
          confirmText: 'Eliminar',
          danger: true
        });
        if (!ok) return;
        await setBusinessStatus(id, 'deleted');
        toast('Negocio eliminado', 'info');
      } else if (act === 'renew') {
        const daysStr = prompt('¿Cuántos días de licencia agregar?', '30');
        if (!daysStr) return;
        const days = parseInt(daysStr, 10);
        if (!days || days < 1) {
          toast('Días inválidos', 'error');
          return;
        }
        await renewLicense(id, days);
        toast(`Licencia renovada (+${days} días)`, 'success');
      }
      if (onRefresh) await onRefresh();
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  });
}
