import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boostCredit, canComplete, currentStep, growthNudge, growthView, isGrowing, nudgeThreshold, stepRepetitions, validateGoal,
} from '../../src/domain/growth.js';
import { buildHabitStats } from '../../src/domain/stats.js';
import { addDays, eachDay } from '../../src/domain/dates.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { habit, perMonth, perWeek, weekdaysSchedule } from './helpers.js';

const TODAY = '2026-10-15'; // donderdag
const daily = weekdaysSchedule(ALL_WEEKDAYS);

const goal = (over = {}) => ({ kind: 'frequency', ideal: { schedule: perWeek(4) }, stepStart: '2026-09-07', credit: 0, snoozedAt: null, completedOn: null, log: [], ...over });
const growing = (schedule, start, over = {}, extra = {}) => habit(schedule, start, { goal: goal(over), ...extra });
const codes = (errors) => errors.map((e) => `${e.field}.${e.code}`);

/** `perWeekDays`: in elke week vanaf `from` tot en met `weeks` weken die dagen (0 = maandag) afvinken. */
function weeklyCheckIns(from, weeks, days) {
  return Array.from({ length: weeks }, (_, w) => days.map((d) => ({ habitId: 'h1', date: addDays(from, w * 7 + d), status: 'done' }))).flat();
}
const statsOf = (h, checkIns) => buildHabitStats({ habit: h, checkIns, today: TODAY });

test('validateGoal: geen doel is geldig; de soorten en hun velden worden gecontroleerd', () => {
  assert.deepEqual(validateGoal(null), []);
  assert.deepEqual(validateGoal(undefined), []);
  const h = habit(perWeek(1), '2026-09-07');
  assert.deepEqual(validateGoal(goal(), h), []);
  assert.deepEqual(codes(validateGoal(goal({ kind: 'nope' }), h)), ['goal.kind.invalid']);
  assert.deepEqual(codes(validateGoal(goal({ stepStart: 'gisteren' }), h)), ['goal.stepStart.invalid']);
  assert.deepEqual(codes(validateGoal(goal({ credit: -1 }), h)), ['goal.credit.invalid']);
  assert.deepEqual(codes(validateGoal(goal({ ideal: { schedule: perWeek(9) } }), h)), ['goal.ideal.invalid'], 'hoogstens 7× per week');
  assert.deepEqual(codes(validateGoal(goal({ ideal: { schedule: perMonth(4) } }), h)), ['goal.ideal.needs_times_per_period'], 'dezelfde periode als het ritme');
  assert.deepEqual(codes(validateGoal(goal(), habit(daily, '2026-09-07'))), ['goal.ideal.needs_times_per_period'], 'vaste weekdagen hebben geen aantal om op te schalen');
  assert.deepEqual(codes(validateGoal(goal({ log: Array(31).fill({ date: TODAY, choice: 'up', from: 'a', to: 'b' }) }), h)), ['goal.log.invalid']);
  assert.deepEqual(codes(validateGoal(goal({ log: [{ date: TODAY, choice: 'sideways', from: 'a', to: 'b' }] }), h)), ['goal.log.invalid']);
});

test('validateGoal: een hoeveelheid vraagt een teller, een tekstdoel een concrete trede en een concreet ideaal', () => {
  const counted = habit(daily, '2026-09-07', { counter: { unit: 'ml', target: 500 } });
  assert.deepEqual(validateGoal({ ...goal(), kind: 'quantity', ideal: { target: 2000 } }, counted), [], '2 liter in ml past (tot 9999)');
  assert.deepEqual(codes(validateGoal({ ...goal(), kind: 'quantity', ideal: { target: 2000 } }, habit(daily, '2026-09-07'))), ['goal.ideal.needs_counter']);
  assert.deepEqual(codes(validateGoal({ ...goal(), kind: 'quantity', ideal: { target: 20000 } }, counted)), ['goal.ideal.invalid']);
  const text = (over) => ({ ...goal(), kind: 'text', ideal: { text: 'een uur lezen' }, stepText: 'een kwartier lezen', ...over });
  assert.deepEqual(validateGoal(text(), habit(daily, '2026-09-07')), []);
  assert.deepEqual(codes(validateGoal(text({ stepText: '  ' }), habit(daily, '2026-09-07'))), ['goal.stepText.required']);
  assert.deepEqual(codes(validateGoal(text({ ideal: { text: '' } }), habit(daily, '2026-09-07'))), ['goal.ideal.required']);
  assert.deepEqual(codes(validateGoal(text({ ideal: { text: 'x'.repeat(61) } }), habit(daily, '2026-09-07'))), ['goal.ideal.too_long']);
});

