// De weekscore voor de ranglijst (docs/SOCIAAL.md §4): punten per dag, vandaag telt alleen wat je deed, te weinig = geen score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoreSummary, computeWindowPoints, scoreWindow } from '../../src/app/score.js';
import { prepareSnapshot } from '../../src/app/day-view.js';
import { addDays } from '../../src/domain/dates.js';

const TODAY = '2026-10-15'; // donderdag
const ALL_DAYS = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };

const habit = (id, schedule = ALL_DAYS, extra = {}) => ({
  id, name: id, icon: 'x', color: 'c1', daypart: 'anytime', status: 'active', startDate: '2026-09-01', endDate: null,
  sortOrder: 0, maintenance: false, schedules: [{ effectiveFrom: '2026-09-01', schedule }], ...extra,
});
const done = (habitId, date, status = 'done') => ({ habitId, date, status });
const snap = ({ habits = [], checkIns = [], pauses = [], dayPlans = [] } = {}) => ({ habits, checkIns, pauses, dayPlans, ratings: [] });
const days = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

test('het venster is de laatste 7 dagen, vandaag meegerekend', () => {
  assert.deepEqual(scoreWindow(TODAY), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
});

test('een dagelijkse habit: gedaan ÷ gepland over de dagen, met vandaag als alleen-maar-bonus', () => {
  // 9 t/m 14 elke dag, behalve 12; vandaag gedaan → gepland 6 + 1, gedaan 5 + 1
  const checkIns = days('2026-10-09', '2026-10-15').filter((d) => d !== '2026-10-12').map((d) => done('a', d));
  const s = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns }), today: TODAY });
  assert.equal(s.planned, 7);
  assert.equal(s.done, 6);
  assert.equal(s.score, 86);
});

test('vandaag nog niets gedaan: de score daalt niet, vandaag telt gewoon nog niet mee', () => {
  const checkIns = days('2026-10-09', '2026-10-14').map((d) => done('a', d));
  const s = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns }), today: TODAY });
  assert.deepEqual([s.done, s.planned, s.score], [6, 6, 100]);
});

test('afvinken vandaag geeft meteen punten, ook als het een slechte week was', () => {
  const before = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns: [done('a', '2026-10-13')] }), today: TODAY });
  const after = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns: [done('a', '2026-10-13'), done('a', TODAY)] }), today: TODAY });
  assert.equal(before.score, 17); // 1 van 6 gesloten dagen (vandaag telt nog niet)
  assert.equal(after.score, 29); // 2 van 7
  assert.ok(after.score > before.score);
});

test('minimale versie telt als gedaan, overslaan telt nergens', () => {
  const checkIns = [
    done('a', '2026-10-14', 'minimal'),
    done('a', '2026-10-13', 'skipped'),
    done('a', '2026-10-12'),
  ];
  const s = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns }), today: TODAY });
  // dagen 9, 10, 11 gemist; 12 en 14 gedaan; 13 overgeslagen; vandaag niets gedaan
  assert.deepEqual([s.done, s.planned], [2, 5]);
  assert.equal(s.score, 40);
});

test('een gepauzeerde habit staat niet op de lijst: pauze kost geen punten', () => {
  const pauses = [{ id: 'p', habitId: 'a', from: '2026-10-09', to: '2026-10-13' }];
  const checkIns = [done('a', '2026-10-14')];
  const s = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns, pauses }), today: TODAY });
  assert.deepEqual([s.done, s.planned], [1, 1]);
});

test('een flexibele habit (2× per week) levert punten op de dag dat je hem afvinkt, niet pas aan het eind van de week', () => {
  const h = habit('f', { type: 'times_per_period', period: 'week', count: 2 });
  // meegenomen en gedaan op woensdag 14; meegenomen maar niet gedaan op dinsdag 13
  const dayPlans = [{ habitId: 'f', date: '2026-10-14' }, { habitId: 'f', date: '2026-10-13' }];
  const s = buildScoreSummary({ snapshot: snap({ habits: [h], checkIns: [done('f', '2026-10-14')], dayPlans }), today: TODAY });
  assert.deepEqual([s.done, s.planned], [1, 2]);
});

test('een flexibele habit die niet is meegenomen en niet is gedaan, kost niets', () => {
  const h = habit('f', { type: 'times_per_period', period: 'week', count: 2 });
  const s = buildScoreSummary({ snapshot: snap({ habits: [h] }), today: TODAY });
  assert.deepEqual([s.done, s.planned, s.score], [0, 0, null]);
});

test('een habit die midden in het venster start, telt pas vanaf zijn startdatum', () => {
  const h = habit('n', ALL_DAYS, { startDate: '2026-10-13', schedules: [{ effectiveFrom: '2026-10-13', schedule: ALL_DAYS }] });
  const s = buildScoreSummary({ snapshot: snap({ habits: [h], checkIns: [done('n', '2026-10-13'), done('n', '2026-10-14')] }), today: TODAY });
  assert.deepEqual([s.done, s.planned], [2, 2]);
});

test('vaste weekdagen: alleen de geplande dagen tellen', () => {
  const h = habit('w', { type: 'weekdays', weekdays: [0, 2, 4] }); // ma, wo, vr
  // in het venster: vr 9, ma 12, wo 14 (vandaag, do 15, staat niet gepland)
  const s = buildScoreSummary({ snapshot: snap({ habits: [h], checkIns: [done('w', '2026-10-09'), done('w', '2026-10-14')] }), today: TODAY });
  assert.deepEqual([s.done, s.planned], [2, 3]);
  assert.equal(s.score, 67);
});

