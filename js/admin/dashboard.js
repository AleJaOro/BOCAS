/**
 * Admin dashboard stats
 */
import {
  collection,
  getDocs,
  collectionGroup,
  query,
  where,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { formatMoney, daysRemaining, startOfDay } from '../utils.js';

export async function loadAdminStats() {
  const bizSnap = await getDocs(collection(db, 'businesses'));
  const businesses = bizSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const active = businesses.filter((b) => b.status === 'active').length;
  const paused = businesses.filter((b) => b.status === 'paused').length;
  const expiring = businesses.filter((b) => {
    if (b.status !== 'active') return false;
    const d = daysRemaining(b.license?.endDate);
    return d > 0 && d <= 7;
  }).length;

  let totalSales = 0;
  let totalOrders = 0;
  businesses.forEach((b) => {
    totalSales += Number(b.stats?.totalSales) || 0;
    totalOrders += Number(b.stats?.totalOrders) || 0;
  });

  // Today orders across businesses (best-effort via collectionGroup)
  let todaySales = 0;
  let todayOrders = 0;
  try {
    const start = Timestamp.fromDate(startOfDay());
    const oq = query(collectionGroup(db, 'orders'), where('createdAt', '>=', start));
    const oSnap = await getDocs(oq);
    oSnap.forEach((d) => {
      const o = d.data();
      if (o.status === 'cancelado') return;
      todayOrders += 1;
      todaySales += Number(o.total) || 0;
    });
  } catch {
    // collectionGroup may need index / rules; fall back to stored stats
  }

  // Chart data: sales per business
  const byBusiness = businesses
    .filter((b) => b.status !== 'deleted')
    .map((b) => ({
      name: b.name,
      sales: Number(b.stats?.totalSales) || 0,
      orders: Number(b.stats?.totalOrders) || 0,
      status: b.status,
      daysLeft: daysRemaining(b.license?.endDate)
    }))
    .sort((a, b) => b.sales - a.sales);

  return {
    totalBusinesses: businesses.length,
    active,
    paused,
    expiring,
    totalSales,
    totalOrders,
    todaySales,
    todayOrders,
    byBusiness,
    businesses
  };
}

export function renderStatCards(stats) {
  const map = {
    statBusinesses: stats.totalBusinesses,
    statActive: stats.active,
    statSales: formatMoney(stats.totalSales),
    statOrders: stats.totalOrders,
    statTodaySales: formatMoney(stats.todaySales),
    statTodayOrders: stats.todayOrders,
    statExpiring: stats.expiring,
    statPaused: stats.paused
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

export function renderSalesChart(canvasId, byBusiness) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;

  const top = byBusiness.slice(0, 8);
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map((b) => (b.name.length > 14 ? b.name.slice(0, 14) + '…' : b.name)),
      datasets: [
        {
          label: 'Ventas totales',
          data: top.map((b) => b.sales),
          backgroundColor: 'rgba(17, 24, 39, 0.85)',
          borderRadius: 8,
          maxBarThickness: 40
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatMoney(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => (v >= 1000 ? `₡${(v / 1000).toFixed(0)}k` : `₡${v}`)
          },
          grid: { color: 'rgba(0,0,0,0.04)' }
        }
      }
    }
  });
}

export function renderStatusChart(canvasId, stats) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Activos', 'Pausados', 'Por vencer (≤7d)'],
      datasets: [
        {
          data: [stats.active, stats.paused, stats.expiring],
          backgroundColor: ['#059669', '#d97706', '#2563eb'],
          borderWidth: 0,
          hoverOffset: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 16, font: { size: 12 } }
        }
      },
      cutout: '68%'
    }
  });
}
