import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConsistency, computeStreaks } from '../../src/domain/streaks.js';
import { computeStrength } from '../../src/domain/strength.js';
import { computeUnits } from '../../src/domain/units.js';
import { addDays, eachDay } from '../../src/domain/dates.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { checks, habit, perMonth, perWeek, weekdaysSchedule } from './helpers.js';

const daily = weekdaysSchedule(ALL_WEEKDAYS);
const unit = (status, days = 1, span = 'day', end = '2026-10-01') => ({ status, days, span, end });
const seq = (...statuses) => statuses.map((s) => unit(s));

test('reeks: een gemiste eenheid breekt, overgeslagen/gepauzeerd/open niet', () => {
  assert.deepEqual(computeStreaks(seq('done', 'done', 'missed', 'done', 'open')), { current: 1, best: 2 });
  assert.deepEqual(computeStreaks(seq('done', 'skipped', 'paused', 'done')), { current: 2, best: 2 });
  assert.deepEqual(computeStreaks(seq('done', 'minimal', 'done', 'open')), { current: 3, best: 3 });
  assert.deepEqual(computeStreaks(seq('done', 'done', 'done', 'missed')), { current: 0, best: 3 });
  assert.deepEqual(computeStreaks([]), { current: 0, best: 0 });
});

test('reeks bij flexibele habits telt in weken', () => {
  const units = computeUnits({
    habit: habit(perWeek(2), '2026-09-14'),
    checkIns: checks(
      ['2026-09-14'], ['2026-09-16'], // week 1 ✓
      ['2026-09-21'], ['2026-09-22'], // week 2 ✓
      ['2026-09-28'], // week 3 ✗ (1 van 2)
      ['2026-10-05'], ['2026-10-06'], // week 4 ✓
    ),
    today: '2026-10-12',
  });
  assert.deepEqual(computeStreaks(units), { current: 1, best: 2 });
});

function dailyUnitsWithMisses(start, today, misses) {
  const days = eachDay(start, addDays(today, -1)).filter((d) => !misses.includes(d));
  return computeUnits({ habit: habit(daily, start), checkIns: days.map((date) => ({ date, status: 'done' })), today });
}

test('consistentie: 42-dagenvenster, vandaag (open) telt niet, oude missers vallen af', () => {
  const units = dailyUnitsWithMisses('2026-08-01', '2026-10-15', [
    '2026-08-15', // vóór het venster
    '2026-09-10', '2026-09-20', '2026-10-01', '2026-10-10',
  ]);
  const c = computeConsistency(units, { today: '2026-10-15' });
  assert.equal(c.total, 41); // 4 sep t/m 14 okt (42-dagenvenster minus de open dag vandaag)
  assert.equal(c.missed, 4);
  assert.equal(c.done, 37);
  assert.ok(Math.abs(c.rate - 37 / 41) < 1e-12);
});

test('consistentie: null zolang er niets is afgesloten', () => {
  const units = computeUnits({ habit: habit(daily, '2026-10-15'), today: '2026-10-15' });
  assert.equal(computeConsistency(units, { today: '2026-10-15' }).rate, null);
  assert.equal(computeConsistency([], { today: '2026-10-15' }).rate, null);
});

test('consistentie: maandelijkse habits kijken minstens naar de laatste 3 perioden', () => {
  const units = computeUnits({
    habit: habit(perMonth(1), '2026-06-01'),
    checkIns: checks(['2026-06-10'], ['2026-08-05']),
    today: '2026-10-15',
  });
  // afgesloten: jun ✓, jul ✗, aug ✓, sep ✗ — in het 42-dagenvenster valt alleen september
  const c = computeConsistency(units, { today: '2026-10-15' });
  assert.deepEqual([c.done, c.missed, c.total], [1, 2, 3]);
});

test('gewoontesterkte: lege reeks is 0, open eenheden tellen niet', () => {
  assert.equal(computeStrength([]), 0);
  assert.equal(computeStrength(seq('open')), 0);
  assert.equal(computeStrength(seq('paused', 'skipped')), 0);
});

test('gewoontesterkte: dagelijks volhouden volgt 1 – 0.95^n', () => {
  const dones = (n) => seq(...Array(n).fill('done'));
  assert.ok(Math.abs(computeStrength(dones(21)) - (1 - 0.95 ** 21)) < 1e-12);
  assert.ok(Math.abs(computeStrength(dones(66)) - (1 - 0.95 ** 66)) < 1e-12);
  assert.ok(computeStrength(dones(21)) > 0.65 && computeStrength(dones(21)) < 0.67);
  assert.ok(computeStrength(dones(66)) > 0.96);
});

test('gewoontesterkte: één misser verlaagt een beetje en reset niet', () => {
  const perfect = computeStrength(seq(...Array(66).fill('done')));
  const oneMiss = computeStrength(seq(...Array(66).fill('done'), 'missed'));
  assert.ok(oneMiss < perfect);
  assert.ok(oneMiss > 0.9);
  assert.ok(Math.abs(oneMiss - perfect * 0.95) < 1e-12);
});

test('gewoontesterkte: minimale versie telt als gedaan, een week weegt als 7 dagen', () => {
  assert.equal(computeStrength(seq('minimal')), computeStrength(seq('done')));
  const week = [unit('done', 7, 'week')];
  assert.ok(Math.abs(computeStrength(week) - (1 - 0.95 ** 7)) < 1e-12);
});

test('gewoontesterkte: herstel na een misser wordt beloond (later gedaan = sterker)', () => {
  const missEarly = computeStrength(seq('missed', ...Array(20).fill('done')));
  const missLate = computeStrength(seq(...Array(20).fill('done'), 'missed'));
  assert.ok(missEarly > missLate);
});
