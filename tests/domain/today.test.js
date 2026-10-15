import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToday } from '../../src/domain/today.js';
import { buildHabitStats } from '../../src/domain/stats.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { addDays, eachDay } from '../../src/domain/dates.js';
import { checks, habit, onDay, perWeek, weekdaysSchedule } from './helpers.js';

const TODAY = '2026-10-15'; // donderdag, week van 12 okt
const daily = weekdaysSchedule(ALL_WEEKDAYS);

const A = { habit: habit(daily, '2026-10-12', { id: 'A' }) };
const B = { habit: habit(perWeek(2), '2026-10-12', { id: 'B' }) };
const C = { habit: habit(onDay(15), '2026-10-01', { id: 'C' }) };

const ids = (list) => list.map((e) => e.habitId);

test('Vandaag: vaste dagen, dag-van-de-maand en de stapel staan op de juiste plek', () => {
  const day = buildToday({ bundles: [A, B, C], today: TODAY });
  assert.deepEqual(ids(day.scheduled), ['A', 'C']);
  assert.deepEqual(ids(day.planned), []);
  assert.deepEqual(ids(day.pool), ['B']);
  const entry = day.pool[0];
  assert.deepEqual([entry.count, entry.target, entry.remainingDays, entry.span], [0, 2, 4, 'week']);
  assert.equal(day.scheduled[1].overdue, false); // C vervalt precies vandaag
});

test('meenemen in vandaag: de habit verhuist van de stapel naar planned', () => {
  const day = buildToday({ bundles: [A, B], dayPlans: [{ habitId: 'B', date: TODAY }], today: TODAY });
  assert.deepEqual(ids(day.planned), ['B']);
  assert.deepEqual(ids(day.pool), []);
  assert.equal(day.planned[0].plannedToday, true);
});

test('een plan van gisteren zonder check-in valt terug in de stapel', () => {
  const day = buildToday({ bundles: [B], dayPlans: [{ habitId: 'B', date: '2026-10-14' }], today: TODAY });
  assert.deepEqual(ids(day.pool), ['B']);
  assert.deepEqual(ids(day.planned), []);
});

test('vandaag gelogd zonder plan telt als planned (met voortgang)', () => {
  const bundle = { ...B, checkIns: checks([TODAY]) };
  const day = buildToday({ bundles: [bundle], today: TODAY });
  assert.deepEqual(ids(day.planned), ['B']);
  assert.equal(day.planned[0].doneToday, true);
  assert.equal(day.planned[0].count, 1);
  assert.deepEqual(day.pool, []);
});

test('stapel: gehaalde quota blijft zichtbaar als satisfied; open week toont atRisk', () => {
  const satisfied = { ...B, checkIns: checks(['2026-10-12'], ['2026-10-13']) };
  const day = buildToday({ bundles: [satisfied], today: TODAY });
  assert.equal(day.pool[0].satisfied, true);

  const risky = buildToday({ bundles: [B], today: '2026-10-18' });
  assert.equal(risky.pool[0].atRisk, true);
});

test('stapel: verse week begint weer vol (check-ins van vorige week tellen niet)', () => {
  const lastWeek = { habit: habit(perWeek(2), '2026-10-05', { id: 'B' }), checkIns: checks(['2026-10-06'], ['2026-10-07']) };
  const day = buildToday({ bundles: [lastWeek], today: '2026-10-12' });
  assert.deepEqual([day.pool[0].count, day.pool[0].target], [0, 2]);
});

test('dag van de maand: te laat staat in scheduled met overdue; reeds gedaan niet meer', () => {
  const lateHabit = (extra) => ({ habit: habit(onDay(10), '2026-10-01', { id: 'C' }), ...extra });
  const overdue = buildToday({ bundles: [lateHabit()], today: TODAY });
  assert.deepEqual(ids(overdue.scheduled), ['C']);
  assert.equal(overdue.scheduled[0].overdue, true);

  const done = buildToday({ bundles: [lateHabit({ checkIns: checks(['2026-10-12']) })], today: TODAY });
  assert.deepEqual(done.scheduled, []);

  const doneToday = buildToday({ bundles: [lateHabit({ checkIns: checks([TODAY]) })], today: TODAY });
  assert.equal(doneToday.scheduled[0].doneToday, true);

  const notDue = buildToday({ bundles: [{ habit: habit(onDay(20), '2026-10-01', { id: 'C' }) }], today: TODAY });
  assert.deepEqual(notDue.scheduled, []);
});

