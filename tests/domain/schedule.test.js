import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_WEEKDAYS, dueDateInMonth, periodBounds, scheduleAt, validateSchedule, validateSchedules,
} from '../../src/domain/schedule.js';
import { onDay, perMonth, perWeek, weekdaysSchedule } from './helpers.js';

test('validateSchedule: geldige schema\'s', () => {
  assert.deepEqual(validateSchedule(weekdaysSchedule(ALL_WEEKDAYS)), []);
  assert.deepEqual(validateSchedule(perWeek(2)), []);
  assert.deepEqual(validateSchedule(perMonth(31)), []);
  assert.deepEqual(validateSchedule(onDay(31)), []);
});

test('validateSchedule: ongeldige schema\'s', () => {
  assert.notDeepEqual(validateSchedule(null), []);
  assert.notDeepEqual(validateSchedule({ type: 'nope' }), []);
  assert.notDeepEqual(validateSchedule(weekdaysSchedule([])), []);
  assert.notDeepEqual(validateSchedule(weekdaysSchedule([7])), []);
  assert.notDeepEqual(validateSchedule(weekdaysSchedule([1, 1])), []);
  assert.notDeepEqual(validateSchedule(perWeek(0)), []);
  assert.notDeepEqual(validateSchedule(perWeek(8)), []);
  assert.notDeepEqual(validateSchedule(perMonth(32)), []);
  assert.notDeepEqual(validateSchedule(perWeek(1.5)), []);
  assert.notDeepEqual(validateSchedule({ type: 'times_per_period', period: 'year', count: 1 }), []);
  assert.notDeepEqual(validateSchedule(onDay(0)), []);
  assert.notDeepEqual(validateSchedule(onDay(32)), []);
});

test('validateSchedules: lijst en datums', () => {
  assert.notDeepEqual(validateSchedules([]), []);
  assert.notDeepEqual(validateSchedules([{ effectiveFrom: '2026-02-30', schedule: perWeek(1) }]), []);
  assert.deepEqual(validateSchedules([{ effectiveFrom: '2026-10-01', schedule: perWeek(1) }]), []);
});

test('scheduleAt: kiest de laatste versie die al geldt, ongeacht volgorde', () => {
  const v1 = { effectiveFrom: '2026-09-01', schedule: perWeek(3) };
  const v2 = { effectiveFrom: '2026-10-05', schedule: perWeek(2) };
  assert.equal(scheduleAt([v2, v1], '2026-08-31'), null);
  assert.equal(scheduleAt([v2, v1], '2026-09-01'), v1.schedule);
  assert.equal(scheduleAt([v2, v1], '2026-10-04'), v1.schedule);
  assert.equal(scheduleAt([v1, v2], '2026-10-05'), v2.schedule);
  assert.equal(scheduleAt([v1, v2], '2027-01-01'), v2.schedule);
});

test('periodBounds en dueDateInMonth', () => {
  assert.deepEqual(periodBounds('2026-10-15', 'week'), { start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(periodBounds('2026-10-15', 'month'), { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(dueDateInMonth(31, '2026-02-10'), '2026-02-28');
  assert.equal(dueDateInMonth(31, '2028-02-10'), '2028-02-29');
  assert.equal(dueDateInMonth(31, '2026-04-01'), '2026-04-30');
  assert.equal(dueDateInMonth(15, '2026-04-20'), '2026-04-15');
});
