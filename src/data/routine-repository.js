import { isInRanges, todayIso, weekdayFor } from '../date-utils.js';
import { DEFAULT_ACTIVITIES, DEFAULT_FASTING_RANGES, PROTECTED_ACTIVITY_RULES, PROTECTED_PRAYER_ACTIVITY_IDS, SYSTEM_ALARM_IDS, defaultPrayerTimings } from './defaults.js';
import { SCHEMA_VERSION, STORE_NAMES, createActivityDefinition, createCompletionRecord, createDailyAlarmState, createDailyRoutineRecord, createOccurrenceCompletionRecord, createUserSettings } from './models.js';
import { scheduleApplies } from '../scheduling/schedule.js';
import { DEFAULT_LOCATION_SUGGESTION, createLocationProfile, normalizeStoredProfile } from '../location/location-model.js';
import { automaticPrayerSettings, resetPrayerAdjustments } from '../prayer/automatic-settings.js';
import { PrayerCacheService } from '../prayer/prayer-cache.js';
import { PRAYER_CALCULATOR_VERSION, PRAYER_CACHE_FORMAT_VERSION, prayerSettingsFingerprint } from '../prayer/prayer-calculator.js';

const clone = (value) => structuredClone(value); const now = () => new Date().toISOString();
function subtractMinutes(time, minutes) { const match = time?.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!match) return time; const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0); const total = ((hour * 60 + Number(match[2]) - Number(minutes)) % 1440 + 1440) % 1440; const resultHour = Math.floor(total / 60), suffix = resultHour >= 12 ? 'PM' : 'AM'; return `${resultHour % 12 || 12}:${String(total % 60).padStart(2, '0')} ${suffix}`; }
function normalizeActivity(activity) { return createActivityDefinition(activity); }
function notificationId(activity, slot) { return activity.alarmId ? `${activity.alarmId}:${slot.id}` : `ACTIVITY:${activity.id}:${slot.id}`; }
function isProtectedPrayerActivity(activity) { return Boolean(activity?.protected || PROTECTED_PRAYER_ACTIVITY_IDS.includes(activity?.id)); }

export class RoutineRepository {
  constructor(adapter, { prayerCache, logger = console } = {}) { this.adapter = adapter; this.prayerCache = prayerCache || new PrayerCacheService(adapter); this.logger = logger; this.initializationPromise = null; this.initializationResult = null; this.cacheWarmPromise = null; this.prayerVersionPromise = null; }

  initialize() {
    if (this.initializationResult) return Promise.resolve(this.initializationResult);
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = this.performInitialization().then((result) => { this.initializationResult = result; return result; }).catch((error) => { this.initializationPromise = null; throw error; });
    return this.initializationPromise;
  }

  async performInitialization() {
    await this.adapter.open(); const current = await this.adapter.get(STORE_NAMES.metadata, 'schemaVersion'); const fromVersion = current?.value || 0; await this.runMigrations(fromVersion);
    if ((await this.adapter.getAll(STORE_NAMES.activities)).length === 0) for (const activity of DEFAULT_ACTIVITIES) await this.adapter.put(STORE_NAMES.activities, clone(activity));
    await this.reconcileProtectedActivities();
    if ((await this.adapter.getAll(STORE_NAMES.fastingRanges)).length === 0) for (const range of DEFAULT_FASTING_RANGES) await this.adapter.put(STORE_NAMES.fastingRanges, clone(range));
    if (!(await this.adapter.get(STORE_NAMES.settings, 'default'))) await this.adapter.put(STORE_NAMES.settings, createUserSettings());
    return { schemaVersion: SCHEMA_VERSION, migratedFrom: fromVersion, diagnostics: await this.adapter.diagnostics() };
  }
  ensureInitialized() { return this.initialize(); }

