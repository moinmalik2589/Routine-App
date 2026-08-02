export const APP_TIME_ZONE = 'Asia/Kolkata';

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function todayIso(now = new Date()) {
  const parts = Object.fromEntries(isoFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

export function dateAtKolkataNoon(isoDate) {
  return new Date(`${isoDate}T12:00:00+05:30`);
}

export function addDays(isoDate, offset) {
  const date = dateAtKolkataNoon(isoDate);
  date.setUTCDate(date.getUTCDate() + offset);
  return isoFormatter.format(date);
}

export function weekdayFor(isoDate) {
  return new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, weekday: 'long' }).format(dateAtKolkataNoon(isoDate));
}

export function monthKey(isoDate) { return isoDate.slice(0, 7); }
export function daysInMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function isOnOrBefore(a, b) { return a <= b; }

export function isInRanges(isoDate, ranges) {
  return ranges.some(({ start, end }) => isoDate >= start && isoDate <= end);
}
