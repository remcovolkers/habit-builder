import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayView } from '../../src/app/day-view.js';
import { formatDateLong, formatDateShort, formatSchedule, relativeDayLabel, datesBetween } from '../../src/app/format.js';
import { validHabit, TODAY } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const weekly = (count) => ({ type: 'times_per_period', period: 'week', count });
const habit = (id, over = {}) => validHabit({
  id, name: id, startDate: '2026-10-01',
  schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }], ...over,
});
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ...over });
const names = (list) => list.map((e) => e.habit.name);

test('groepeert per dagdeel in vaste volgorde en laat lege groepen weg', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [
        habit('Avondwandeling', { daypart: 'evening' }),
        habit('Water', { daypart: 'morning', sortOrder: 1 }),
        habit('Lezen', { daypart: 'morning', sortOrder: 0 }),
      ],
    }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(view.groups.map((g) => g.daypart), ['morning', 'evening']);
  assert.deepEqual(names(view.groups[0].entries), ['Lezen', 'Water']);
});

test('voortgang telt gedaan en minimaal, en laat overgeslagen buiten het totaal', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [habit('A'), habit('B'), habit('C'), habit('D')],
      checkIns: [
        { habitId: 'A', date: TODAY, status: 'done' },
        { habitId: 'B', date: TODAY, status: 'minimal' },
        { habitId: 'C', date: TODAY, status: 'skipped' },
      ],
    }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(view.progress, { done: 2, total: 3 });
});

test('de stapel: sorteert open/risico eerst en klaar onderaan; ingepland verhuist naar de dag', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [
        habit('Klaar', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(1) }] }),
        habit('Rustig', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(1) }] }),
        habit('Meegenomen', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(1) }] }),
      ],
      checkIns: [{ habitId: 'Klaar', date: '2026-10-13', status: 'done' }],
      dayPlans: [{ habitId: 'Meegenomen', date: TODAY }],
    }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(names(view.pool), ['Rustig', 'Klaar']);
  assert.equal(view.pool[1].satisfied, true);
  assert.deepEqual(names(view.groups.flatMap((g) => g.entries)), ['Meegenomen']);
});

test('modus en rechten: verleden, vandaag, toekomst en te lang geleden', () => {
  const base = { snapshot: snapshot({ habits: [habit('A')] }), today: TODAY };
  const today = buildDayView({ ...base, date: TODAY });
  assert.deepEqual([today.mode, today.canLog, today.canPlan], ['today', true, true]);
  const past = buildDayView({ ...base, date: '2026-10-12' });
  assert.deepEqual([past.mode, past.canLog, past.canPlan], ['past', true, false]);
  const edge = buildDayView({ ...base, date: '2026-10-01' });
  assert.equal(edge.canLog, true);
  const old = buildDayView({ ...base, date: '2026-09-30' });
  assert.deepEqual([old.mode, old.canLog], ['past', false]);
  const future = buildDayView({ ...base, date: '2026-10-17' });
  assert.deepEqual([future.mode, future.canLog, future.canPlan], ['future', false, true]);
});

test('een eerdere dag toont wat toen gepland stond, inclusief eerdere check-ins', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [habit('A')],
      checkIns: [{ habitId: 'A', date: '2026-10-12', status: 'done' }],
    }),
    date: '2026-10-12', today: TODAY,
  });
  assert.equal(view.groups[0].entries[0].doneToday, true);
  assert.deepEqual(view.progress, { done: 1, total: 1 });
});

test('hasHabits en een lege dag', () => {
  assert.equal(buildDayView({ snapshot: snapshot(), date: TODAY, today: TODAY }).hasHabits, false);
  const empty = buildDayView({ snapshot: snapshot({ habits: [habit('A', { status: 'archived' })] }), date: TODAY, today: TODAY });
  assert.deepEqual([empty.hasHabits, empty.groups, empty.pool], [true, [], []]);
});

// --- opmaak -----------------------------------------------------------------------------------

test('datums in het Nederlands', () => {
  assert.equal(formatDateLong('2026-10-15'), 'donderdag 15 oktober');
  assert.equal(formatDateShort('2026-10-15'), 'do 15 okt');
  assert.equal(formatDateShort('2026-12-01'), 'di 1 dec');
});

test('relatieve dagen', () => {
  assert.equal(relativeDayLabel('2026-10-15', TODAY), 'Vandaag');
  assert.equal(relativeDayLabel('2026-10-14', TODAY), 'Gisteren');
  assert.equal(relativeDayLabel('2026-10-16', TODAY), 'Morgen');
  assert.equal(relativeDayLabel('2026-10-20', TODAY), 'di 20 okt');
});

test('schema-omschrijvingen', () => {
  assert.equal(formatSchedule({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }), 'Elke dag');
  assert.equal(formatSchedule({ type: 'weekdays', weekdays: [4, 3, 2, 1, 0] }), 'Werkdagen');
  assert.equal(formatSchedule({ type: 'weekdays', weekdays: [4, 0, 2] }), 'Ma, wo, vr');
  assert.equal(formatSchedule(weekly(2)), '2× per week');
  assert.equal(formatSchedule({ type: 'times_per_period', period: 'month', count: 3 }), '3× per maand');
  assert.equal(formatSchedule({ type: 'day_of_month', day: 15 }), 'Dag 15 van de maand');
});

test('datesBetween is inclusief', () => {
  assert.deepEqual(datesBetween('2026-10-30', '2026-11-01'), ['2026-10-30', '2026-10-31', '2026-11-01']);
});
