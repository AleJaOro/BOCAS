/**
 * Bocas SaaS — Toasts + loud order alert + browser notifications
 */

let container;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration
 */
export function toast(message, type = 'info', duration = 3500) {
  const root = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${iconFor(type)}</span>
    <span class="toast-msg">${escape(message)}</span>
    <button type="button" class="toast-close" aria-label="Cerrar">×</button>
  `;
  const remove = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 280);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  if (duration > 0) setTimeout(remove, duration);
  return el;
}

function iconFor(type) {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '!';
    case 'warning':
      return '⚠';
    default:
      return 'i';
  }
}

function escape(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

let audioCtx;
let lastBeep = 0;
let unlocked = false;

/** Call once on user gesture so browsers allow audio later */
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // silent blip to unlock
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    const o = audioCtx.createOscillator();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.01);
    unlocked = true;
  } catch {
    /* ignore */
  }
}

function tone(ctx, freq, start, duration, peak = 0.45) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  o.connect(g);
  g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  o.start(start);
  o.stop(start + duration + 0.02);
}

/**
 * Loud multi-beep notification for new orders (repeats so kitchen hears it)
 */
export function playOrderSound({ urgent = true } = {}) {
  const now = Date.now();
  if (now - lastBeep < 1200) return;
  lastBeep = now;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    // Pattern: high-low-high, pause, high-low-high (≈ 1.8s)
    const pattern = [
      [0.0, 980],
      [0.18, 740],
      [0.36, 1100],
      [0.7, 980],
      [0.88, 740],
      [1.06, 1100],
      [1.4, 1200],
      [1.55, 900]
    ];
    const peak = urgent ? 0.55 : 0.35;
    pattern.forEach(([offset, freq]) => tone(audioCtx, freq, t0 + offset, 0.16, peak));
  } catch {
    /* ignore */
  }
}

/** Request browser notification permission */
export async function ensureNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Resolve sw.js relative to app root
    const path = window.location.pathname.replace(/\\/g, '/');
    let base = '/';
    for (const m of ['/admin', '/business', '/menu']) {
      const i = path.indexOf(m);
      if (i >= 0) {
        base = path.slice(0, i) + '/';
        break;
      }
    }
    if (base === '/' && /\/[^/]+\.html$/i.test(path)) {
      base = path.replace(/\/[^/]+\.html$/i, '/');
    }
    const swUrl = new URL('sw.js', window.location.origin + base).href;
    const reg = await navigator.serviceWorker.register(swUrl, { scope: base });
    return reg;
  } catch (err) {
    console.warn('SW register failed', err);
    return null;
  }
}

/**
 * System notification (works with tab minimized if permission granted)
 */
export async function notifyNewOrder({ title, body, tag } = {}) {
  const t = title || '¡Nuevo pedido!';
  const b = body || 'Tienes un pedido nuevo en Bocas';
  const options = {
    body: b,
    tag: tag || 'bocas-order',
    renotify: true,
    requireInteraction: true,
    silent: false,
    icon: undefined,
    badge: undefined,
    vibrate: [200, 100, 200, 100, 400]
  };

  playOrderSound({ urgent: true });

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(t, options);
      // Also ping SW for reliability
      reg.active?.postMessage({ type: 'ORDER_NOTIFY', title: t, body: b, tag: options.tag });
    } else {
      const n = new Notification(t, options);
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  } catch {
    try {
      new Notification(t, options);
    } catch {
      /* ignore */
    }
  }
}

/** One-shot UI: enable sound + push from orders dashboard */
export async function enableKitchenAlerts() {
  unlockAudio();
  playOrderSound({ urgent: false });
  await registerServiceWorker();
  const perm = await ensureNotificationPermission();
  if (perm === 'granted') {
    toast('Alertas activadas: sonido + notificaciones', 'success');
    try {
      localStorage.setItem('bocas_alerts', '1');
    } catch {
      /* ignore */
    }
    return true;
  }
  if (perm === 'denied') {
    toast('Notificaciones bloqueadas en el navegador. Actívalas en ajustes del sitio.', 'warning', 6000);
    return false;
  }
  toast('Sonido listo. Permite notificaciones cuando el navegador lo pida.', 'info');
  return false;
}

export function alertsEnabled() {
  try {
    return localStorage.getItem('bocas_alerts') === '1';
  } catch {
    return false;
  }
}

export function confirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${escape(title)}</h3>
        <p class="modal-body">${escape(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${escape(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escape(confirmText)}</button>
        </div>
      </div>
    `;
    const close = (val) => {
      overlay.classList.add('modal-out');
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-in'));
  });
}
