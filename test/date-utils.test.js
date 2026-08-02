import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysInMonth, isInRanges, weekdayFor } from '../src/date-utils.js';

test('date navigation remains calendar-safe across month boundaries', () => assert.equal(addDays('2026-08-31', 1), '2026-09-01'));
test('leap-year month length is calculated dynamically', () => assert.equal(daysInMonth('2028-02'), 29));
test('weekdays are evaluated in Asia/Kolkata', () => assert.equal(weekdayFor('2026-08-02'), 'Sunday'));
test('configurable fasting ranges include their boundaries', () => assert.equal(isInRanges('2027-02-07', [{ start: '2027-02-07', end: '2027-03-09' }]), true));
