// De statusregel per habit op het Habits-scherm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habitRowInfo, isFlexible } from '../../src/app/habits-overview.js';
import { validHabit, TODAY } from './helpers.js';

const snap = (over = {}) => ({ checkIns: [], pauses: [], ratings: [], ...over });
const weekly = (count) => ({ id: 'f', startDate: '2026-09-01', schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'times_per_period', period: 'week', count } }] });

test('isFlexible: alleen N× per week of maand', () => {
  assert.equal(isFlexible(validHabit(), TODAY), false);
  assert.equal(isFlexible(validHabit(weekly(2)), TODAY), true);
  assert.equal(isFlexible(validHabit({ schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'day_of_month', day: 3 } }], startDate: '2026-09-01' }), TODAY), false);
});

test('een gewone habit heeft een fase en geen periode', () => {
  const info = habitRowInfo({ habit: validHabit({ id: 'g', startDate: '2026-10-05' }), snapshot: snap(), today: TODAY });
  assert.equal(info.period, null);
  assert.deepEqual([info.phase.key, info.phase.unit], ['starting', 'days']);
  assert.equal(info.phase.day, 11);
});

test('een habit die nog niet gestart is heeft geen fase', () => {
  const info = habitRowInfo({ habit: validHabit({ id: 'g', startDate: '2026-11-01', status: 'planned' }), snapshot: snap(), today: TODAY });
  assert.equal(info.phase, null);
});

test('een flexibele taak toont de voortgang van de week, en dreigt te falen als het krap wordt (donderdag 0 van 2)', () => {
  const habit = validHabit(weekly(2));
  const none = habitRowInfo({ habit, snapshot: snap(), today: TODAY });
  assert.deepEqual([none.period.span, none.period.count, none.period.target, none.period.urgent], ['week', 0, 2, true]);
  const one = habitRowInfo({ habit, snapshot: snap({ checkIns: [{ habitId: 'f', date: '2026-10-13', status: 'done' }] }), today: TODAY });
  assert.deepEqual([one.period.count, one.period.urgent], [1, false]);
  const wednesday = habitRowInfo({ habit, snapshot: snap(), today: '2026-10-14' });
  assert.equal(wednesday.period.urgent, false);
});

test('een afgeronde, gepauzeerde of gearchiveerde flexibele taak toont geen periode met waarschuwing', () => {
  const habit = validHabit({ ...weekly(2), status: 'archived', endDate: '2026-10-01' });
  assert.equal(habitRowInfo({ habit, snapshot: snap(), today: TODAY }).period, null);
});