test('gepauzeerd vandaag: de habit verdwijnt uit alle lijsten, tenzij vandaag toch gelogd', () => {
  const pauses = [{ from: '2026-10-14', to: null }];
  const paused = buildToday({ bundles: [{ ...A, pauses }, { ...B, pauses }], today: TODAY });
  assert.deepEqual([paused.scheduled, paused.planned, paused.pool], [[], [], []]);

  const logged = buildToday({ bundles: [{ ...A, pauses, checkIns: checks([TODAY]) }], today: TODAY });
  assert.deepEqual(ids(logged.scheduled), ['A']);
});

test('niet-gevolgde habits komen niet voor: gearchiveerd, toekomstig, ingeburgerd zonder onderhoud', () => {
  const archived = { habit: habit(daily, '2026-10-01', { id: 'X', status: 'archived' }) };
  const future = { habit: habit(daily, '2026-10-20', { id: 'Y', status: 'planned' }) };
  const graduated = { habit: habit(daily, '2026-08-01', { id: 'Z', status: 'graduated' }) };
  const maintained = { habit: habit(daily, '2026-08-01', { id: 'M', status: 'graduated', maintenance: true }) };
  const day = buildToday({ bundles: [archived, future, graduated, maintained], today: TODAY });
  assert.deepEqual(ids(day.scheduled), ['M']);
});

test('volledig overgeslagen of gepauzeerde week verschijnt niet in de stapel', () => {
  const pausedWeek = { ...B, pauses: [{ from: '2026-10-12', to: '2026-10-18' }] };
  assert.deepEqual(buildToday({ bundles: [pausedWeek], today: TODAY }).pool, []);
});

// --- stats ----------------------------------------------------------------------------------

function dailyStats(start, today, misses = [], extra = {}) {
  const days = eachDay(start, addDays(today, -1)).filter((d) => !misses.includes(d));
  return buildHabitStats({
    habit: habit(daily, start, { id: 'D', ...extra }),
    checkIns: days.map((date) => ({ date, status: 'done' })),
    today,
  });
}

test('buildHabitStats: een goed lopende habit na 76 dagen is klaar om ingeburgerd te worden', () => {
  const s = dailyStats('2026-08-01', TODAY, ['2026-09-10', '2026-10-01']);
  assert.equal(s.activeDays, 76);
  assert.equal(s.phase.phase, 'building');
  assert.equal(s.graduation.eligible, true);
  assert.ok(s.strength > 0.9);
  assert.equal(s.streaks.current, 13); // 2 t/m 14 okt (1 okt gemist), vandaag is nog open
  assert.equal(s.totalDone, 73); // 1 aug t/m 14 okt = 75 dagen, min 2 gemist
  assert.equal(s.lastDoneDate, '2026-10-14');
});

test('buildHabitStats: bevestigde habit is established', () => {
  const s = dailyStats('2026-08-01', TODAY, [], { status: 'graduated', graduatedAt: '2026-10-10' });
  assert.equal(s.phase.phase, 'established');
  assert.equal(s.graduated, true);
});

test('buildHabitStats: nieuwe habit heeft nog geen consistentie en is niet ingeburgerd', () => {
  const s = buildHabitStats({ habit: habit(daily, TODAY, { id: 'N' }), today: TODAY });
  assert.equal(s.consistency.rate, null);
  assert.equal(s.graduation.eligible, false);
  assert.equal(s.totalDone, 0);
  assert.equal(s.lastDoneDate, null);
  assert.equal(s.phase.phase, 'starting');
});
