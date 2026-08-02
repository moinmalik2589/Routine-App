import { daysInMonth, isInRanges, weekdayFor } from '../date-utils.js';
import { DEFAULT_ACTIVITIES, DEFAULT_FASTING_RANGES, SYSTEM_ALARM_IDS, defaultPrayerTimings } from './defaults.js';
import { SCHEMA_VERSION, STORE_NAMES, createActivityDefinition, createCompletionRecord, createDailyAlarmState, createDailyRoutineRecord, createPrayerTimingRecord, createUserSettings } from './models.js';

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

export class RoutineRepository {
  constructor(adapter) { this.adapter = adapter; }

  async initialize() {
    await this.adapter.open();
    const current = await this.adapter.get(STORE_NAMES.metadata, 'schemaVersion');
    const fromVersion = current?.value || 0;
    await this.runMigrations(fromVersion);
    if ((await this.adapter.getAll(STORE_NAMES.activities)).length === 0) for (const activity of DEFAULT_ACTIVITIES) await this.adapter.put(STORE_NAMES.activities, clone(activity));
    if ((await this.adapter.getAll(STORE_NAMES.fastingRanges)).length === 0) for (const range of DEFAULT_FASTING_RANGES) await this.adapter.put(STORE_NAMES.fastingRanges, clone(range));
    if (!(await this.adapter.get(STORE_NAMES.settings, 'default'))) await this.adapter.put(STORE_NAMES.settings, createUserSettings());
    return { schemaVersion: SCHEMA_VERSION, migratedFrom: fromVersion };
  }

