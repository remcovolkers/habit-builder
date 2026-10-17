// "Plan je week": de rijen per flexibele taak en het voorstel dat de ontbrekende keren verdeelt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekPlan, suggestPlan } from '../../src/app/week-plan.js';
import { validHabit } from './helpers.js';

const THURSDAY = '2026-10-15';
const flexible = (id, count = 2, period = 'week', over = {}) => validHabit({
  id, name: `Taak ${id}`, startDate: '2026-09-01', schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'times_per_period', period, count } }], ...over,
});
const snap = ({ habits, checkIns = [], dayPlans = [], pauses = [] }) => ({ habits, checkIns, dayPlans, pauses });
const row = (rows, id) => rows.find((r) => r.habit.id === id);
const states = (r) => r.days.map((d) => `${d.date.slice(8)}:${d.state}`).join(' ');

test('alleen flexibele taken krijgen een rij; vaste dagen en een dag van de maand niet', () => {
  const fixed = validHabit({ id: 'v' });
  const monthDay = validHabit({ id: 'd', schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'day_of_month', day: 25 } }], startDate: '2026-09-01' });
  const rows = buildWeekPlan({ snapshot: snap({ habits: [fixed, monthDay, flexible('a')] }), today: THURSDAY });
  assert.deepEqual(rows.map((r) => r.habit.id), ['a']);
});

test('een rij toont de zeven dagen vanaf vandaag en wat er al gedaan of gepland is', () => {
  const rows = buildWeekPlan({
    snapshot: snap({
      habits: [flexible('a')],
      checkIns: [{ habitId: 'a', date: THURSDAY, status: 'done' }],
      dayPlans: [{ habitId: 'a', date: '2026-10-17' }],
    }),
    today: THURSDAY,
  });
  const a = row(rows, 'a');
  assert.equal(a.days.length, 8, 'vandaag en zeven dagen vooruit (PLAN_AHEAD_DAYS)');
  assert.equal(states(a).startsWith('15:done 16:free 17:planned 18:free'), true, states(a));
  assert.deepEqual(a.days.map((d) => d.inUnit), [true, true, true, true, false, false, false, false], 'tot en met zondag hoort bij deze week');
  assert.deepEqual([a.unit.count, a.unit.target, a.planned, a.missing], [1, 2, 1, 0], 'één gedaan en één gepland: de afspraak is dekkend');
});

test('wat nog ontbreekt, gepauzeerde en overgeslagen dagen en een taak die dreigt te falen', () => {
  const rows = buildWeekPlan({
    snapshot: snap({
      habits: [flexible('a'), flexible('b', 1)],
      checkIns: [{ habitId: 'a', date: '2026-10-16', status: 'skipped' }],
      pauses: [{ habitId: 'b', from: '2026-10-17', to: '2026-10-18' }],
    }),
    today: THURSDAY,
  });
  assert.equal(row(rows, 'a').missing, 2);
  assert.equal(row(rows, 'a').urgent, true, 'donderdag 0 van 2 is krap');
  assert.equal(row(rows, 'a').days[1].state, 'blocked');
  assert.deepEqual(row(rows, 'b').days.slice(2, 4).map((d) => d.state), ['blocked', 'blocked']);
});

test('voorstel: donderdag 0 van 2 geeft donderdag en zondag (zo ver mogelijk uit elkaar), en niets buiten de week', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(rows), [{ habitId: 'a', date: '2026-10-15' }, { habitId: 'a', date: '2026-10-18' }]);
});

test('voorstel: één keer gedaan op maandag en één nodig geeft donderdag (drie dagen later), niet de laatste dag', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')], checkIns: [{ habitId: 'a', date: '2026-10-12', status: 'done' }] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(rows), [{ habitId: 'a', date: '2026-10-15' }]);
});

test('voorstel: twee taken die elk één keer nodig hebben komen niet op dezelfde dag', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a', 1), flexible('b', 1)] }), today: THURSDAY });
  const picks = suggestPlan(rows);
  assert.equal(picks.length, 2);
  assert.notEqual(picks[0].date, picks[1].date);
});

test('voorstel: wat al gepland of gedaan is wordt niet nog eens voorgesteld, en een taak die klaar is krijgt niets', () => {
  const done = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')], checkIns: [{ habitId: 'a', date: '2026-10-12', status: 'done' }, { habitId: 'a', date: '2026-10-13', status: 'done' }] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(done), []);
  const planned = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')], dayPlans: [{ habitId: 'a', date: '2026-10-16' }, { habitId: 'a', date: '2026-10-18' }] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(planned), []);
});

test('voorstel: met minder vrije dagen dan nodig komt er alleen op wat vrij is', () => {
  const rows = buildWeekPlan({
    snapshot: snap({ habits: [flexible('a', 3)], checkIns: [{ habitId: 'a', date: '2026-10-16', status: 'skipped' }, { habitId: 'a', date: '2026-10-17', status: 'skipped' }] }),
    today: THURSDAY,
  });
  const picks = suggestPlan(rows);
  assert.deepEqual(picks.map((p) => p.date).sort(), ['2026-10-15', '2026-10-18']);
});

test('een taak per maand: de dagen van deze week tellen mee voor de maand', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('m', 2, 'month')] }), today: THURSDAY });
  const m = row(rows, 'm');
  assert.equal(m.unit.span, 'month');
  assert.equal(m.days.every((d) => d.inUnit), true);
  assert.equal(m.missing, 2);
  assert.equal(suggestPlan(rows).length, 2);
});

test('een gepauzeerde taak heeft geen rij: niet in het blad, niet meegeteld en niet voorgesteld', () => {
  const habits = [flexible('a'), flexible('p')];
  const rows = buildWeekPlan({ snapshot: snap({ habits, pauses: [{ habitId: 'p', from: '2026-10-14', to: null }] }), today: THURSDAY });
  assert.deepEqual(rows.map((r) => r.habit.id), ['a']);
  assert.deepEqual(suggestPlan(rows).map((p) => p.habitId), ['a', 'a']);
});

test('een pauze die al verlopen is telt niet; een pauze die later in de week begint laat de rij staan met geblokkeerde dagen', () => {
  const habits = [flexible('x'), flexible('y')];
  const rows = buildWeekPlan({
    snapshot: snap({ habits, pauses: [{ habitId: 'x', from: '2026-10-05', to: '2026-10-09' }, { habitId: 'y', from: '2026-10-17', to: null }] }),
    today: THURSDAY,
  });
  assert.deepEqual(rows.map((r) => r.habit.id), ['x', 'y']);
  assert.deepEqual(row(rows, 'y').days.slice(2).map((d) => d.state).every((s) => s === 'blocked'), true);
  assert.equal(row(rows, 'y').free, 2, 'donderdag en vrijdag zijn nog vrij');
  assert.equal(row(rows, 'x').free, 4);
});

test('de teller telt alleen taken die nog dagen nodig hebben en waarvoor nog een vrije dag is', () => {
  const rows = buildWeekPlan({
    snapshot: snap({ habits: [flexible('a'), flexible('b')], checkIns: [{ habitId: 'b', date: '2026-10-16', status: 'skipped' }, { habitId: 'b', date: '2026-10-17', status: 'skipped' }, { habitId: 'b', date: '2026-10-18', status: 'skipped' }, { habitId: 'b', date: THURSDAY, status: 'skipped' }] }),
    today: THURSDAY,
  });
  assert.deepEqual(rows.filter((r) => r.missing > 0 && r.free > 0).map((r) => r.habit.id), ['a'], 'b heeft in deze week geen vrije dag meer');
});
