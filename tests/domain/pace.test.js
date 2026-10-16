import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graduationPace, timesPerWeek } from '../../src/domain/pace.js';
import { evaluateGraduation } from '../../src/domain/graduation.js';
import { phaseFor } from '../../src/domain/phases.js';
import { buildHabitStats } from '../../src/domain/stats.js';
import { ALL_WEEKDAYS, WORKDAYS } from '../../src/domain/schedule.js';
import { addDays } from '../../src/domain/dates.js';
import { habit, onDay, perMonth, perWeek, weekdaysSchedule } from './helpers.js';

const pace = (schedule, graduationDays) => graduationPace({ schedule, graduationDays });

test('tempo: keren per week voor elk soort schema', () => {
  assert.equal(timesPerWeek(weekdaysSchedule(ALL_WEEKDAYS)), 7);
  assert.equal(timesPerWeek(weekdaysSchedule(WORKDAYS)), 5);
  assert.equal(timesPerWeek(perWeek(3)), 3);
  assert.ok(Math.abs(timesPerWeek(perMonth(2)) - 0.46) < 0.01);
  assert.ok(Math.abs(timesPerWeek(onDay(15)) - 0.23) < 0.01);
  assert.equal(timesPerWeek({ type: 'onbekend' }), null);
  assert.equal(timesPerWeek(null), null);
});

test('vereiste keren: 80% van wat het ritme in 66 dagen oplevert, minimaal 8, nooit meer dan het aantal dagen', () => {
  assert.equal(pace(weekdaysSchedule(ALL_WEEKDAYS)).requiredRepetitions, 53);
  assert.equal(pace(weekdaysSchedule(WORKDAYS)).requiredRepetitions, 38);
  assert.equal(pace(perWeek(3)).requiredRepetitions, 23);
  assert.equal(pace(perWeek(1)).requiredRepetitions, 8);
  assert.equal(pace(perMonth(2)).requiredRepetitions, 8);
  assert.equal(pace(perMonth(1)).requiredRepetitions, 8);
  assert.equal(pace(onDay(1)).requiredRepetitions, 8);
  assert.equal(pace(weekdaysSchedule(ALL_WEEKDAYS), 100).requiredRepetitions, 80);
  assert.equal(pace(weekdaysSchedule(ALL_WEEKDAYS), 7).requiredRepetitions, 7); // grens van 7 dagen: de ondergrens wijkt
});

test('zeldzaam is minder dan één keer per week', () => {
  assert.equal(pace(weekdaysSchedule(ALL_WEEKDAYS)).sparse, false);
  assert.equal(pace(weekdaysSchedule([2])).sparse, false); // precies één keer per week
  assert.equal(pace(perWeek(1)).sparse, false);
  assert.equal(pace(perMonth(5)).sparse, false);
  assert.equal(pace(perMonth(4)).sparse, true);
  assert.equal(pace(perMonth(2)).sparse, true);
  assert.equal(pace(onDay(20)).sparse, true);
});

test('onbekend ritme: geen eis aan keren en niet zeldzaam', () => {
  assert.deepEqual(pace(null), { timesPerWeek: null, sparse: false, requiredRepetitions: null, startingRepetitions: null });
});

test('opstarten in keren: dezelfde verhouding als 21 van 66 dagen, minimaal 1 en altijd met opbouw erna', () => {
  assert.equal(pace(perMonth(2)).startingRepetitions, 3);
  assert.equal(pace(perMonth(2), 7).startingRepetitions, 6);
  assert.equal(pace(perMonth(2), 100).startingRepetitions, 2);
});

test('ingeburgerd: ook het aantal keren moet gehaald zijn (als het ritme bekend is)', () => {
  const base = { activeDays: 100, consistencyRate: 1, requiredRepetitions: 8 };
  assert.equal(evaluateGraduation({ ...base, repetitions: 7 }).eligible, false);
  assert.equal(evaluateGraduation({ ...base, repetitions: 8 }).eligible, true);
  assert.equal(evaluateGraduation({ activeDays: 100, consistencyRate: 1 }).eligible, true); // zonder eis (zoals voorheen)
  const result = evaluateGraduation({ ...base, repetitions: 3 });
  assert.deepEqual(result.criteria.map((c) => [c.key, c.met]), [['days', true], ['repetitions', false], ['consistency', true]]);
  assert.deepEqual(result.criteria[1], { key: 'repetitions', met: false, value: 3, required: 8 });
});