  async runMigrations(fromVersion) {
    if (fromVersion < 1) await this.adapter.put(STORE_NAMES.metadata, { key: 'schemaVersion', value: 1, migratedAt: now() });
    const stored = await this.adapter.get(STORE_NAMES.metadata, 'schemaVersion');
    if (stored.value !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${stored.value}`);
  }

  getSchemaVersion() { return this.adapter.get(STORE_NAMES.metadata, 'schemaVersion'); }
  getSettings() { return this.adapter.get(STORE_NAMES.settings, 'default'); }
  async updateSettings(changes) { const settings = { ...(await this.getSettings()), ...changes, id: 'default', updatedAt: now() }; await this.adapter.put(STORE_NAMES.settings, settings); return settings; }

  async getActivities({ includeDeleted = false, includeDisabled = true } = {}) {
    return (await this.adapter.getAll(STORE_NAMES.activities)).filter((item) => (includeDeleted || !item.deletedAt) && (includeDisabled || item.enabled)).sort((a, b) => a.order - b.order);
  }

  async addActivity(input) {
    const activities = await this.getActivities({ includeDeleted: true });
    const id = input.id || `activity-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    if (activities.some((item) => item.id === id)) throw new Error('Activity ID already exists.');
    const activity = createActivityDefinition({ id, name: input.name, defaultTime: input.defaultTime, alarmId: input.notificationEnabled ? `CUSTOM_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : null, notificationEnabled: input.notificationEnabled, order: activities.length });
    await this.adapter.put(STORE_NAMES.activities, activity); return activity;
  }

  async editActivity(id, changes) {
    const activity = await this.adapter.get(STORE_NAMES.activities, id); if (!activity || activity.deletedAt) throw new Error('Activity not found.');
    const allowed = ['name', 'defaultTime', 'enabled', 'notificationEnabled']; const next = { ...activity };
    for (const key of allowed) if (Object.hasOwn(changes, key)) next[key] = key === 'name' ? String(changes[key]).trim() : changes[key];
    if (!next.name) throw new Error('Activity name is required.');
    if (!next.system && Object.hasOwn(changes, 'notificationEnabled')) next.alarmId = changes.notificationEnabled ? (next.alarmId || `CUSTOM_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`) : null;
    next.updatedAt = now(); await this.adapter.put(STORE_NAMES.activities, next); return next;
  }

  async reorderActivities(orderedIds) {
    const activities = await this.getActivities(); const known = new Map(activities.map((item) => [item.id, item]));
    if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !known.has(id))) throw new Error('Invalid activity order.');
    const fullOrder = [...orderedIds, ...activities.map(({ id }) => id).filter((id) => !orderedIds.includes(id))];
    for (const [order, id] of fullOrder.entries()) await this.adapter.put(STORE_NAMES.activities, { ...known.get(id), order, updatedAt: now() });
    return this.getActivities();
  }

  async softDeleteActivity(id) {
    const activity = await this.adapter.get(STORE_NAMES.activities, id); if (!activity) throw new Error('Activity not found.'); if (activity.protected) throw new Error('Protected prayer activities cannot be removed. Disable them instead.');
    const deleted = { ...activity, enabled: false, deletedAt: now(), updatedAt: now() }; await this.adapter.put(STORE_NAMES.activities, deleted); return deleted;
  }

  async getFastingRanges() { return (await this.adapter.getAll(STORE_NAMES.fastingRanges)).filter(({ enabled }) => enabled).sort((a, b) => a.start.localeCompare(b.start)); }
  async isFastingDay(day) { return day.weekday === 'Friday' || isInRanges(day.date, await this.getFastingRanges()); }

  async ensureDay(date) {
    let routine = await this.adapter.get(STORE_NAMES.dailyRoutines, date);
    if (!routine) {
      const definitions = await this.getActivities({ includeDisabled: false });
      routine = createDailyRoutineRecord(date, weekdayFor(date), definitions);
      await this.adapter.put(STORE_NAMES.dailyRoutines, routine);
      for (const activity of definitions) await this.adapter.put(STORE_NAMES.completions, createCompletionRecord(date, activity.id));
      await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date));
      await this.adapter.put(STORE_NAMES.prayerTimings, createPrayerTimingRecord(date, defaultPrayerTimings(date)));
    }
    return this.getDay(date, false);
  }

  async getDay(date, create = true) {
    const routine = await this.adapter.get(STORE_NAMES.dailyRoutines, date); if (!routine) return create ? this.ensureDay(date) : null;
    const allCompletions = await this.adapter.getAll(STORE_NAMES.completions); const completions = Object.fromEntries(allCompletions.filter((item) => item.date === date).map((item) => [item.activityId, item.completed]));
    const alarm = await this.adapter.get(STORE_NAMES.alarmStates, date) || createDailyAlarmState(date);
    const prayerTimes = await this.adapter.get(STORE_NAMES.prayerTimings, date) || createPrayerTimingRecord(date, defaultPrayerTimings(date));
    return { date, weekday: routine.weekday, activities: clone(routine.activitySnapshots), completions, alarmsEnabled: alarm.enabled, disabledAlarmIds: clone(alarm.disabledAlarmIds), prayerTimes };
  }

  async getStoredDays() { const routines = await this.adapter.getAll(STORE_NAMES.dailyRoutines); return Promise.all(routines.sort((a, b) => a.date.localeCompare(b.date)).map(({ date }) => this.getDay(date, false))); }
  async getMonth(month) { return (await this.getStoredDays()).filter(({ date }) => date.startsWith(`${month}-`)); }
  async getYear(year) { return (await this.getStoredDays()).filter(({ date }) => date.startsWith(`${year}-`)); }
  async ensureMonth(month) { return Promise.all(Array.from({ length: daysInMonth(month) }, (_, index) => this.ensureDay(`${month}-${String(index + 1).padStart(2, '0')}`))); }

  async setCompletion(date, activityId, completed) {
    const day = await this.ensureDay(date); if (!day.activities.some(({ id }) => id === activityId)) throw new Error('Activity is not part of this daily record.');
    await this.adapter.put(STORE_NAMES.completions, createCompletionRecord(date, activityId, completed));
  }

  async setDayAlarms(date, enabled) { const day = await this.ensureDay(date); const alarmIds = [...new Set([...SYSTEM_ALARM_IDS, ...day.activities.map(({ alarmId, notificationEnabled }) => notificationEnabled && alarmId).filter(Boolean)])]; await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date, { enabled, disabledAlarmIds: enabled ? [] : alarmIds })); }
  async setAlarm(date, alarmId, enabled) {
    const day = await this.ensureDay(date); const current = await this.adapter.get(STORE_NAMES.alarmStates, date) || createDailyAlarmState(date);
    const disabledAlarmIds = enabled ? current.disabledAlarmIds.filter((id) => id !== alarmId) : [...new Set([...current.disabledAlarmIds, alarmId])];
    const activeIds = [...new Set([...SYSTEM_ALARM_IDS, ...day.activities.map(({ alarmId: id, notificationEnabled }) => notificationEnabled && id).filter(Boolean)])];
    await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date, { enabled: !activeIds.every((id) => disabledAlarmIds.includes(id)), disabledAlarmIds }));
  }
  async setManyAlarms(days, alarmIds, enabled) { for (const day of days) for (const alarmId of alarmIds) await this.setAlarm(day.date, alarmId, enabled); }
}

export async function resetDevelopmentDatabase(adapter) {
  if (!import.meta.env?.DEV && typeof process === 'undefined') throw new Error('Database reset is development-only.');
  await adapter.destroy();
}
