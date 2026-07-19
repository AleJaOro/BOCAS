/**
 * Business hours — menu availability
 * Timezone default: America/Costa_Rica
 */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = {
  sun: 'Domingo',
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado'
};

export { DAY_KEYS, DAY_LABELS };

export function defaultSchedule() {
  const days = {};
  DAY_KEYS.forEach((k) => {
    const weekend = k === 'sun';
    days[k] = {
      open: !weekend,
      from: '08:00',
      to: '21:00'
    };
  });
  return {
    enabled: false, // off until business configures
    timezone: 'America/Costa_Rica',
    days
  };
}

/** Minutes from midnight in a given timezone */
function localParts(date = new Date(), timeZone = 'America/Costa_Rica') {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    const map = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };
    const day = map[parts.weekday] || DAY_KEYS[date.getDay()];
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(parts.minute, 10);
    return { day, minutes: hour * 60 + minute };
  } catch {
    return {
      day: DAY_KEYS[date.getDay()],
      minutes: date.getHours() * 60 + date.getMinutes()
    };
  }
}

function parseHM(hm) {
  if (!hm || typeof hm !== 'string') return 0;
  const [h, m] = hm.split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/**
 * @returns {{ open: boolean, reason?: string, label?: string }}
 */
export function getOpenStatus(schedule, now = new Date()) {
  if (!schedule || schedule.enabled !== true) {
    return { open: true, reason: 'no-schedule' };
  }
  const tz = schedule.timezone || 'America/Costa_Rica';
  const { day, minutes } = localParts(now, tz);
  const d = schedule.days?.[day];
  if (!d || d.open === false) {
    return {
      open: false,
      reason: 'closed-day',
      label: `Cerrado los ${DAY_LABELS[day] || day}`
    };
  }
  const from = parseHM(d.from || '00:00');
  const to = parseHM(d.to || '23:59');
  // overnight range (e.g. 18:00–02:00)
  let inRange;
  if (to < from) {
    inRange = minutes >= from || minutes <= to;
  } else {
    inRange = minutes >= from && minutes <= to;
  }
  if (!inRange) {
    return {
      open: false,
      reason: 'closed-hours',
      label: `Horario hoy: ${d.from} – ${d.to}`
    };
  }
  return {
    open: true,
    reason: 'open',
    label: `Abierto · hoy ${d.from} – ${d.to}`
  };
}

export function isBusinessOpen(schedule, now = new Date()) {
  return getOpenStatus(schedule, now).open;
}
