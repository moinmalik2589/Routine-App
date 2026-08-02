import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbAdapter } from '../src/data/indexeddb-adapter.js';
import { RoutineRepository } from '../src/data/routine-repository.js';
import { DEFAULT_ACTIVITIES } from '../src/data/defaults.js';
import { SCHEMA_VERSION, STORE_NAMES } from '../src/data/models.js';
import { calculateActivityProgress, calculateMonthlyProgress } from '../src/data/progress.js';

async function setup(name = `test-${Math.random()}`) {
  const indexedDB = new IDBFactory();
  const adapter = new IndexedDbAdapter({ name, indexedDB });
  const repository = new RoutineRepository(adapter);
  const result = await repository.initialize();
  return { indexedDB, adapter, repository, result };
}

test('database initialization creates schema version 1 and named stores', async () => {
  const { adapter, result } = await setup();
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual([...adapter.db.objectStoreNames], Object.values(STORE_NAMES).sort());
  adapter.close();
});

test('default activity seeding occurs once and matches the required list', async () => {
  const { repository, adapter } = await setup();
  assert.deepEqual((await repository.getActivities()).map(({ name }) => name), DEFAULT_ACTIVITIES.map(({ name }) => name));
  await repository.initialize();
  assert.equal((await repository.getActivities()).length, 13);
  adapter.close();
});

test('opening an absent date creates a stable named daily record', async () => {
  const { repository, adapter } = await setup();
  const day = await repository.getDay('2026-08-02');
  assert.equal(day.weekday, 'Sunday');
  assert.equal(day.activities.length, 13);
  assert.equal((await repository.getMonth('2026-08')).length, 1);
  assert.ok(await adapter.get(STORE_NAMES.prayerTimings, '2026-08-02'));
  adapter.close();
});

test('checkbox changes persist when the repository is reopened', async () => {
  const { indexedDB, adapter, repository } = await setup('completion-persistence');
  await repository.setCompletion('2026-08-02', 'wake-up', true); adapter.close();
  const reopened = new RoutineRepository(new IndexedDbAdapter({ name: 'completion-persistence', indexedDB })); await reopened.initialize();
  assert.equal((await reopened.getDay('2026-08-02')).completions['wake-up'], true); reopened.adapter.close();
});

test('daily and individual alarm state persist when reopened', async () => {
  const { indexedDB, adapter, repository } = await setup('alarm-persistence');
  await repository.setDayAlarms('2026-08-03', false); await repository.setAlarm('2026-08-03', 'FAJR', true); adapter.close();
  const reopened = new RoutineRepository(new IndexedDbAdapter({ name: 'alarm-persistence', indexedDB })); await reopened.initialize(); const day = await reopened.getDay('2026-08-03');
  assert.equal(day.alarmsEnabled, true); assert.equal(day.disabledAlarmIds.includes('FAJR'), false); assert.equal(day.disabledAlarmIds.includes('WAKEUP'), true); reopened.adapter.close();
});

test('activities can be added, edited, disabled, reordered and soft-deleted', async () => {
  const { repository, adapter } = await setup();
  const added = await repository.addActivity({ id: 'reading', name: 'Reading', defaultTime: '9:00 PM', notificationEnabled: true });
  assert.ok(added.alarmId); await repository.editActivity('reading', { name: 'Read', defaultTime: '9:30 PM', enabled: false });
  assert.equal((await repository.getActivities()).find(({ id }) => id === 'reading').name, 'Read');
  await repository.editActivity('reading', { enabled: true }); const ordered = await repository.reorderActivities(['reading']); assert.equal(ordered[0].id, 'reading');
  await repository.softDeleteActivity('reading'); assert.equal((await repository.getActivities()).some(({ id }) => id === 'reading'), false); assert.ok((await repository.getActivities({ includeDeleted: true })).find(({ id }) => id === 'reading').deletedAt);
  await assert.rejects(() => repository.softDeleteActivity('fajr'), /Protected prayer/); adapter.close();
});

test('old completion history and snapshots survive later definition changes and removal', async () => {
  const { repository, adapter } = await setup();
  await repository.addActivity({ id: 'journal', name: 'Journal', defaultTime: '8:00 PM' }); await repository.getDay('2026-08-04'); await repository.setCompletion('2026-08-04', 'journal', true);
  await repository.editActivity('journal', { name: 'New Journal Name' }); await repository.softDeleteActivity('journal');
  const oldDay = await repository.getDay('2026-08-04'); const newDay = await repository.getDay('2026-08-05');
  assert.equal(oldDay.activities.find(({ id }) => id === 'journal').name, 'Journal'); assert.equal(oldDay.completions.journal, true); assert.equal(newDay.activities.some(({ id }) => id === 'journal'), false); adapter.close();
});

test('monthly progress is calculated only from stored activity snapshots', async () => {
  const { repository, adapter } = await setup();
  await repository.getDay('2026-08-01'); await repository.getDay('2026-08-02'); await repository.setCompletion('2026-08-01', 'wake-up', true); await repository.setCompletion('2026-08-02', 'wake-up', true);
  const progress = calculateMonthlyProgress(await repository.getMonth('2026-08')); assert.deepEqual(progress, { completed: 2, possible: 26, percent: 8 }); adapter.close();
});

test('yearly activity calculations use persisted records across months', async () => {
  const { repository, adapter } = await setup();
  await repository.getDay('2026-01-01'); await repository.getDay('2026-12-31'); await repository.setCompletion('2026-01-01', 'fajr', true);
  assert.deepEqual(calculateActivityProgress(await repository.getYear('2026'), 'fajr'), { completed: 1, possible: 2, percent: 50 }); adapter.close();
});

test('schema migration is idempotent and never reseeds over user data', async () => {
  const { indexedDB, adapter, repository, result } = await setup('migration'); assert.equal(result.migratedFrom, 0);
  await repository.editActivity('wake-up', { name: 'My Wake Up' }); adapter.close();
  const reopened = new RoutineRepository(new IndexedDbAdapter({ name: 'migration', indexedDB })); const second = await reopened.initialize();
  assert.equal(second.migratedFrom, 1); assert.equal((await reopened.getActivities()).find(({ id }) => id === 'wake-up').name, 'My Wake Up'); assert.equal((await reopened.getSchemaVersion()).value, 1); reopened.adapter.close();
});
