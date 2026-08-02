import { createActivityDefinition, createFastingDateRange } from './models.js';

const definitions = [
  { id: 'wake-up', name: 'Wake Up', defaultTime: '3:20 AM', alarmId: 'WAKEUP' },
  { id: 'tahajjud', name: 'Tahajjud', defaultTime: '3:35 AM' },
  { id: 'sehri', name: 'Sehri', timeSlots: [{ id: 'sehri-time-1', prayerKey: 'sehri', label: 'Sehri' }], protected: true, system: true },
  { id: 'fajr', name: 'Fajr Namaz', prayerKey: 'fajrPrayer', alarmId: 'FAJR', protected: true, system: true },
  { id: 'nap', name: 'Nap', defaultTime: '5:35 AM', prayerKey: 'nap', protected: true, system: true },
  { id: 'wake-up-again', name: 'Again Wakeup', defaultTime: '6:30 AM', prayerKey: 'wakeAgain', alarmId: 'WAKEUP_AGAIN' },
  { id: 'gym', name: 'Gym', defaultTime: '7:30 AM', prayerKey: 'gym' },
  { id: 'bath', name: 'Bath', defaultTime: 'Post-Gym' },
  { id: 'zohar', name: 'Zohar', prayerKey: 'zohar', alarmId: 'ZOHAR', protected: true, system: true },
  { id: 'ashar', name: 'Ashar', prayerKey: 'ashar', alarmId: 'ASHAR', protected: true, system: true },
  { id: 'maghrib', name: 'Maghrib', prayerKey: 'maghrib', alarmId: 'MAGHRIB', protected: true, system: true },
  { id: 'isha', name: 'Isha', prayerKey: 'isha', alarmId: 'ISHA', protected: true, system: true },
  { id: 'sleep', name: 'Go to Sleep', defaultTime: '1:00 AM' },
];

export const DEFAULT_ACTIVITIES = Object.freeze(definitions.map((definition, order) => createActivityDefinition({ ...definition, order })));
export const DEFAULT_FASTING_RANGES = Object.freeze([createFastingDateRange({ id: 'ramadan-2027', start: '2027-02-07', end: '2027-03-09', label: 'Ramadan 2027' })]);
export const SYSTEM_ALARM_IDS = Object.freeze(['WAKEUP', 'WAKEUP_AGAIN', 'FAST_START', 'FAST_END', 'FAJR', 'ZOHAR', 'ASHAR', 'MAGHRIB', 'ISHA']);

export function defaultPrayerTimings(date) {
  const shift = Number(date.slice(-2)) % 6;
  return { fastStart: `4:${String(42 - shift).padStart(2, '0')} AM`, fajrEnd: '6:03 AM', fastEnd: `6:${String(42 + shift).padStart(2, '0')} PM`, fajrPrayer: '5:10 AM', nap: '5:35 AM', wakeAgain: '6:30 AM', gym: '7:30 AM', zohar: '1:15 PM', ashar: '5:10 PM', maghrib: `6:${String(42 + shift).padStart(2, '0')} PM`, isha: '8:15 PM', source: 'bundled-mock-v1' };
}
