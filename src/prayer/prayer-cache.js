import { addDays, daysInMonth, monthKey, parseIsoDate } from '../date-utils.js';
import { STORE_NAMES } from '../data/models.js';
import { PRAYER_CACHE_FORMAT_VERSION, calculatePrayerTimes, prayerSettingsFingerprint } from './prayer-calculator.js';

export function nextMonth(month) { const { year, month: number } = parseIsoDate(`${month}-01`); return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`; }

export class PrayerCacheService {
  constructor(adapter, calculator = calculatePrayerTimes) { this.adapter = adapter; this.calculator = calculator; this.lastResult = null; }
  async get(date, profile) {
    const fingerprint = prayerSettingsFingerprint(profile); const cached = await this.adapter.get(STORE_NAMES.prayerTimings, date);
    if (cached?.settingsFingerprint === fingerprint) { this.lastResult = { date, fingerprint, source: 'cache' }; return cached; }
    const record = this.calculator(date, profile); await this.adapter.put(STORE_NAMES.prayerTimings, record); this.lastResult = { date, fingerprint, source: 'fresh-calculation' }; return record;
  }
  async generateMonth(month, profile) { const count = daysInMonth(month); const records = []; for (let day = 1; day <= count; day++) records.push(await this.get(`${month}-${String(day).padStart(2, '0')}`, profile)); return records; }
  async warmCurrentAndNext(currentDate, profile) { const current = monthKey(currentDate); return [...await this.generateMonth(current, profile), ...await this.generateMonth(nextMonth(current), profile)]; }
  async invalidateFuture(fromDate, fingerprint = null) {
    const records = await this.adapter.getAll(STORE_NAMES.prayerTimings); let count = 0;
    for (const record of records) if (record.date >= fromDate && record.settingsFingerprint && (!fingerprint || record.settingsFingerprint === fingerprint)) { await this.adapter.delete(STORE_NAMES.prayerTimings, record.date); count++; }
    return count;
  }
  async invalidateIncompatibleFuture(fromDate) { const records = await this.adapter.getAll(STORE_NAMES.prayerTimings); let count = 0; for (const record of records) if (record.date >= fromDate && record.cacheFormatVersion !== PRAYER_CACHE_FORMAT_VERSION) { await this.adapter.delete(STORE_NAMES.prayerTimings, record.date); count++; } return count; }
}
