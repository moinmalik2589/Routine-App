import { isInRanges, todayIso, weekdayFor } from '../date-utils.js';
import { DEFAULT_ACTIVITIES, DEFAULT_FASTING_RANGES, SYSTEM_ALARM_IDS } from './defaults.js';
import { SCHEMA_VERSION, STORE_NAMES, createActivityDefinition, createCompletionRecord, createDailyAlarmState, createDailyRoutineRecord, createOccurrenceCompletionRecord, createUserSettings } from './models.js';
import { scheduleApplies } from '../scheduling/schedule.js';
import { DEFAULT_LOCATION_SUGGESTION, createLocationProfile } from '../location/location-model.js';
import { PrayerCacheService } from '../prayer/prayer-cache.js';

const clone = (value) => structuredClone(value); const now = () => new Date().toISOString();
function subtractMinutes(time, minutes) { const match = time?.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!match) return time; let hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0); const date = new Date(2000, 0, 1, hour, Number(match[2]) - minutes); return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
function normalizeActivity(activity) { return createActivityDefinition(activity); }
function notificationId(activity, slot) { return activity.alarmId ? `${activity.alarmId}:${slot.id}` : `ACTIVITY:${activity.id}:${slot.id}`; }

export class RoutineRepository {
  constructor(adapter, { prayerCache } = {}) { this.adapter = adapter; this.prayerCache = prayerCache || new PrayerCacheService(adapter); }

  async initialize() {
    await this.adapter.open(); const current = await this.adapter.get(STORE_NAMES.metadata, 'schemaVersion'); const fromVersion = current?.value || 0; await this.runMigrations(fromVersion);
    if ((await this.adapter.getAll(STORE_NAMES.activities)).length === 0) for (const activity of DEFAULT_ACTIVITIES) await this.adapter.put(STORE_NAMES.activities, clone(activity));
    if ((await this.adapter.getAll(STORE_NAMES.fastingRanges)).length === 0) for (const range of DEFAULT_FASTING_RANGES) await this.adapter.put(STORE_NAMES.fastingRanges, clone(range));
    if (!(await this.adapter.get(STORE_NAMES.settings, 'default'))) await this.adapter.put(STORE_NAMES.settings, createUserSettings());
    return { schemaVersion: SCHEMA_VERSION, migratedFrom: fromVersion };
  }

