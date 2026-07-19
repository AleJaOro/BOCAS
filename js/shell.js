/**
 * Shared shell helpers: sidebar toggle, logout binding
 */
import { logout } from './auth.js';
import { lockViewportZoom } from './utils.js';

export function initShell({ userName = '', roleLabel = '' } = {}) {
  lockViewportZoom();

  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = userName || 'Usuario';
  if (roleEl) roleEl.textContent = roleLabel || '';
  if (avatarEl) {
    const initials = (userName || 'U')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials || 'U';
  }

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('menuToggle');

  const close = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('show');
  };
  const open = () => {
    sidebar?.classList.add('open');
    overlay?.classList.add('show');
  };

  toggle?.addEventListener('click', () => {
    if (sidebar?.classList.contains('open')) close();
    else open();
  });
  overlay?.addEventListener('click', close);

  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });
}