test('isGrowing: een doel dat nog niet is afgerond', () => {
  assert.equal(isGrowing(habit(perWeek(1), '2026-09-07')), false);
  assert.equal(isGrowing(growing(perWeek(1), '2026-09-07')), true);
  assert.equal(isGrowing(growing(perWeek(1), '2026-09-07', { completedOn: TODAY })), false, 'Uitgebouwd: het gewone traject');
});

test('nudgeThreshold: de helft van wat ingeburgerd vraagt, met een ondergrens van 6 keer', () => {
  assert.equal(nudgeThreshold(daily), 27, 'dagelijks');
  assert.equal(nudgeThreshold(perWeek(4)), 16);
  assert.equal(nudgeThreshold(perWeek(2)), 8);
  assert.equal(nudgeThreshold(perWeek(1)), 6, 'de ondergrens');
  assert.equal(nudgeThreshold(perMonth(1)), 6);
  assert.equal(nudgeThreshold(null), 6, 'onbekend ritme');
});

test('boostCredit: de helft van de vorige trede, hoogstens de helft van de nieuwe drempel, nooit negatief', () => {
  assert.equal(boostCredit(20, 27), 10);
  assert.equal(boostCredit(40, 27), 13, 'begrensd door de helft van de nieuwe drempel');
  assert.equal(boostCredit(5, 6), 2);
  assert.equal(boostCredit(0, 27), 0);
  assert.equal(boostCredit(1, 6), 0);
});

test('growthView: de trede van nu, het ideaal en de voortgang per soort', () => {
  const f = growthView(growing(perWeek(2), '2026-09-07'), TODAY);
  assert.deepEqual([f.current, f.ideal, f.progress, f.stepNumber, f.atIdeal], ['2× per week', '4× per week', 0.5, 1, false]);
  const atTop = growthView(growing(perWeek(4), '2026-09-07'), TODAY);
  assert.deepEqual([atTop.progress, atTop.atIdeal], [1, true]);
  const q = growthView(habit(daily, '2026-09-07', { counter: { unit: 'ml', target: 500 }, goal: goal({ kind: 'quantity', ideal: { target: 2000 } }) }), TODAY);
  assert.deepEqual([q.current, q.ideal, q.progress], ['500 ml', '2000 ml', 0.25]);
  const t = growthView(habit(daily, '2026-09-07', { goal: goal({ kind: 'text', ideal: { text: 'een uur lezen' }, stepText: 'een kwartier lezen' }) }), TODAY);
  assert.deepEqual([t.current, t.ideal, t.progress, t.atIdeal], ['een kwartier lezen', 'een uur lezen', null, false], 'een tekstdoel heeft geen balk');
  const stepped = growthView(growing(perWeek(3), '2026-09-07', { log: [{ date: '2026-09-21', choice: 'up', from: 'a', to: 'b' }, { date: '2026-10-05', choice: 'up', from: 'b', to: 'c' }, { date: '2026-10-10', choice: 'down', from: 'c', to: 'b' }] }), TODAY);
  assert.equal(stepped.stepNumber, 2, 'twee omhoog en één terug');
  assert.equal(growthView(habit(perWeek(1), '2026-09-07'), TODAY), null);
  assert.deepEqual(currentStep(growing(perWeek(2), '2026-09-07'), TODAY), { count: 2, period: 'week' });
});

test('stepRepetitions: het tegoed plus wat sinds het begin van de trede is gedaan (ook de minimale versie, niet het overgeslagene)', () => {
  const h = growing(perWeek(2), '2026-09-07', { stepStart: '2026-10-01', credit: 3 });
  const checks = [
    { habitId: 'h1', date: '2026-09-30', status: 'done' }, // vóór de trede
    { habitId: 'h1', date: '2026-10-01', status: 'done' },
    { habitId: 'h1', date: '2026-10-03', status: 'minimal' },
    { habitId: 'h1', date: '2026-10-05', status: 'skipped' },
    { habitId: 'other', date: '2026-10-06', status: 'done' },
  ];
  assert.equal(stepRepetitions(h, checks), 5);
  assert.equal(stepRepetitions(habit(perWeek(1), '2026-09-07'), checks), 0, 'zonder doel');
});

