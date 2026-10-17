// De vroege waarschuwing voor flexibele taken die dreigen te falen (docs/ONBOARDING.md is hier niet voor; zie de afspraak in TIGHT_RATIO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTight } from '../../src/domain/tight.js';
import { computeUnits } from '../../src/domain/units.js';
import { addDays } from '../../src/domain/dates.js';

const week = (count, remainingDays, target = 2) => isTight({ count, target, remainingDays, days: 7 });

test('2× per week: donderdag nog niets gedaan is krap; met één keer gedaan, of op woensdag, nog niet', () => {
  assert.equal(week(0, 7), false); // maandag
  assert.equal(week(0, 5), false); // woensdag: 5 van 7 dagen over
  assert.equal(week(0, 4), true); // donderdag: 4 van 7
  assert.equal(week(1, 4), false); // donderdag, één keer gedaan
  assert.equal(week(1, 2), true); // zaterdag, één keer gedaan: nog 1 nodig met 2 van 7 dagen over (29% < 60%)
  assert.equal(week(2, 1), false); // klaar
});

test('1× per week komt pas laat in de week in beeld, 3× per week eerder', () => {
  assert.equal(week(0, 5, 1), false); // woensdag
  assert.equal(week(0, 4, 1), true); // donderdag
  assert.equal(week(0, 5, 3), false);
  assert.equal(week(0, 4, 3), true);
  assert.equal(week(2, 4, 3), false); // nog 1 van 3 nodig: pas veel later
});

test('2× per maand: vanaf ongeveer de veertiende, bij 31 dagen', () => {
  const month = (count, remainingDays) => isTight({ count, target: 2, remainingDays, days: 31 });
  assert.equal(month(0, 19), false); // dag 13
  assert.equal(month(0, 18), true); // dag 14
  assert.equal(month(1, 18), false);
  assert.equal(month(1, 8), true);
});

test('onzinwaarden geven geen waarschuwing', () => {
  assert.equal(isTight({ count: 0, target: 0, remainingDays: 3, days: 7 }), false);
  assert.equal(isTight({ count: 0, target: 2, remainingDays: 3, days: 0 }), false);
  assert.equal(isTight({ count: 3, target: 2, remainingDays: 3, days: 7 }), false);
});

test('op de echte eenheden van een habit: donderdag 0 van 2 is krap, met een keer gedaan niet', () => {
  const monday = '2026-10-12';
  const habit = { id: 'g', startDate: '2026-09-01', endDate: null, schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'times_per_period', period: 'week', count: 2 } }] };
  const thursday = addDays(monday, 3);
  const unitOn = (checkIns) => computeUnits({ habit, checkIns, pauses: [], today: thursday }).find((u) => u.start === monday);
  assert.equal(isTight(unitOn([])), true);
  assert.equal(isTight(unitOn([{ date: monday, status: 'done' }])), false);
  const wednesday = addDays(monday, 2);
  assert.equal(isTight(computeUnits({ habit, checkIns: [], pauses: [], today: wednesday }).find((u) => u.start === monday)), false);
});
