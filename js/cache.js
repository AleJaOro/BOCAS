/**
 * Lightweight cache for faster loads at scale
 * - Memory (instant within session tab)
 * - sessionStorage (survives soft navigations)
 */

const mem = new Map();
const PREFIX = 'bocas_c_';

export function cacheGet(key) {
  if (mem.has(key)) {
    const e = mem.get(key);
    if (e.exp > Date.now()) return e.val;
    mem.delete(key);
  }
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (e.exp > Date.now()) {
      mem.set(key, e);
      return e.val;
    }
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
  return null;
}

export function cacheSet(key, val, ttlMs = 60_000) {
  const e = { val, exp: Date.now() + ttlMs };
  mem.set(key, e);
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(e));
  } catch {
    /* quota */
  }
}

export function cacheDel(key) {
  mem.delete(key);
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function cacheDelPrefix(prefix) {
  for (const k of [...mem.keys()]) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Deduplicate in-flight promises (avoids double fetches) */
const inflight = new Map();

export function cachedFetch(key, fn, ttlMs = 60_000) {
  const hit = cacheGet(key);
  if (hit !== null && hit !== undefined) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(fn)
    .then((val) => {
      cacheSet(key, val, ttlMs);
      inflight.delete(key);
      return val;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}
