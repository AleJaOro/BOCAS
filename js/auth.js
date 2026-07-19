/**
 * Bocas SaaS — Auth helpers & route guards
 */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

export { auth, db };

/**
 * Resolve app-relative URLs so CSS/JS/routes work on:
 * - Firebase Hosting root (https://xxx.web.app/)
 * - GitHub Pages project (https://user.github.io/repo/)
 * - Local server (http://localhost:5500/)
 */
export function appUrl(path = '') {
  const clean = String(path || '').replace(/^\//, '');
  const pathname = window.location.pathname.replace(/\\/g, '/');

  let baseDir = '/';
  const markers = ['/admin/', '/admin', '/business/', '/business', '/menu/', '/menu'];
  let found = false;
  for (const m of markers) {
    const idx = pathname.indexOf(m);
    if (idx >= 0) {
      baseDir = pathname.slice(0, idx) + '/';
      found = true;
      break;
    }
  }

  if (!found) {
    // Root pages: /login.html, /setup.html, /index.html or /repo/login.html
    if (/\/[^/]+\.html$/i.test(pathname)) {
      baseDir = pathname.replace(/\/[^/]+\.html$/i, '/');
    } else if (pathname.endsWith('/')) {
      baseDir = pathname;
    } else {
      baseDir = pathname.replace(/\/[^/]+$/, '/') || '/';
    }
  }

  if (!baseDir.endsWith('/')) baseDir += '/';
  return new URL(clean, window.location.origin + baseDir).href;
}

export function go(path) {
  window.location.href = appUrl(path);
}

export function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getUserProfile(cred.user.uid);
  if (!profile) {
    await signOut(auth);
    throw new Error('Usuario sin perfil. Contacta al administrador.');
  }
  if (profile.role === 'business') {
    if (profile.status === 'deleted') {
      await signOut(auth);
      throw new Error('Esta cuenta fue eliminada.');
    }
    if (profile.status === 'paused') {
      await signOut(auth);
      throw new Error('Tu cuenta está pausada. Contacta a soporte.');
    }
    // Check license
    if (profile.businessId) {
      const bSnap = await getDoc(doc(db, 'businesses', profile.businessId));
      if (bSnap.exists()) {
        const b = bSnap.data();
        if (b.status === 'paused') {
          await signOut(auth);
          throw new Error('El negocio está pausado temporalmente.');
        }
        if (b.status === 'deleted') {
          await signOut(auth);
          throw new Error('El negocio fue desactivado.');
        }
        const end = b.license?.endDate?.toDate ? b.license.endDate.toDate() : new Date(b.license?.endDate);
        if (end && end < new Date()) {
          await signOut(auth);
          throw new Error('La licencia del negocio ha vencido. Renueva para continuar.');
        }
      }
    }
  }
  return { user: cred.user, profile };
}

export async function logout() {
  await signOut(auth);
  go('login.html');
}

/**
 * Guard page access. Redirects if not allowed.
 * @param {'admin'|'business'} role
 */
export async function requireRole(role) {
  const user = await waitForAuth();
  if (!user) {
    go('login.html');
    return null;
  }
  const profile = await getUserProfile(user.uid);
  if (!profile || profile.role !== role) {
    if (profile?.role === 'admin') go('admin/');
    else if (profile?.role === 'business') go('business/');
    else go('login.html');
    return null;
  }
  if (role === 'business' && profile.status !== 'active') {
    await signOut(auth);
    go('login.html');
    return null;
  }
  return { user, profile };
}

/** Create first admin if none exists (uses meta/system — no list permission needed) */
export async function setupAdmin({ email, password, name }) {
  const metaRef = doc(db, 'meta', 'system');
  try {
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists() && metaSnap.data().setupCompleted === true) {
      throw new Error('Ya existe un administrador. Usa el login normal.');
    }
  } catch (err) {
    if (err.message?.includes('Ya existe')) throw err;
    // If meta unreadable, continue — rules should allow public read
  }

  let user;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    user = cred.user;
    await updateProfile(user, { displayName: name });
  } catch (err) {
    // Auth user may already exist from a failed previous attempt
    if (err.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      user = cred.user;
      const existingProfile = await getUserProfile(user.uid);
      if (existingProfile?.role === 'admin') {
        await setDoc(metaRef, {
          setupCompleted: true,
          setupAt: serverTimestamp(),
          version: '1.0.0'
        }, { merge: true });
        throw new Error('El admin ya estaba creado. Ve a Login.');
      }
    } else {
      throw err;
    }
  }

  // Write profile first (bootstrap rules allow role=admin when !setupDone)
  await setDoc(doc(db, 'users', user.uid), {
    email: email.trim().toLowerCase(),
    name: name || 'Administrador',
    role: 'admin',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(metaRef, {
    setupCompleted: true,
    setupAt: serverTimestamp(),
    version: '1.0.0'
  }, { merge: true });

  return user;
}

export async function adminExists() {
  try {
    const metaSnap = await getDoc(doc(db, 'meta', 'system'));
    return metaSnap.exists() && metaSnap.data().setupCompleted === true;
  } catch {
    return false;
  }
}
