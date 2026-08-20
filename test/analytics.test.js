import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsForDays } from '../src/ui/analytics.js';

test('analytics computes completion, perfect days and streaks', () => {
  const days = [
    { date: '2026-08-01', occurrences: [{id:'a',activityId:'read',activityName:'Read'}], completions: {a:true} },
    { date: '2026-08-02', occurrences: [{id:'b',activityId:'read',activityName:'Read'}], completions: {b:true} },
    { date: '2026-08-03', occurrences: [{id:'c',activityId:'read',activityName:'Read'}], completions: {c:false} }
  ];
  const stats = analyticsForDays(days);
  assert.equal(stats.completed, 2);
  assert.equal(stats.possible, 3);
  assert.equal(stats.rate, 67);
  assert.equal(stats.perfectDays, 2);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.bestStreak, 2);
});
