/**
 * Business — sales statistics + professional Excel export
 */
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../firebase-config.js';
import { formatMoney, rangeForFilter, formatDate, formatDateShort } from '../utils.js';

export async function loadOrdersInRange(businessId, filter = 'day') {
  const { start, end } = rangeForFilter(filter);
  const col = collection(db, 'businesses', businessId, 'orders');
  // Prefer range query; fallback to client filter if index missing
  try {
    const q = query(
      col,
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => {
        if (!o.createdAt) return false;
        const t = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        return t >= start && t <= end;
      });
  }
}

export function computeStats(orders) {
  const valid = orders.filter((o) => o.status !== 'cancelado');
  const cancelled = orders.filter((o) => o.status === 'cancelado').length;
  let sales = 0;
  let expressCount = 0;
  let cash = 0;
  let sinpe = 0;
  let itemMap = {};
  let dayMap = {};

  valid.forEach((o) => {
    sales += Number(o.total) || 0;
    if (o.isExpress) expressCount++;
    if (o.paymentMethod === 'sinpe') sinpe += Number(o.total) || 0;
    else cash += Number(o.total) || 0;

    (o.items || []).forEach((i) => {
      const key = i.name || 'Item';
      if (!itemMap[key]) itemMap[key] = { name: key, qty: 0, sales: 0 };
      itemMap[key].qty += Number(i.qty) || 0;
      itemMap[key].sales += (Number(i.price) || 0) * (Number(i.qty) || 0);
    });

    if (o.createdAt) {
      const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!dayMap[key]) dayMap[key] = { date: key, sales: 0, orders: 0 };
      dayMap[key].sales += Number(o.total) || 0;
      dayMap[key].orders += 1;
    }
  });

  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const byDay = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    ordersCount: valid.length,
    cancelled,
    sales,
    avgTicket: valid.length ? sales / valid.length : 0,
    expressCount,
    localCount: valid.length - expressCount,
    cash,
    sinpe,
    topItems,
    byDay,
    orders: valid
  };
}

export function renderBizStats(stats) {
  const map = {
    stSales: formatMoney(stats.sales),
    stOrders: stats.ordersCount,
    stAvg: formatMoney(stats.avgTicket),
    stExpress: stats.expressCount,
    stCash: formatMoney(stats.cash),
    stSinpe: formatMoney(stats.sinpe)
  };
  Object.entries(map).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  });
}

export function renderDayChart(canvasId, byDay) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: byDay.map((d) => d.date.slice(5)),
      datasets: [
        {
          label: 'Ventas',
          data: byDay.map((d) => d.sales),
          borderColor: '#111827',
          backgroundColor: 'rgba(17,24,39,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => formatMoney(c.raw) } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => (v >= 1000 ? `₡${v / 1000}k` : `₡${v}`) },
          grid: { color: 'rgba(0,0,0,0.04)' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/**
 * Professional Excel via SheetJS (XLSX global)
 */
export function exportStatsExcel(stats, businessName, filterLabel) {
  if (typeof XLSX === 'undefined') throw new Error('Librería Excel no cargada');

  const wb = XLSX.utils.book_new();
  const now = new Date();

  // Sheet 1: Resumen
  const resumen = [
    ['BOCAS — REPORTE DE VENTAS'],
    ['Negocio', businessName || ''],
    ['Periodo', filterLabel || ''],
    ['Generado', now.toLocaleString('es-CR')],
    [],
    ['MÉTRICA', 'VALOR'],
    ['Ventas totales', stats.sales],
    ['Pedidos', stats.ordersCount],
    ['Cancelados', stats.cancelled],
    ['Ticket promedio', Math.round(stats.avgTicket)],
    ['Pedidos express', stats.expressCount],
    ['Pedidos local', stats.localCount],
    ['Ventas efectivo', stats.cash],
    ['Ventas Sinpe Móvil', stats.sinpe]
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(resumen);
  ws1['!cols'] = [{ wch: 28 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

  // Sheet 2: Pedidos
  const orderRows = [
    [
      'ID',
      'Fecha',
      'Cliente',
      'Teléfono',
      'Tipo',
      'Ubicación',
      'Pago',
      'Estado',
      'Subtotal',
      'Express',
      'Total',
      'Origen',
      'Productos'
    ]
  ];
  (stats.orders || []).forEach((o) => {
    const products = (o.items || [])
      .map((i) => `${i.qty}x ${i.name}`)
      .join('; ');
    orderRows.push([
      o.id,
      formatDate(o.createdAt),
      o.client?.name || '',
      o.client?.phone || '',
      o.isExpress ? 'Express' : 'Local',
      o.locationName || '',
      o.paymentMethod === 'sinpe' ? 'Sinpe Móvil' : 'Efectivo',
      o.status,
      o.subtotal || 0,
      o.expressFee || 0,
      o.total || 0,
      o.source || '',
      products
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(orderRows);
  ws2['!cols'] = orderRows[0].map((_, i) => ({ wch: i === 12 ? 40 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Pedidos');

  // Sheet 3: Top productos
  const prodRows = [['Producto', 'Cantidad vendida', 'Ventas ₡']];
  (stats.topItems || []).forEach((p) => {
    prodRows.push([p.name, p.qty, p.sales]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(prodRows);
  ws3['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Productos');

  // Sheet 4: Por día
  const dayRows = [['Fecha', 'Pedidos', 'Ventas ₡']];
  (stats.byDay || []).forEach((d) => {
    dayRows.push([d.date, d.orders, d.sales]);
  });
  const ws4 = XLSX.utils.aoa_to_sheet(dayRows);
  ws4['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Por día');

  const safeName = (businessName || 'negocio').replace(/[^\w\-]+/g, '_').slice(0, 30);
  const file = `Bocas_${safeName}_${filterLabel || 'reporte'}_${now.toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, file);
}
