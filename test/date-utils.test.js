import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysInMonth, isInRanges, todayIso, weekdayFor } from '../src/date-utils.js';

test('date navigation remains calendar-safe across month boundaries', () => assert.equal(addDays('2026-08-31', 1), '2026-09-01'));
test('leap-year month length is calculated dynamically', () => assert.equal(daysInMonth('2028-02'), 29));
test('weekdays are evaluated in Asia/Kolkata', () => assert.equal(weekdayFor('2026-08-02'), 'Sunday'));
test('configurable fasting ranges include their boundaries', () => assert.equal(isInRanges('2027-02-07', [{ start: '2027-02-07', end: '2027-03-09' }]), true));
test('Asia/Kolkata midnight boundary advances at 18:30 UTC', () => {
  assert.equal(todayIso(new Date('2026-08-01T18:29:59Z')), '2026-08-01');
  assert.equal(todayIso(new Date('2026-08-01T18:30:00Z')), '2026-08-02');
});
