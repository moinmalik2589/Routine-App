import { createSchedule, createTimeSlot } from '../scheduling/schedule.js';

export const APPLICATION_SCHEMA_VERSION = 2;
export const SCHEMA_VERSION = APPLICATION_SCHEMA_VERSION;

export const STORE_NAMES = Object.freeze({
  metadata: 'metadata',
  settings: 'settings',
  activities: 'activities',
  dailyRoutines: 'dailyRoutines',
  completions: 'completions',
  alarmStates: 'alarmStates',
  fastingRanges: 'fastingRanges',
  prayerTimings: 'prayerTimings',
  profiles: 'profiles',
});

export function createUserSettings(overrides = {}) {
  return { id: 'default', timeZone: 'Asia/Kolkata', progressMode: 'up-to-today', createdAt: new Date().toISOString(), ...overrides };
}

export function createActivityDefinition(input) {
  const legacySlot = input.defaultTime || input.prayerKey ? [createTimeSlot({ id: `${input.id}-time-1`, time: input.defaultTime || '', prayerKey: input.prayerKey, notificationEnabled: input.notificationEnabled ?? input.alarmId })] : [];
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
    schedule: createSchedule(input.schedule),
    timeSlots: (input.timeSlots || legacySlot).map((slot, index) => createTimeSlot(slot, `${input.id}-time-${index + 1}`)),
  };
}

export function createDailyRoutineRecord(date, weekday, activitySnapshots, occurrences = [], prayerSettingsFingerprint = null, prayerTimes = null) {
  return { date, weekday, activitySnapshots: structuredClone(activitySnapshots), occurrences: structuredClone(occurrences), prayerSettingsFingerprint, prayerTimes: prayerTimes ? structuredClone(prayerTimes) : null, createdAt: new Date().toISOString() };
}

export function createCompletionRecord(date, activityId, completed = false) {
  return { id: `${date}:${activityId}`, date, activityId, completed: Boolean(completed), updatedAt: new Date().toISOString() };
}

export function createOccurrenceCompletionRecord(date, occurrenceId, activityId, timeSlotId, completed = false) {
  return { id: `${date}:${occurrenceId}`, date, occurrenceId, activityId, timeSlotId, completed: Boolean(completed), updatedAt: new Date().toISOString() };
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
