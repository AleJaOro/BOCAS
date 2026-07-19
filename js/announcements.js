/**
 * Platform announcements (admin → all businesses)
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-config.js';
import { cachedFetch, cacheDelPrefix } from './cache.js';
import { escapeHtml, formatDate } from './utils.js';

export function announcementsCol() {
  return collection(db, 'announcements');
}

export async function listAnnouncements(max = 50) {
  return cachedFetch(
    `announcements_${max}`,
    async () => {
      const snap = await getDocs(
        query(announcementsCol(), orderBy('createdAt', 'desc'), limit(max))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    30_000
  );
}

export async function listActiveAnnouncements(max = 20) {
  try {
    const snap = await getDocs(
      query(
        announcementsCol(),
        where('active', '==', true),
        orderBy('createdAt', 'desc'),
        limit(max)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback without composite index
    const all = await listAnnouncements(max);
    return all.filter((a) => a.active !== false);
  }
}

export async function createAnnouncement({ title, body, authorName }) {
  const ref = await addDoc(announcementsCol(), {
    title: title.trim(),
    body: body.trim(),
    active: true,
    authorName: authorName || 'Admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  cacheDelPrefix('announcements');
  return ref.id;
}

export async function updateAnnouncement(id, data) {
  await updateDoc(doc(db, 'announcements', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
  cacheDelPrefix('announcements');
}

export async function deleteAnnouncement(id) {
  await deleteDoc(doc(db, 'announcements', id));
  cacheDelPrefix('announcements');
}

/** Per-user read flags */
export async function getReadMap(uid) {
  if (!uid) return {};
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'announcementReads'));
    const map = {};
    snap.forEach((d) => {
      map[d.id] = true;
    });
    return map;
  } catch {
    return {};
  }
}

export async function markAnnouncementRead(uid, announcementId) {
  if (!uid || !announcementId) return;
  await setDoc(
    doc(db, 'users', uid, 'announcementReads', announcementId),
    { readAt: serverTimestamp() },
    { merge: true }
  );
}

export async function markAllRead(uid, ids) {
  await Promise.all(ids.map((id) => markAnnouncementRead(uid, id)));
}

export function renderAnnouncementCards(list, readMap = {}, { showActions = false } = {}) {
  if (!list.length) {
    return `<div class="empty-state"><div class="empty-icon">📢</div><p>No hay anuncios</p></div>`;
  }
  return list
    .map((a) => {
      const unread = !readMap[a.id];
      return `
      <article class="card announcement-card ${unread ? 'announcement-unread' : ''}" data-id="${a.id}">
        <div class="flex justify-between items-center gap-2 mb-1">
          <strong>${escapeHtml(a.title)}</strong>
          ${unread ? '<span class="badge badge-info">Nuevo</span>' : ''}
          ${a.active === false ? '<span class="badge badge-neutral">Archivado</span>' : ''}
        </div>
        <p class="small muted" style="white-space:pre-wrap;margin:0.35rem 0 0.5rem">${escapeHtml(a.body)}</p>
        <div class="xs">${formatDate(a.createdAt)} · ${escapeHtml(a.authorName || 'Admin')}</div>
        ${
          showActions
            ? `<div class="flex gap-1 mt-2">
                <button type="button" class="btn btn-sm btn-secondary" data-act="toggle" data-id="${a.id}">${a.active === false ? 'Activar' : 'Archivar'}</button>
                <button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="${a.id}">Eliminar</button>
              </div>`
            : ''
        }
      </article>`;
    })
    .join('');
}