test('met minder dan 3 geplande items is er geen score ("nog te weinig")', () => {
  const h = habit('w', { type: 'weekdays', weekdays: [2] });
  const s = buildScoreSummary({ snapshot: snap({ habits: [h], checkIns: [done('w', '2026-10-14')] }), today: TODAY });
  assert.deepEqual([s.done, s.planned, s.score], [1, 1, null]);
});

test('zonder habits: nul en geen score, en alles klopt', () => {
  const s = buildScoreSummary({ snapshot: snap(), today: TODAY });
  assert.deepEqual(s, { asOf: TODAY, score: null, planned: 0, done: 0, streak: 0, activeHabits: 0, lastActive: null });
});

test('het aantal actieve habits telt wie vandaag meetelt (geen gearchiveerde, geen toekomstige)', () => {
  const habits = [habit('a'), habit('b', ALL_DAYS, { status: 'archived' }), habit('c', ALL_DAYS, { startDate: '2026-10-20' })];
  assert.equal(buildScoreSummary({ snapshot: snap({ habits }), today: TODAY }).activeHabits, 1);
});

test('laatst actief: de laatste afgevinkte dag; overslaan en de toekomst tellen niet', () => {
  const checkIns = [done('a', '2026-10-11'), done('a', '2026-10-13', 'skipped'), done('a', '2026-10-20')];
  assert.equal(buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns }), today: TODAY }).lastActive, '2026-10-11');
  assert.equal(buildScoreSummary({ snapshot: snap({ habits: [habit('a')] }), today: TODAY }).lastActive, null);
});

test('reeks: opeenvolgende gedane dagen; vandaag nog open breekt hem niet, een gemiste dag wel', () => {
  const run = (dates) => buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns: dates.map((d) => done('a', d)) }), today: TODAY }).streak;
  assert.equal(run(['2026-10-12', '2026-10-13', '2026-10-14']), 3);
  assert.equal(run(['2026-10-12', '2026-10-13', '2026-10-14', TODAY]), 4);
  assert.equal(run(['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14']), 3); // 11 gemist
  assert.equal(run([]), 0);
});

test('reeks: een flexibele habit geeft geen reeks in dagen', () => {
  const h = habit('f', { type: 'times_per_period', period: 'week', count: 2 });
  assert.equal(buildScoreSummary({ snapshot: snap({ habits: [h], checkIns: [done('f', '2026-10-13'), done('f', '2026-10-14')] }), today: TODAY }).streak, 0);
});

test('de samenvatting bevat alleen getallen en datums: geen namen, notities of ids', () => {
  const s = buildScoreSummary({ snapshot: snap({ habits: [habit('a')], checkIns: [{ ...done('a', '2026-10-14'), note: 'geheim' }] }), today: TODAY });
  assert.deepEqual(Object.keys(s).sort(), ['activeHabits', 'asOf', 'done', 'lastActive', 'planned', 'score', 'streak']);
  assert.ok(!JSON.stringify(s).includes('geheim'));
});

test('de dagwissel van de gebruiker volgt uit "vandaag": dezelfde gegevens op een andere dag geven een ander venster', () => {
  const checkIns = days('2026-10-09', '2026-10-16').map((d) => done('a', d));
  const snapshot = snap({ habits: [habit('a')], checkIns });
  assert.equal(buildScoreSummary({ snapshot, today: '2026-10-15' }).planned, 7);
  assert.equal(buildScoreSummary({ snapshot, today: '2026-10-16' }).lastActive, '2026-10-16');
});

// ---- gekorte geschiedenis = volledige berekening ------------------------------------------------------------------------

function prng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function longHistory() {
  const rnd = prng(7);
  const start = addDays(TODAY, -300);
  const kinds = [
    ALL_DAYS,
    { type: 'weekdays', weekdays: [0, 2, 4] },
    { type: 'times_per_period', period: 'week', count: 3 },
    { type: 'times_per_period', period: 'month', count: 4 },
    { type: 'day_of_month', day: 31 },
  ];
  const habits = kinds.map((schedule, i) => habit(`h${i}`, schedule, { startDate: start, schedules: [{ effectiveFrom: start, schedule }] }));
  const checkIns = [];
  for (const h of habits) {
    for (let d = 300; d >= 0; d--) {
      const r = rnd();
      if (r < 0.55) checkIns.push(done(h.id, addDays(TODAY, -d)));
      else if (r < 0.62) checkIns.push(done(h.id, addDays(TODAY, -d), 'skipped'));
    }
  }
  const dayPlans = [];
  for (let d = 0; d < 120; d += 3) dayPlans.push({ habitId: 'h2', date: addDays(TODAY, -d) }, { habitId: 'h3', date: addDays(TODAY, -d - 1) });
  return snap({ habits, checkIns, pauses: [{ id: 'p', habitId: 'h1', from: addDays(TODAY, -4), to: addDays(TODAY, -2) }], dayPlans });
}

test('de gekorte berekening geeft voor elke dag van de laatste weken dezelfde punten als de volledige', () => {
  const snapshot = longHistory();
  const full = prepareSnapshot(snapshot);
  for (let back = 0; back <= 60; back++) {
    const today = addDays(TODAY, -back);
    assert.deepEqual(computeWindowPoints({ snapshot, today }), computeWindowPoints({ snapshot, today, prepared: full }), `verschil op ${today}`);
  }
});

test('een jaar aan gegevens: de score is snel genoeg om op de achtergrond mee te lopen', () => {
  const snapshot = longHistory();
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) buildScoreSummary({ snapshot, today: TODAY });
  const each = (performance.now() - t0) / 5;
  assert.ok(each < 150, `te traag: ${each.toFixed(0)} ms per berekening`);
});
