export const SCHEMA_VERSION = 1;

export const STORE_NAMES = Object.freeze({
  metadata: 'metadata',
  settings: 'settings',
  activities: 'activities',
  dailyRoutines: 'dailyRoutines',
  completions: 'completions',
  alarmStates: 'alarmStates',
  fastingRanges: 'fastingRanges',
  prayerTimings: 'prayerTimings',
});

export function createUserSettings(overrides = {}) {
  return { id: 'default', timeZone: 'Asia/Kolkata', progressMode: 'up-to-today', createdAt: new Date().toISOString(), ...overrides };
}

export function createActivityDefinition(input) {
  return {
    id: input.id,
    name: input.name.trim(),
    defaultTime: input.defaultTime || '',
    prayerKey: input.prayerKey || null,
    alarmId: input.alarmId || null,
    notificationEnabled: Boolean(input.notificationEnabled ?? input.alarmId),
    enabled: input.enabled !== false,
    protected: Boolean(input.protected),
    system: Boolean(input.system),
    order: Number(input.order),
    deletedAt: input.deletedAt || null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function createDailyRoutineRecord(date, weekday, activitySnapshots) {
  return { date, weekday, activitySnapshots: structuredClone(activitySnapshots), createdAt: new Date().toISOString() };
}

export function createCompletionRecord(date, activityId, completed = false) {
  return { id: `${date}:${activityId}`, date, activityId, completed: Boolean(completed), updatedAt: new Date().toISOString() };
}

export function createDailyAlarmState(date, overrides = {}) {
  return { date, enabled: true, disabledAlarmIds: [], updatedAt: new Date().toISOString(), ...overrides };
}

export function createFastingDateRange(input) {
  return { id: input.id, start: input.start, end: input.end, label: input.label || '', enabled: input.enabled !== false };
}

export function createPrayerTimingRecord(date, timings) {
  return { date, ...timings, source: timings.source || 'bundled-mock-v1' };
}
