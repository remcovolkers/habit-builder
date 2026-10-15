// De weekstrook en het overzicht rekenen met alleen de laatste maanden (sneller). Dit bewijst dat dat dezelfde uitkomst geeft
// als de volledige berekening, op een rommelige dataset met alle soorten schema's, pauzes, overslaan en dagplannen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayView, prepareSnapshot } from '../../src/app/day-view.js';
import { buildPeriodOverview, buildWeekStrip } from '../../src/app/overview.js';
import { addDays } from '../../src/domain/dates.js';

const TODAY = '2026-10-15';

/** Deterministisch "toeval", zodat de test elke keer hetzelfde doet. */
function prng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function dataset() {
  const rnd = prng(42);
  const start = addDays(TODAY, -300);
  const kinds = [
    { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] },
    { type: 'weekdays', weekdays: [0, 2, 4] },
    { type: 'weekdays', weekdays: [3] },
    { type: 'times_per_period', period: 'week', count: 3 },
    { type: 'times_per_period', period: 'month', count: 4 },
    { type: 'day_of_month', day: 15 },
    { type: 'day_of_month', day: 31 },
  ];
  const habits = kinds.map((schedule, i) => ({
    id: `h${i}`, name: `H${i}`, icon: 'x', color: 'c1', daypart: ['morning', 'evening', 'anytime'][i % 3], status: 'active',
    startDate: i === 6 ? addDays(TODAY, -90) : start, endDate: null, sortOrder: i, maintenance: false,
    // een cadence-wijziging halverwege bij één habit
    schedules: i === 1
      ? [{ effectiveFrom: start, schedule }, { effectiveFrom: addDays(TODAY, -100), schedule: { type: 'times_per_period', period: 'week', count: 2 } }]
      : [{ effectiveFrom: start, schedule }],
  }));
  const checkIns = [];
  for (const habit of habits) {
    for (let d = 300; d >= 0; d--) {
      const r = rnd();
      if (r < 0.55) checkIns.push({ habitId: habit.id, date: addDays(TODAY, -d), status: 'done' });
      else if (r < 0.6) checkIns.push({ habitId: habit.id, date: addDays(TODAY, -d), status: 'minimal' });
      else if (r < 0.65) checkIns.push({ habitId: habit.id, date: addDays(TODAY, -d), status: 'skipped' });
    }
  }
  const pauses = [
    { id: 'p1', habitId: 'h0', from: addDays(TODAY, -40), to: addDays(TODAY, -33) },
    { id: 'p2', habitId: 'h3', from: addDays(TODAY, -20), to: null },
    { id: 'p3', habitId: 'h5', from: addDays(TODAY, -75), to: addDays(TODAY, -60) },
  ];
  const dayPlans = [{ habitId: 'h3', date: addDays(TODAY, -2) }, { habitId: 'h4', date: addDays(TODAY, 1) }, { habitId: 'h4', date: addDays(TODAY, -30) }];
  return { habits, checkIns, pauses, dayPlans, ratings: [] };
}

const summarize = (view) => ({
  progress: view.progress,
  groups: view.groups.map((g) => [g.daypart, g.entries.map((e) => [e.habitId, e.loggedToday, e.recovery ?? null])]),
  pool: view.pool.map((e) => [e.habitId, e.count, e.target]),
});

test('een gekorte geschiedenis geeft dezelfde dagweergave als de volledige, voor elke dag van de laatste maanden', () => {
  const snapshot = dataset();
  const full = prepareSnapshot(snapshot);
  for (let back = 0; back <= 70; back++) {
    const date = addDays(TODAY, -back);
    // zoals de weekstrook en het overzicht het doen: de maand vóór de week van deze dag
    const clipped = prepareSnapshot(snapshot, `${addDays(date, -35).slice(0, 7)}-01`);
    assert.deepEqual(
      summarize(buildDayView({ snapshot, date, today: TODAY, prepared: clipped })),
      summarize(buildDayView({ snapshot, date, today: TODAY, prepared: full })),
      `verschil op ${date}`,
    );
  }
});

test('de weekstrook en het maandoverzicht komen overeen met de volledige berekening', () => {
  const snapshot = dataset();
  const full = prepareSnapshot(snapshot);
  const viaFull = (date) => buildDayView({ snapshot, date, today: TODAY, prepared: full }).progress;

  for (const date of [TODAY, addDays(TODAY, -3), addDays(TODAY, -9), addDays(TODAY, -14)]) {
    for (const day of buildWeekStrip({ snapshot, date, today: TODAY })) {
      assert.deepEqual({ done: day.done, total: day.total }, viaFull(day.date), `weekstrook ${day.date}`);
    }
  }
  for (const anchor of [TODAY, '2026-09-10', '2026-08-20', '2026-07-05']) {
    for (const period of ['week', 'month']) {
      const o = buildPeriodOverview({ snapshot, today: TODAY, period, anchor });
      for (const day of o.days.filter((d) => d.inPeriod)) {
        assert.deepEqual({ done: day.done, total: day.total }, viaFull(day.date), `${period} ${anchor} ${day.date}`);
      }
    }
  }
});

test('prepareSnapshot: een gekorte geschiedenis heeft minder check-ins en de startdatum schuift mee', () => {
  const snapshot = dataset();
  const clipped = prepareSnapshot(snapshot, '2026-09-01');
  assert.ok(clipped.bundles.every((b) => b.checkIns.every((c) => c.date >= '2026-09-01')));
  assert.ok(clipped.bundles.every((b) => b.habit.startDate >= '2026-09-01'));
  assert.equal(snapshot.habits[0].startDate < '2026-09-01', true, 'de echte habit blijft ongemoeid');
});
