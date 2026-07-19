/**
 * Bocas SaaS — Non-blocking toast notifications + order sound
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

/** Soft beep for new orders (no external file) */
export function playOrderSound() {
  const now = Date.now();
  if (now - lastBeep < 800) return;
  lastBeep = now;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.frequency.value = 880;
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.start();
    o.stop(audioCtx.currentTime + 0.4);
  } catch {
    /* ignore */
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
