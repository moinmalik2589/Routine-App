import { daysInMonth, isInRanges, weekdayFor } from './date-utils.js';

export const ACTIVITIES = [
  { id: 'wake-up', name: 'Wake Up', defaultTime: '3:20 AM', alarmId: 'WAKEUP' },
  { id: 'tahajjud', name: 'Tahajjud', defaultTime: '3:35 AM' },
  { id: 'sehri', name: 'Sehri' },
  { id: 'fajr', name: 'Fajr Namaz', prayerKey: 'fajrPrayer', alarmId: 'FAJR' },
  { id: 'nap', name: 'Nap', prayerKey: 'nap' },
  { id: 'wake-up-again', name: 'Again Wakeup', prayerKey: 'wakeAgain', alarmId: 'WAKEUP_AGAIN' },
  { id: 'gym', name: 'Gym', prayerKey: 'gym' },
  { id: 'bath', name: 'Bath' },
  { id: 'zohar', name: 'Zohar', prayerKey: 'zohar', alarmId: 'ZOHAR' },
  { id: 'ashar', name: 'Ashar', prayerKey: 'ashar', alarmId: 'ASHAR' },
  { id: 'maghrib', name: 'Maghrib', prayerKey: 'maghrib', alarmId: 'MAGHRIB' },
  { id: 'isha', name: 'Isha', prayerKey: 'isha', alarmId: 'ISHA' },
  { id: 'sleep', name: 'Go to Sleep', defaultTime: '1:00 AM' },
];

export const ALL_ALARM_IDS = ['WAKEUP', 'WAKEUP_AGAIN', 'FAST_START', 'FAST_END', 'FAJR', 'ZOHAR', 'ASHAR', 'MAGHRIB', 'ISHA'];
export const FASTING_RANGES = [{ start: '2027-02-07', end: '2027-03-09', label: 'Ramadan 2027 (mock)' }];
const records = new Map();

function prayerTimes(isoDate) {
  const day = Number(isoDate.slice(-2));
  const shift = day % 6;
  return { fastStart: `4:${String(42 - shift).padStart(2, '0')} AM`, fajrEnd: '6:03 AM', fastEnd: `6:${String(42 + shift).padStart(2, '0')} PM`, fajrPrayer: '5:10 AM', nap: '5:35 AM', wakeAgain: '6:30 AM', gym: '7:30 AM', zohar: '1:15 PM', ashar: '5:10 PM', maghrib: `6:${String(42 + shift).padStart(2, '0')} PM`, isha: '8:15 PM' };
}

function createDay(isoDate) {
  const day = Number(isoDate.slice(-2));
  return {
    date: isoDate,
    weekday: weekdayFor(isoDate),
    completions: Object.fromEntries(ACTIVITIES.map((activity, index) => [activity.id, (day + index) % 4 === 0])),
    alarmsEnabled: true,
    disabledAlarmIds: [],
    prayerTimes: prayerTimes(isoDate),
  };
}

function getDay(isoDate) {
  if (!records.has(isoDate)) records.set(isoDate, createDay(isoDate));
  return records.get(isoDate);
}

export function isFastingDay(day) { return day.weekday === 'Friday' || isInRanges(day.date, FASTING_RANGES); }

export const routineService = {
  async getDay(isoDate) { return structuredClone(getDay(isoDate)); },
  async getMonth(month) {
    return Array.from({ length: daysInMonth(month) }, (_, index) => structuredClone(getDay(`${month}-${String(index + 1).padStart(2, '0')}`)));
  },
  async getYear(year) {
    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    return (await Promise.all(months.map((month) => this.getMonth(month)))).flat();
  },
  async setCompletion(isoDate, activityId, completed) { getDay(isoDate).completions[activityId] = completed; },
  async setDayAlarms(isoDate, enabled) { const day = getDay(isoDate); day.alarmsEnabled = enabled; day.disabledAlarmIds = enabled ? [] : [...ALL_ALARM_IDS]; },
  async setAlarm(isoDate, alarmId, enabled) {
    const day = getDay(isoDate);
    day.disabledAlarmIds = enabled ? day.disabledAlarmIds.filter((id) => id !== alarmId) : [...new Set([...day.disabledAlarmIds, alarmId])];
    day.alarmsEnabled = day.disabledAlarmIds.length < ALL_ALARM_IDS.length;
  },
  async setManyAlarms(days, alarmIds, enabled) { await Promise.all(days.map((day) => Promise.all(alarmIds.map((id) => this.setAlarm(day.date, id, enabled))))); },
};