  async reconcileProtectedActivities() {
    const defaults = new Map(DEFAULT_ACTIVITIES.map((activity) => [activity.id, activity]));
    for (const stored of await this.adapter.getAll(STORE_NAMES.activities)) {
      const rule = PROTECTED_ACTIVITY_RULES[stored.id]; if (!rule) continue; const canonical = defaults.get(stored.id); const normalized = normalizeActivity(stored);
      const slot = normalized.timeSlots[0] || canonical.timeSlots[0];
      await this.adapter.put(STORE_NAMES.activities, normalizeActivity({ ...normalized, name: canonical.name, protected: true, system: true, prayerKey: rule.prayerKey, alarmId: canonical.alarmId, schedule: canonical.schedule, deletedAt: null, timeSlots: [{ ...canonical.timeSlots[0], id: canonical.timeSlots[0].id, enabled: slot.enabled, notificationEnabled: slot.notificationEnabled, notificationOffsetMinutes: slot.notificationOffsetMinutes, prayerKey: rule.slotPrayerKey }] }));
    }
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

  async getSchemaVersion() { await this.ensureInitialized(); return this.adapter.get(STORE_NAMES.metadata, 'schemaVersion'); }
  async getSettings() { await this.ensureInitialized(); return this.adapter.get(STORE_NAMES.settings, 'default'); }
  async updateSettings(changes) { const settings = { ...(await this.getSettings()), ...changes, id: 'default', updatedAt: now() }; await this.adapter.put(STORE_NAMES.settings, settings); return settings; }
  async getLocationProfile() { await this.ensureInitialized(); const stored = await this.adapter.get(STORE_NAMES.profiles, 'default'); return normalizeStoredProfile(stored); }
  async saveLocationProfile(input, { currentDate = todayIso(), warmCache = true } = {}) {
    await this.ensureInitialized(); const previous = await this.getLocationProfile(); const previousFingerprint = previous ? prayerSettingsFingerprint(previous) : null;
    const profile = createLocationProfile({ ...previous, ...input, ...automaticPrayerSettings(input), displayName: input.displayName || previous?.displayName, adjustments: input.adjustments || previous?.adjustments || resetPrayerAdjustments(), sehriOffsetMinutes: input.sehriOffsetMinutes ?? previous?.sehriOffsetMinutes ?? 30, createdAt: previous?.createdAt, locationVersion: previous ? String((Number(previous.locationVersion) || 0) + 1) : '1' });
    try {
      await this.adapter.put(STORE_NAMES.profiles, profile);
      const invalidatedPrayerRecords = await this.prayerCache.invalidateFuture(currentDate, previousFingerprint);
      const generatedRecords = warmCache ? await this.prayerCache.warmCurrentAndNext(currentDate, profile) : [];
      const snapshotRefresh = await this.refreshPrayerDrivenSnapshots(currentDate, profile);
      this.lastProfileSaveDiagnostics = { coordinates: { latitude: profile.latitude, longitude: profile.longitude }, timeZone: profile.timeZone, oldFingerprint: previousFingerprint, newFingerprint: prayerSettingsFingerprint(profile), regeneratedPrayerRecords: generatedRecords.length, invalidatedPrayerRecords, snapshotRefresh, homeRefreshed: false };
      return profile;
    } catch (error) {
      if (previous) await this.adapter.put(STORE_NAMES.profiles, previous); else await this.adapter.delete(STORE_NAMES.profiles, 'default');
      throw error;
    }
  }
  async saveDisplayName(displayName) { await this.ensureInitialized(); const profile = await this.getLocationProfile(); if (!profile) throw new Error('Complete location setup before updating your name.'); const name = String(displayName || '').trim(); if (!name) throw new Error('Your name is required.'); const updated = { ...profile, displayName: name, updatedAt: now() }; await this.adapter.put(STORE_NAMES.profiles, updated); return updated; }
  async savePrayerAdjustments({ adjustments, sehriOffsetMinutes }, options = {}) { const profile = await this.getLocationProfile(); if (!profile) throw new Error('Complete profile setup first.'); return this.saveLocationProfile({ ...profile, adjustments: { ...resetPrayerAdjustments(), ...(adjustments || {}) }, sehriOffsetMinutes }, options); }
  async getPrayerProfile() { return await this.getLocationProfile() || createLocationProfile(DEFAULT_LOCATION_SUGGESTION); }
  async ensurePrayerCalculatorCurrent(currentDate = todayIso()) { await this.ensureInitialized(); if (this.prayerVersionPromise) return this.prayerVersionPromise; this.prayerVersionPromise = (async () => { const stored = await this.adapter.get(STORE_NAMES.metadata, 'prayerCalculatorVersion'); if (stored?.value === PRAYER_CALCULATOR_VERSION) return { upgraded: false, invalidated: 0, regenerated: 0 }; const profile = await this.getLocationProfile(); if (!profile) { await this.adapter.put(STORE_NAMES.metadata, { key: 'prayerCalculatorVersion', value: PRAYER_CALCULATOR_VERSION, cacheFormatVersion: PRAYER_CACHE_FORMAT_VERSION, updatedAt: now() }); return { upgraded: true, invalidated: 0, regenerated: 0 }; } const invalidated = await this.prayerCache.invalidateIncompatibleFuture(currentDate); const generated = await this.prayerCache.warmCurrentAndNext(currentDate, profile); const snapshots = await this.refreshPrayerDrivenSnapshots(currentDate, profile); await this.adapter.put(STORE_NAMES.metadata, { key: 'prayerCalculatorVersion', value: PRAYER_CALCULATOR_VERSION, cacheFormatVersion: PRAYER_CACHE_FORMAT_VERSION, updatedAt: now() }); return { upgraded: true, invalidated, regenerated: generated.length, snapshots }; })().catch((error) => { this.prayerVersionPromise = null; throw error; }); return this.prayerVersionPromise; }
  async warmPrayerCache(currentDate = todayIso()) { await this.ensureInitialized(); this.cacheWarmPromise = this.prayerCache.warmCurrentAndNext(currentDate, await this.getPrayerProfile()).catch((error) => { this.logger.warn('Prayer cache warming failed; routine loading will use on-demand or fallback timings.', error); return []; }); return this.cacheWarmPromise; }

  async getActivities({ includeDeleted = false, includeDisabled = true } = {}) { await this.ensureInitialized(); return (await this.adapter.getAll(STORE_NAMES.activities)).map(normalizeActivity).filter((item) => (includeDeleted || !item.deletedAt) && (includeDisabled || item.enabled)).sort((a, b) => a.order - b.order); }
  async addActivity(input) { const activities = await this.getActivities({ includeDeleted: true }); const id = input.id || `activity-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; if (activities.some((item) => item.id === id)) throw new Error('Activity ID already exists.'); const activity = createActivityDefinition({ ...input, id, order: activities.length }); await this.adapter.put(STORE_NAMES.activities, activity); return activity; }
  async editActivity(id, changes) { const storedActivity = await this.adapter.get(STORE_NAMES.activities, id); if (!storedActivity || storedActivity.deletedAt) throw new Error('Activity not found.'); const activity = normalizeActivity(storedActivity); const allowed = ['name', 'defaultTime', 'enabled', 'notificationEnabled', 'schedule', 'timeSlots']; const permitted = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)));
    if (isProtectedPrayerActivity(activity)) {
      const forbidden = ['name', 'defaultTime', 'schedule'].filter((key) => key in changes);
      if ('timeSlots' in changes) {
        if (changes.timeSlots.length !== activity.timeSlots.length || changes.timeSlots.some((slot, index) => slot.id !== activity.timeSlots[index].id || slot.time !== activity.timeSlots[index].time || slot.prayerKey !== activity.timeSlots[index].prayerKey || slot.label !== activity.timeSlots[index].label)) forbidden.push('timeSlots');
        else permitted.timeSlots = activity.timeSlots.map((slot, index) => ({ ...slot, notificationEnabled: changes.timeSlots[index].notificationEnabled }));
      }
      if (forbidden.length) throw new Error(`Protected prayer activities cannot change ${forbidden.join(', ')}.`);
    }
    const next = normalizeActivity({ ...activity, ...permitted, id: activity.id, prayerKey: activity.prayerKey, alarmId: activity.alarmId, protected: activity.protected, system: activity.system, updatedAt: now() }); if (!next.name) throw new Error('Activity name is required.'); await this.adapter.put(STORE_NAMES.activities, next); return next; }
  async reorderActivities(orderedIds) { const activities = await this.getActivities(); const known = new Map(activities.map((item) => [item.id, item])); if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !known.has(id))) throw new Error('Invalid activity order.'); const currentProtected = activities.filter(isProtectedPrayerActivity).map(({ id }) => id); const nextProtected = orderedIds.filter((id) => isProtectedPrayerActivity(known.get(id))); if (currentProtected.some((id, index) => nextProtected[index] !== id)) throw new Error('Protected prayer activities cannot be reordered independently.'); const full = [...orderedIds, ...activities.map(({ id }) => id).filter((id) => !orderedIds.includes(id))]; for (const [order, id] of full.entries()) await this.adapter.put(STORE_NAMES.activities, { ...known.get(id), order, updatedAt: now() }); return this.getActivities(); }
  async softDeleteActivity(id) { const activity = await this.adapter.get(STORE_NAMES.activities, id); if (!activity) throw new Error('Activity not found.'); if (isProtectedPrayerActivity(activity)) throw new Error('Protected prayer activities cannot be removed. Disable them instead.'); const deleted = { ...activity, enabled: false, deletedAt: now(), updatedAt: now() }; await this.adapter.put(STORE_NAMES.activities, deleted); return deleted; }
  async getFastingRanges() { await this.ensureInitialized(); return (await this.adapter.getAll(STORE_NAMES.fastingRanges)).filter(({ enabled }) => enabled).sort((a, b) => a.start.localeCompare(b.start)); }
  async isFastingDay(date, weekday = weekdayFor(date)) { return weekday === 'Friday' || isInRanges(date, await this.getFastingRanges()); }

  occurrenceTime(activity, slot, date, weekday, prayer, fasting) {
    if (activity.id === 'wake-up' && fasting) return subtractMinutes(prayer.fajr, 40); if (activity.id === 'tahajjud' && fasting) return subtractMinutes(prayer.fajr, 15); if (activity.id === 'sehri') return fasting ? (prayer.sehri || `${prayer.sehriStart || subtractMinutes(prayer.fajr, 30)} - ${prayer.fajr}`) : null;
    if (activity.id === 'gym' && fasting && weekday !== 'Friday') return 'Evening'; if (activity.id === 'bath') return weekday === 'Friday' ? 'Pre-Jummah' : fasting ? 'Evening' : 'Post-Gym';
    return slot.prayerKey ? (prayer[slot.prayerKey] || prayer[activity.prayerKey] || slot.time || activity.defaultTime) : (slot.time || activity.defaultTime);
  }
  createOccurrence(activity, slot, time) { return { id: `${activity.id}:${slot.id}`, activityId: activity.id, activityName: activity.name, activityOrder: activity.order, timeSlotId: slot.id, time, label: slot.label || '', notificationEnabled: Boolean(slot.notificationEnabled), notificationOffsetMinutes: slot.notificationOffsetMinutes || 0, notificationId: notificationId(activity, slot) }; }

  async ensureDay(date) {
    await this.ensureInitialized();
    let routine = await this.adapter.get(STORE_NAMES.dailyRoutines, date); if (routine) return this.getDay(date, false);
    const weekday = weekdayFor(date), fasting = await this.isFastingDay(date, weekday), profile = await this.getPrayerProfile(); let prayer;
    try { prayer = await this.prayerCache.get(date, profile); } catch (error) { this.logger.error('Prayer calculation/cache failed for routine date; using offline fallback timings.', { date, error }); const fallback = defaultPrayerTimings(date); prayer = { date, ...fallback, fajr: fallback.fastStart, sunrise: fallback.fajrEnd, dhuhr: fallback.zohar, asr: fallback.ashar, maghrib: fallback.fastEnd, isha: fallback.isha, settingsFingerprint: `fallback:${profile.locationVersion}`, generatedAt: now() }; }
    const definitions = (await this.getActivities({ includeDisabled: false })).filter(({ schedule }) => scheduleApplies(schedule, date)); const occurrences = definitions.flatMap((activity) => activity.timeSlots.filter(({ enabled }) => enabled).map((slot) => this.createOccurrence(activity, slot, this.occurrenceTime(activity, slot, date, weekday, prayer, fasting))).filter(({ time }) => time));
    routine = createDailyRoutineRecord(date, weekday, definitions, occurrences, prayer.settingsFingerprint, prayer); await this.adapter.put(STORE_NAMES.dailyRoutines, routine);
    for (const occurrence of occurrences) await this.adapter.put(STORE_NAMES.completions, createOccurrenceCompletionRecord(date, occurrence.id, occurrence.activityId, occurrence.timeSlotId)); await this.adapter.put(STORE_NAMES.alarmStates, createDailyAlarmState(date)); return this.getDay(date, false);
  }
  async buildRoutine(date, profile = null) {
    const weekday = weekdayFor(date), fasting = await this.isFastingDay(date, weekday), activeProfile = profile || await this.getPrayerProfile(); let prayer;
    try { prayer = await this.prayerCache.get(date, activeProfile); } catch (error) { this.logger.error('Prayer calculation/cache failed while rebuilding routine.', { date, error }); throw error; }
    const definitions = (await this.getActivities({ includeDisabled: false })).filter(({ schedule }) => scheduleApplies(schedule, date));
    const occurrences = definitions.flatMap((activity) => activity.timeSlots.filter(({ enabled }) => enabled).map((slot) => this.createOccurrence(activity, slot, this.occurrenceTime(activity, slot, date, weekday, prayer, fasting))).filter(({ time }) => time));
    return createDailyRoutineRecord(date, weekday, definitions, occurrences, prayer.settingsFingerprint, prayer);
  }
  async refreshPrayerDrivenSnapshots(currentDate, profile) {
    const routines = await this.adapter.getAll(STORE_NAMES.dailyRoutines); let rebuilt = 0, updated = 0;
    for (const routine of routines.filter(({ date }) => date >= currentDate)) {
      const completionRecords = (await this.adapter.getAll(STORE_NAMES.completions)).filter(({ date }) => date === routine.date); const completed = new Set(completionRecords.filter(({ completed }) => completed).map(({ occurrenceId, activityId }) => occurrenceId || activityId)); const fresh = await this.buildRoutine(routine.date, profile);
      if (!completed.size) { await this.adapter.put(STORE_NAMES.dailyRoutines, { ...fresh, createdAt: routine.createdAt, prayerRefreshedAt: now() }); rebuilt++; continue; }
      const freshById = new Map(fresh.occurrences.map((occurrence) => [occurrence.id, occurrence]));
      const occurrences = (routine.occurrences || []).map((occurrence) => isProtectedPrayerActivity({ id: occurrence.activityId }) && !completed.has(occurrence.id) && freshById.has(occurrence.id) ? { ...occurrence, time: freshById.get(occurrence.id).time, notificationEnabled: freshById.get(occurrence.id).notificationEnabled } : occurrence);
      await this.adapter.put(STORE_NAMES.dailyRoutines, { ...routine, occurrences, prayerTimes: fresh.prayerTimes, prayerSettingsFingerprint: fresh.prayerSettingsFingerprint, prayerRefreshedAt: now() }); updated++;
    }
    return { rebuilt, updated };
  }
  async getDay(date, create = true) { await this.ensureInitialized(); const routine = await this.adapter.get(STORE_NAMES.dailyRoutines, date); if (!routine) return create ? this.ensureDay(date) : null; const records = (await this.adapter.getAll(STORE_NAMES.completions)).filter((item) => item.date === date); const completions = Object.fromEntries(records.map((item) => [item.occurrenceId || item.activityId, item.completed])); const alarm = await this.adapter.get(STORE_NAMES.alarmStates, date) || createDailyAlarmState(date); const prayerTimes = routine.prayerTimes || await this.adapter.get(STORE_NAMES.prayerTimings, date); const occurrences = routine.occurrences || []; return { date, weekday: routine.weekday, activities: clone(routine.activitySnapshots || []), occurrences: clone(occurrences), completions, alarmsEnabled: alarm.enabled, disabledAlarmIds: clone(alarm.disabledAlarmIds), prayerTimes }; }
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
