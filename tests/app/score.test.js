// De weekpunten voor de ranglijst (docs/SOCIAAL.md §4): een vast aantal punten per afgeronde taak over de laatste 7 dagen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoreSummary, scoreWindow } from '../../src/app/score.js';
import { addDays } from '../../src/domain/dates.js';
import { TASK_POINTS } from '../../src/domain/constants.js';

const TODAY = '2026-10-15'; // donderdag
const ALL_DAYS = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const FLEX = { type: 'times_per_period', period: 'week', count: 2 };

const habit = (id, schedule = ALL_DAYS, extra = {}) => ({
  id, name: id, icon: 'x', color: 'c1', daypart: 'anytime', status: 'active', startDate: '2026-09-01', endDate: null,
  sortOrder: 0, maintenance: false, schedules: [{ effectiveFrom: '2026-09-01', schedule }], ...extra,
});
const done = (habitId, date, status = 'done') => ({ habitId, date, status });
const snap = ({ habits = [], checkIns = [], pauses = [], dayPlans = [] } = {}) => ({ habits, checkIns, pauses, dayPlans, ratings: [] });
const days = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const summary = (state, today = TODAY) => buildScoreSummary({ snapshot: snap(state), today });

test('het venster is de laatste 7 dagen, vandaag meegerekend', () => {
  assert.deepEqual(scoreWindow(TODAY), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
});

test('elke afgeronde taak levert een vast aantal punten op', () => {
  const checkIns = [done('a', '2026-10-13'), done('a', '2026-10-14'), done('a', TODAY)];
  const s = summary({ habits: [habit('a')], checkIns });
  assert.equal(s.done, 3);
  assert.equal(s.points, 3 * TASK_POINTS);
});

test('afvinken vandaag geeft meteen punten', () => {
  const before = summary({ habits: [habit('a'), habit('b')], checkIns: [done('a', '2026-10-14')] });
  const after = summary({ habits: [habit('a'), habit('b')], checkIns: [done('a', '2026-10-14'), done('b', TODAY)] });
  assert.equal(after.points - before.points, TASK_POINTS);
});

test('je punten dalen niet doordat het een nieuwe dag is: alleen een dag die uit het venster schuift telt niet meer mee', () => {
  const checkIns = [done('a', '2026-10-10'), done('a', '2026-10-12'), done('a', '2026-10-14')];
  const state = { habits: [habit('a')], checkIns };
  assert.equal(summary(state, '2026-10-15').points, 3 * TASK_POINTS); // 9 t/m 15
  assert.equal(summary(state, '2026-10-16').points, 3 * TASK_POINTS); // 10 t/m 16: niets verloren, vandaag nog niets
  assert.equal(summary(state, '2026-10-17').points, 2 * TASK_POINTS); // 11 t/m 17: de 10e schuift eruit
});

test('minimale versie telt als afgerond, overslaan en een gedeeltelijke teller niet', () => {
  const checkIns = [done('a', '2026-10-14', 'minimal'), done('a', '2026-10-13', 'skipped'), done('a', '2026-10-12', 'partial'), done('a', '2026-10-11')];
  assert.equal(summary({ habits: [habit('a')], checkIns }).done, 2);
});

test('alles op één dag doen levert evenveel punten op als het over de week verspreiden: het gaat om het aantal taken', () => {
  const habits = [habit('a', FLEX), habit('b', FLEX), habit('c', FLEX)];
  const sameDay = summary({ habits, checkIns: habits.map((h) => done(h.id, '2026-10-14')) });
  const spread = summary({ habits, checkIns: [done('a', '2026-10-11'), done('b', '2026-10-13'), done('c', '2026-10-15')] });
  assert.equal(sameDay.points, 3 * TASK_POINTS);
  assert.equal(spread.points, sameDay.points);
});

test('een flexibele habit doet precies hetzelfde mee als een vaste, ook zonder dat hij is meegenomen', () => {
  const s = summary({ habits: [habit('f', FLEX), habit('v')], checkIns: [done('f', '2026-10-13'), done('v', '2026-10-13')] });
  assert.equal(s.done, 2);
});

test('taken buiten het venster en in de toekomst tellen niet mee', () => {
  const s = summary({ habits: [habit('a')], checkIns: [done('a', '2026-10-08'), done('a', '2026-10-09'), done('a', '2026-10-16')] });
  assert.equal(s.done, 1);
});

test('een afgevinkte taak van een habit die niet meer bestaat telt niet mee', () => {
  assert.equal(summary({ habits: [habit('a')], checkIns: [done('weg', '2026-10-14'), done('a', '2026-10-14')] }).done, 1);
});

test('meer habits geeft meer punten als je ze doet; eenzelfde habit telt maar één keer per dag', () => {
  const week = days('2026-10-09', TODAY);
  const three = summary({ habits: ['a', 'b', 'c'].map((id) => habit(id)), checkIns: ['a', 'b', 'c'].flatMap((id) => week.map((d) => done(id, d))) });
  const one = summary({ habits: [habit('a')], checkIns: week.map((d) => done('a', d)) });
  assert.equal(three.points, 21 * TASK_POINTS);
  assert.equal(one.points, 7 * TASK_POINTS);
});

test('zonder habits of zonder taken: nul punten, en alles klopt', () => {
  assert.deepEqual(summary(), { asOf: TODAY, points: 0, done: 0, streak: 0, activeHabits: 0, lastActive: null });
  assert.equal(summary({ habits: [habit('a')] }).points, 0);
});

test('het aantal actieve habits telt wie vandaag meetelt (geen gearchiveerde, geen toekomstige)', () => {
  const habits = [habit('a'), habit('b', ALL_DAYS, { status: 'archived' }), habit('c', ALL_DAYS, { startDate: '2026-10-20' })];
  assert.equal(summary({ habits }).activeHabits, 1);
});

test('laatst actief: de laatste afgevinkte dag; overslaan en de toekomst tellen niet', () => {
  const checkIns = [done('a', '2026-10-11'), done('a', '2026-10-13', 'skipped'), done('a', '2026-10-20')];
  assert.equal(summary({ habits: [habit('a')], checkIns }).lastActive, '2026-10-11');
  assert.equal(summary({ habits: [habit('a')] }).lastActive, null);
});

test('reeks: opeenvolgende gedane dagen; vandaag nog open breekt hem niet, een gemiste dag wel', () => {
  const run = (dates) => summary({ habits: [habit('a')], checkIns: dates.map((d) => done('a', d)) }).streak;
  assert.equal(run(['2026-10-12', '2026-10-13', '2026-10-14']), 3);
  assert.equal(run(['2026-10-12', '2026-10-13', '2026-10-14', TODAY]), 4);
  assert.equal(run(['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14']), 3); // 11 gemist
  assert.equal(run([]), 0);
});

test('reeks: een flexibele habit geeft geen reeks in dagen', () => {
  assert.equal(summary({ habits: [habit('f', FLEX)], checkIns: [done('f', '2026-10-13'), done('f', '2026-10-14')] }).streak, 0);
});

test('de samenvatting bevat alleen getallen en datums: geen namen, notities of ids', () => {
  const s = summary({ habits: [habit('a')], checkIns: [{ ...done('a', '2026-10-14'), note: 'geheim' }] });
  assert.deepEqual(Object.keys(s).sort(), ['activeHabits', 'asOf', 'done', 'lastActive', 'points', 'streak']);
  assert.ok(!JSON.stringify(s).includes('geheim'));
});

// ---- snelheid ------------------------------------------------------------------------------------------------------------

test('een jaar aan gegevens: de berekening is snel genoeg om op de achtergrond mee te lopen', () => {
  const start = addDays(TODAY, -300);
  const habits = Array.from({ length: 15 }, (_, i) => habit(`h${i}`, i % 3 === 0 ? FLEX : ALL_DAYS, { startDate: start, schedules: [{ effectiveFrom: start, schedule: i % 3 === 0 ? FLEX : ALL_DAYS }] }));
  const checkIns = habits.flatMap((h) => days(start, TODAY).filter((_, i) => i % 2 === 0).map((d) => done(h.id, d)));
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) buildScoreSummary({ snapshot: snap({ habits, checkIns }), today: TODAY });
  const each = (performance.now() - t0) / 5;
  assert.ok(each < 150, `te traag: ${each.toFixed(0)} ms per berekening`);
});