test('fases in keren: opstarten t/m de eerste keren, daarna opbouw; voortgang richting het doel', () => {
  const times = (repetitions) => ({ repetitions, required: 8, startingUntil: 3 });
  assert.equal(phaseFor({ activeDays: 0, times: times(0) }).phase, 'planned');
  assert.equal(phaseFor({ activeDays: 5, times: times(0) }).phase, 'starting'); // gestart maar nog niets gedaan
  assert.equal(phaseFor({ activeDays: 40, times: times(3) }).phase, 'starting');
  assert.equal(phaseFor({ activeDays: 70, times: times(4) }).phase, 'building');
  const full = phaseFor({ activeDays: 200, times: times(6) });
  assert.deepEqual([full.unit, full.day, full.total, full.progress], ['times', 6, 8, 0.75]);
  assert.equal(phaseFor({ activeDays: 200, graduated: true, times: times(9) }).phase, 'established');
  assert.equal(phaseFor({ activeDays: 33 }).unit, 'days');
});

// --- samen in de stats ---------------------------------------------------------------------------

const TODAY = '2026-10-15';
const everyOtherWeek = (from, count) => Array.from({ length: count }, (_, i) => ({ date: addDays(from, i * 14), status: 'done' }));

test('stats: een taak 2× per maand wordt pas na 8 keer én 66 dagen voorgesteld, en vraagt een automatisme-cijfer', () => {
  const h = habit(perMonth(2), '2026-01-01');
  const checkIns = (n) => everyOtherWeek('2026-01-01', n);

  const few = buildHabitStats({ habit: h, checkIns: checkIns(6), today: TODAY, useAutomaticity: false, automaticityScore: null });
  assert.equal(few.pace.sparse, true);
  assert.equal(few.phase.unit, 'times');
  assert.deepEqual([few.phase.day, few.phase.total], [6, 8]);
  assert.equal(few.graduation.criteria.find((c) => c.key === 'repetitions').met, false);

  // 8 keer gedaan, maar nog geen automatisme-cijfer
  const noRating = buildHabitStats({ habit: h, checkIns: checkIns(8), today: TODAY });
  assert.equal(noRating.graduation.criteria.find((c) => c.key === 'repetitions').met, true);
  assert.deepEqual(noRating.graduation.criteria.find((c) => c.key === 'automaticity'), { key: 'automaticity', met: false, value: null, required: 4 });
  assert.equal(noRating.graduation.eligible, false);

  const rated = buildHabitStats({ habit: h, checkIns: checkIns(8), today: TODAY, automaticityScore: 4 });
  assert.equal(rated.graduation.criteria.find((c) => c.key === 'automaticity').met, true);
});

test('stats: een dagelijkse habit blijft in dagen en houdt het automatisme optioneel', () => {
  const h = habit(weekdaysSchedule(ALL_WEEKDAYS), '2026-08-01');
  const checkIns = Array.from({ length: 76 }, (_, i) => ({ date: addDays('2026-08-01', i), status: 'done' }));
  const stats = buildHabitStats({ habit: h, checkIns, today: TODAY });
  assert.equal(stats.pace.sparse, false);
  assert.equal(stats.phase.unit, 'days');
  assert.deepEqual(stats.graduation.criteria.map((c) => c.key), ['days', 'repetitions', 'consistency']);
  assert.equal(stats.graduation.eligible, true);
});

test('stats: een habit met 90% dagelijks gedaan wordt na 66 dagen nog steeds voorgesteld', () => {
  const h = habit(weekdaysSchedule(ALL_WEEKDAYS), '2026-08-01'); // 76 dagen, elke tiende dag gemist
  const checkIns = Array.from({ length: 76 }, (_, i) => i).filter((i) => i % 10 !== 9).map((i) => ({ date: addDays('2026-08-01', i), status: 'done' }));
  const stats = buildHabitStats({ habit: h, checkIns, today: TODAY });
  assert.equal(stats.graduation.eligible, true);
});