test('growthNudge: ready, building, snoozed, wait, shaky en reached', () => {
  const nudge = (h, checks, ratings = []) => growthNudge({ habit: h, checkIns: checks, units: statsOf(h, checks).units, ratings, today: TODAY });
  const two = growing(perWeek(2), '2026-09-07');

  // 5 weken × 2 keer: 10 keer ≥ drempel 8, elke week gehaald
  const ten = weeklyCheckIns('2026-09-07', 5, [0, 2]);
  const ready = nudge(two, ten);
  assert.deepEqual([ready.state, ready.reps, ready.threshold, ready.rate], ['ready', 10, 8, 1]);

  // de trede begon op 21 september: alleen de keren daarna tellen (3 weken = 6 keer < 8)
  const early = nudge(growing(perWeek(2), '2026-09-07', { stepStart: '2026-09-21' }), ten);
  assert.deepEqual([early.state, early.reps], ['building', 6]);
  // maar met de boost (tegoed 2) is het 8 en dus klaar
  assert.equal(nudge(growing(perWeek(2), '2026-09-07', { stepStart: '2026-09-21', credit: 2 }), ten).state, 'ready');

  // "Niet nu": wacht tot er nog de helft van de drempel (4) aan keren bij is én 14 dagen voorbij zijn
  const snoozed = (reps, date) => nudge(growing(perWeek(2), '2026-09-07', { snoozedAt: { reps, date } }), ten).state;
  assert.equal(snoozed(10, '2026-10-10'), 'snoozed', 'te kort geleden en geen nieuwe keren');
  assert.equal(snoozed(4, '2026-10-10'), 'snoozed', 'genoeg nieuwe keren maar nog geen 14 dagen');
  assert.equal(snoozed(10, '2026-09-20'), 'snoozed', 'lang genoeg geleden maar geen nieuwe keren');
  assert.equal(snoozed(4, '2026-09-20'), 'ready', 'beide voorbij: de nudge mag terugkomen');

  // het automatisme-cijfer zegt dat het nog moeite kost
  assert.equal(nudge(two, ten, [{ score: 2 }]).state, 'wait');
  assert.equal(nudge(two, ten, [{ score: 3 }]).state, 'ready');

  // een gemiste week (de laatste twee eenheden): niet klaar, ook met genoeg keren
  const missedLast = [...weeklyCheckIns('2026-09-07', 4, [0, 2, 4])]; // 12 keer, maar de week van 5 oktober is gemist
  assert.equal(nudge(two, missedLast).state, 'building');

  // wankel: de laatste vier weken minder dan de helft gehaald
  const shaky = nudge(two, [...weeklyCheckIns('2026-09-07', 2, [0, 2]), ...weeklyCheckIns('2026-09-21', 1, [0])]);
  assert.equal(shaky.state, 'shaky');

  // het ideaal bereikt (4× per week, 16 keren, 5 weken van 4): reached zolang het nog niet zit, ready = af te ronden
  const four = growing(perWeek(4), '2026-09-07');
  const sixteen = weeklyCheckIns('2026-09-07', 4, [0, 1, 3, 5]); // de week van 5 oktober is dan gemist
  assert.equal(nudge(four, sixteen).state, 'reached');
  const twenty = weeklyCheckIns('2026-09-07', 5, [0, 1, 3, 5]);
  const top = nudge(four, twenty);
  assert.deepEqual([top.state, top.atIdeal, canComplete(top)], ['ready', true, true]);
  assert.equal(canComplete(ready), false, 'niet op het ideaal: wel klaar voor een trede hoger, nog niet af');

  assert.deepEqual(nudge(habit(perWeek(1), '2026-09-07'), []), { state: 'none' });
  assert.deepEqual(nudge(growing(perWeek(4), '2026-09-07', { completedOn: TODAY }), twenty), { state: 'none' }, 'Uitgebouwd: de nudge zwijgt');
});
