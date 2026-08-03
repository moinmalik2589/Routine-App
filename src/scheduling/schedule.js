import { dateAtKolkataNoon, parseIsoDate, weekdayFor } from '../date-utils.js';

export const SCHEDULE_TYPES = Object.freeze(['daily', 'selected-weekdays', 'weekly', 'monthly', 'yearly', 'specific-date', 'specific-dates', 'date-range', 'none']);
const WEEKDAY_KEYS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

export function createSchedule(input = {}) {
  const type = SCHEDULE_TYPES.includes(input.type) ? input.type : 'daily';
  return { type, weekdays: [...(input.weekdays || [])], intervalWeeks: Math.max(1, Number(input.intervalWeeks) || 1), anchorDate: input.anchorDate || null, dayOfMonth: input.dayOfMonth ? Number(input.dayOfMonth) : null, month: input.month ? Number(input.month) : null, day: input.day ? Number(input.day) : null, date: input.date || null, dates: [...new Set(input.dates || [])].sort(), startDate: input.startDate || null, endDate: input.endDate || null };
}

export function createTimeSlot(input, fallbackId = `slot-${Date.now()}`) {
  return { id: input.id || fallbackId, time: input.time || '', label: input.label || '', enabled: input.enabled !== false, notificationEnabled: Boolean(input.notificationEnabled), notificationOffsetMinutes: Number(input.notificationOffsetMinutes) || 0, alarmMode: input.alarmMode || 'notification', vibrationEnabled: input.vibrationEnabled !== false, snoozeEnabled: input.snoozeEnabled !== false, snoozeMinutes: Math.max(1, Number(input.snoozeMinutes) || 10), sound: input.sound || 'default', customSoundUri: input.customSoundUri || null, prayerKey: input.prayerKey || null };
}

export function scheduleApplies(scheduleInput, isoDate) {
  const schedule = createSchedule(scheduleInput); const { year, month, day } = parseIsoDate(isoDate); const weekday = weekdayFor(isoDate);
  if (schedule.type === 'daily') return true;
  if (schedule.type === 'none') return false;
  if (schedule.type === 'selected-weekdays') return schedule.weekdays.includes(weekday);
  if (schedule.type === 'weekly') {
    if (!schedule.weekdays.includes(weekday)) return false;
    if (!schedule.anchorDate) return true;
    const weeks = Math.floor((dateAtKolkataNoon(isoDate) - dateAtKolkataNoon(schedule.anchorDate)) / 604800000);
    return weeks >= 0 && weeks % schedule.intervalWeeks === 0;
  }
  if (schedule.type === 'monthly') return day === schedule.dayOfMonth;
  if (schedule.type === 'yearly') return month === schedule.month && day === schedule.day;
  if (schedule.type === 'specific-date') return isoDate === schedule.date;
  if (schedule.type === 'specific-dates') return schedule.dates.includes(isoDate);
  if (schedule.type === 'date-range') return Boolean(schedule.startDate && schedule.endDate && isoDate >= schedule.startDate && isoDate <= schedule.endDate);
  return false;
}

export { WEEKDAY_KEYS };