  async runMigrations(fromVersion) {
    if (fromVersion < 1) await this.adapter.put(STORE_NAMES.metadata, { key: 'schemaVersion', value: 1, migratedAt: now() });
    if (fromVersion < 2) {
      const activities = await this.adapter.getAll(STORE_NAMES.activities); for (const activity of activities) await this.adapter.put(STORE_NAMES.activities, normalizeActivity(activity));
      const completions = await this.adapter.getAll(STORE_NAMES.completions); const completionMap = new Map(completions.map((item) => [item.id, item]));
      for (const routine of await this.adapter.getAll(STORE_NAMES.dailyRoutines)) {
        const snapshots = (routine.activitySnapshots || []).map(normalizeActivity);
        const occurrences = routine.occurrences || snapshots.flatMap((activity) => activity.timeSlots.filter(({ enabled }) => enabled).map((slot) => this.createOccurrence(activity, slot, slot.time || activity.defaultTime)));
        for (const occurrence of occurrences) { const legacy = completionMap.get(`${routine.date}:${occurrence.activityId}`); const existing = completionMap.get(`${routine.date}:${occurrence.id}`); if (!existing) await this.adapter.put(STORE_NAMES.completions, createOccurrenceCompletionRecord(routine.date, occurrence.id, occurrence.activityId, occurrence.timeSlotId, legacy?.completed || false)); }
        const legacyPrayer = await this.adapter.get(STORE_NAMES.prayerTimings, routine.date); await this.adapter.put(STORE_NAMES.dailyRoutines, { ...routine, activitySnapshots: snapshots, occurrences, prayerTimes: routine.prayerTimes || legacyPrayer || null, migratedAt: now() });
      }
      await this.adapter.put(STORE_NAMES.metadata, { key: 'schemaVersion', value: 2, migratedAt: now() });
    }
    const stored = await this.adapter.get(STORE_NAMES.metadata, 'schemaVersion'); if (stored.value !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${stored.value}`);
  }

  getSchemaVersion() { return this.adapter.get(STORE_NAMES.metadata, 'schemaVersion'); }
  getSettings() { return this.adapter.get(STORE_NAMES.settings, 'default'); }
  async updateSettings(changes) { const settings = { ...(await this.getSettings()), ...changes, id: 'default', updatedAt: now() }; await this.adapter.put(STORE_NAMES.settings, settings); return settings; }
  getLocationProfile() { return this.adapter.get(STORE_NAMES.profiles, 'default'); }
  async saveLocationProfile(input, { currentDate = todayIso() } = {}) { const previous = await this.getLocationProfile(); const profile = createLocationProfile({ ...input, locationVersion: previous ? String(Number(previous.locationVersion || 0) + 1) : '1' }); await this.adapter.put(STORE_NAMES.profiles, profile); await this.prayerCache.invalidateFuture(currentDate); await this.prayerCache.warmCurrentAndNext(currentDate, profile); return profile; }
  async getPrayerProfile() { return await this.getLocationProfile() || createLocationProfile(DEFAULT_LOCATION_SUGGESTION); }
  async warmPrayerCache(currentDate = todayIso()) { return this.prayerCache.warmCurrentAndNext(currentDate, await this.getPrayerProfile()); }

  async getActivities({ includeDeleted = false, includeDisabled = true } = {}) { return (await this.adapter.getAll(STORE_NAMES.activities)).map(normalizeActivity).filter((item) => (includeDeleted || !item.deletedAt) && (includeDisabled || item.enabled)).sort((a, b) => a.order - b.order); }
  async addActivity(input) { const activities = await this.getActivities({ includeDeleted: true }); const id = input.id || `activity-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; if (activities.some((item) => item.id === id)) throw new Error('Activity ID already exists.'); const activity = createActivityDefinition({ ...input, id, order: activities.length }); await this.adapter.put(STORE_NAMES.activities, activity); return activity; }
  async editActivity(id, changes) { const storedActivity = await this.adapter.get(STORE_NAMES.activities, id); if (!storedActivity || storedActivity.deletedAt) throw new Error('Activity not found.'); const activity = normalizeActivity(storedActivity); const allowed = ['name', 'defaultTime', 'enabled', 'notificationEnabled', 'schedule', 'timeSlots']; const permitted = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key))); if (activity.protected && permitted.timeSlots) { const supplied = new Map(permitted.timeSlots.map((slot) => [slot.id, slot])); permitted.timeSlots = activity.timeSlots.map((original) => original.prayerKey ? { ...(supplied.get(original.id) || original), id: original.id, prayerKey: original.prayerKey } : (supplied.get(original.id) || original)); }
    const next = normalizeActivity({ ...activity, ...permitted, id: activity.id, prayerKey: activity.prayerKey, alarmId: activity.alarmId, protected: activity.protected, system: activity.system, updatedAt: now() }); if (!next.name) throw new Error('Activity name is required.'); await this.adapter.put(STORE_NAMES.activities, next); return next; }
  async reorderActivities(orderedIds) { const activities = await this.getActivities(); const known = new Map(activities.map((item) => [item.id, item])); if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !known.has(id))) throw new Error('Invalid activity order.'); const full = [...orderedIds, ...activities.map(({ id }) => id).filter((id) => !orderedIds.includes(id))]; for (const [order, id] of full.entries()) await this.adapter.put(STORE_NAMES.activities, { ...known.get(id), order, updatedAt: now() }); return this.getActivities(); }
  async softDeleteActivity(id) { const activity = await this.adapter.get(STORE_NAMES.activities, id); if (!activity) throw new Error('Activity not found.'); if (activity.protected) throw new Error('Protected prayer activities cannot be removed. Disable them instead.'); const deleted = { ...activity, enabled: false, deletedAt: now(), updatedAt: now() }; await this.adapter.put(STORE_NAMES.activities, deleted); return deleted; }
  async getFastingRanges() { return (await this.adapter.getAll(STORE_NAMES.fastingRanges)).filter(({ enabled }) => enabled).sort((a, b) => a.start.localeCompare(b.start)); }
  async isFastingDay(date, weekday = weekdayFor(date)) { return weekday === 'Friday' || isInRanges(date, await this.getFastingRanges()); }

  occurrenceTime(activity, slot, date, weekday, prayer, fasting) {
    if (activity.id === 'wake-up' && fasting) return subtractMinutes(prayer.fajr, 40); if (activity.id === 'tahajjud' && fasting) return subtractMinutes(prayer.fajr, 15); if (activity.id === 'sehri') return fasting ? `${subtractMinutes(prayer.fajr, 30)} - ${prayer.fajr}` : null;
    if (activity.id === 'gym' && fasting && weekday !== 'Friday') return 'Evening'; if (activity.id === 'bath') return weekday === 'Friday' ? 'Pre-Jummah' : fasting ? 'Evening' : 'Post-Gym';
    return slot.prayerKey ? (prayer[slot.prayerKey] || prayer[activity.prayerKey] || slot.time || activity.defaultTime) : (slot.time || activity.defaultTime);
  }
  createOccurrence(activity, slot, time) { return { id: `${activity.id}:${slot.id}`, activityId: activity.id, activityName: activity.name, activityOrder: activity.order, timeSlotId: slot.id, time, label: slot.label || '', notificationEnabled: Boolean(slot.notificationEnabled), notificationOffsetMinutes: slot.notificationOffsetMinutes || 0, notificationId: notificationId(activity, slot) }; }

  async ensureDay(date) {
    let routine = await this.adapter.get(STORE_NAMES.dailyRoutines, date); if (routine) return this.getDay(date, false);
    const weekday = weekdayFor(date), fasting = await this.isFastingDay(date, weekday), profile = await this.getPrayerProfile(), prayer = await this.prayerCache.get(date, profile);
    const definitions = (await this.getActivities({ includeDisabled: false })).filter(({ schedule }) => scheduleApplies(schedule, date)); const occurrences = definitions.flatMap((activity) => activity.timeSlots.filter(({ enabled }) => enabled).map((slot) => this.createOccurrence(activity, slot, this.occurrenceTime(activity, slot, date, weekday, prayer, fasting))).filter(({ time }) => time));
    routine = createDailyRoutineRecord(date, weekday, definitions, occurrences, prayer.settingsFingerprint, prayer); await this.adapter.put(STORE_NAMES.dailyRoutines, routine);
    for (const occurrence of occurrences) await this.adapter.put(STORE_NAMES.completions, createOccurrenceCompletionRecord(date, occurrence.id, occurrence.activityId, occurrence.timeSlotId)); await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date)); return this.getDay(date, false);
  }
  async getDay(date, create = true) { const routine = await this.adapter.get(STORE_NAMES.dailyRoutines, date); if (!routine) return create ? this.ensureDay(date) : null; const records = (await this.adapter.getAll(STORE_NAMES.completions)).filter((item) => item.date === date); const completions = Object.fromEntries(records.map((item) => [item.occurrenceId || item.activityId, item.completed])); const alarm = await this.adapter.get(STORE_NAMES.alarmStates, date) || createDailyAlarmState(date); const prayerTimes = routine.prayerTimes || await this.adapter.get(STORE_NAMES.prayerTimings, date); const occurrences = routine.occurrences || []; return { date, weekday: routine.weekday, activities: clone(routine.activitySnapshots || []), occurrences: clone(occurrences), completions, alarmsEnabled: alarm.enabled, disabledAlarmIds: clone(alarm.disabledAlarmIds), prayerTimes }; }
  async getStoredDays() { const routines = await this.adapter.getAll(STORE_NAMES.dailyRoutines); return Promise.all(routines.sort((a, b) => a.date.localeCompare(b.date)).map(({ date }) => this.getDay(date, false))); }
  async getMonth(month) { return (await this.getStoredDays()).filter(({ date }) => date.startsWith(`${month}-`)); }
  async getYear(year) { return (await this.getStoredDays()).filter(({ date }) => date.startsWith(`${year}-`)); }
  async ensureMonth(month) { const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(); const result = []; for (let day = 1; day <= days; day++) result.push(await this.ensureDay(`${month}-${String(day).padStart(2, '0')}`)); return result; }
  async setCompletion(date, occurrenceOrActivityId, completed) { const day = await this.ensureDay(date); const occurrence = day.occurrences.find(({ id }) => id === occurrenceOrActivityId) || day.occurrences.find(({ activityId }) => activityId === occurrenceOrActivityId); if (!occurrence) throw new Error('Occurrence is not part of this daily record.'); await this.adapter.put(STORE_NAMES.completions, createOccurrenceCompletionRecord(date, occurrence.id, occurrence.activityId, occurrence.timeSlotId, completed)); }
  async setDayAlarms(date, enabled) { const day = await this.ensureDay(date); const ids = [...new Set([...SYSTEM_ALARM_IDS, ...day.occurrences.filter(({ notificationEnabled }) => notificationEnabled).map(({ notificationId }) => notificationId)])]; await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date, { enabled, disabledAlarmIds: enabled ? [] : ids })); }
  async setAlarm(date, alarmId, enabled) { const day = await this.ensureDay(date); const current = await this.adapter.get(STORE_NAMES.alarmStates, date) || createDailyAlarmState(date); const disabledAlarmIds = enabled ? current.disabledAlarmIds.filter((id) => id !== alarmId) : [...new Set([...current.disabledAlarmIds, alarmId])]; const activeIds = day.occurrences.filter(({ notificationEnabled }) => notificationEnabled).map(({ notificationId }) => notificationId); await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date, { enabled: !activeIds.length || !activeIds.every((id) => disabledAlarmIds.includes(id)), disabledAlarmIds })); }
  async setManyAlarms(days, alarmIds, enabled) { for (const day of days) for (const id of alarmIds) await this.setAlarm(day.date, id, enabled); }
}

export async function resetDevelopmentDatabase(adapter) { if (!import.meta.env?.DEV && typeof process === 'undefined') throw new Error('Database reset is development-only.'); await adapter.destroy(); }
