// De proef "zonder app": wanneer hij kan, wanneer de app zich inhoudt en wanneer de vraag komt (src/domain/trial.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentTrial, hasPassedTrial, isOnTrial, trialCooldownUntil, trialOffer, trialPeriodOf, trialRangeFrom, trialStatus, trialsToAnswer, validateTrials,
} from '../../src/domain/trial.js';
import { validateHabit } from '../../src/domain/habit.js';

const THURSDAY = '2026-10-15';
const flexible = (period = 'week', over = {}) => ({
  id: 'h', name: 'Tuin', icon: '🌱', color: 'c1', daypart: 'anytime', status: 'active', startDate: '2026-09-01', endDate: null,
  schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'times_per_period', period, count: 2 } }], ...over,
});
const weekTrial = (over = {}) => ({ period: 'week', start: '2026-10-19', end: '2026-10-25', result: null, answeredOn: null, ...over });
const monthTrial = (over = {}) => ({ period: 'month', start: '2026-11-01', end: '2026-11-30', result: null, answeredOn: null, ...over });
const rate = (weekStart, score) => ({ habitId: 'h', weekStart, score });
const good = [rate('2026-10-05', 3), rate('2026-10-12', 4)];

test('alleen een flexibele taak heeft een eenheid voor de proef', () => {
  assert.equal(trialPeriodOf(flexible('week'), THURSDAY), 'week');
  assert.equal(trialPeriodOf(flexible('month'), THURSDAY), 'month');
  const fixed = flexible('week', { schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } }] });
  assert.equal(trialPeriodOf(fixed, THURSDAY), null);
});

test('een proef begint op de eerstvolgende hele week of maand; is vandaag de eerste dag, dan vandaag', () => {
  assert.deepEqual(trialRangeFrom('week', THURSDAY), { start: '2026-10-19', end: '2026-10-25' });
  assert.deepEqual(trialRangeFrom('week', '2026-10-19'), { start: '2026-10-19', end: '2026-10-25' });
  assert.deepEqual(trialRangeFrom('week', '2026-10-18'), { start: '2026-10-19', end: '2026-10-25' }, 'zondag: de volgende dag');
  assert.deepEqual(trialRangeFrom('month', THURSDAY), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(trialRangeFrom('month', '2026-11-01'), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(trialRangeFrom('month', '2026-12-31'), { start: '2027-01-01', end: '2027-01-31' });
});

test('stand van een weekproef: gepland, loopt, vraag vanaf vrijdag tot maandag 12:00, daarna verlopen', () => {
  const trial = weekTrial();
  const at = (today, now) => trialStatus(trial, today, now);
  assert.equal(at(THURSDAY, '2026-10-15T09:00'), 'planned');
  assert.equal(at('2026-10-19', '2026-10-19T09:00'), 'running');
  assert.equal(at('2026-10-22', '2026-10-22T23:59'), 'running');
  assert.equal(at('2026-10-23', '2026-10-23T00:00'), 'answer');
  assert.equal(at('2026-10-26', '2026-10-26T11:59'), 'answer');
  assert.equal(at('2026-10-26', '2026-10-26T12:00'), 'expired');
  assert.equal(trialStatus({ ...trial, result: 'passed' }, '2026-10-30', '2026-10-30T09:00'), 'passed');
  assert.equal(trialStatus({ ...trial, result: 'failed' }, '2026-10-20', '2026-10-20T09:00'), 'failed');
});

test('stand van een maandproef: de vraag komt op de 25e en sluit op de 2e om 12:00', () => {
  const trial = monthTrial();
  assert.equal(trialStatus(trial, '2026-11-24', '2026-11-24T23:59'), 'running');
  assert.equal(trialStatus(trial, '2026-11-25', '2026-11-25T00:00'), 'answer');
  assert.equal(trialStatus(trial, '2026-12-02', '2026-12-02T11:59'), 'answer');
  assert.equal(trialStatus(trial, '2026-12-02', '2026-12-02T12:00'), 'expired');
});

test('de app houdt zich in van het begin tot het eind van de periode, behalve na een mislukte proef', () => {
  const habit = (trial) => flexible('week', { trials: [trial] });
  assert.equal(isOnTrial(habit(weekTrial()), '2026-10-18'), false, 'nog niet begonnen');
  assert.equal(isOnTrial(habit(weekTrial()), '2026-10-19'), true);
  assert.equal(isOnTrial(habit(weekTrial()), '2026-10-25'), true);
  assert.equal(isOnTrial(habit(weekTrial()), '2026-10-26'), false);
  assert.equal(isOnTrial(habit(weekTrial({ result: 'passed', answeredOn: '2026-10-23' })), '2026-10-24'), true);
  assert.equal(isOnTrial(habit(weekTrial({ result: 'failed', answeredOn: '2026-10-23' })), '2026-10-24'), false, 'mislukt: de app helpt direct weer');
  assert.equal(isOnTrial(flexible('week'), '2026-10-20'), false);
});

test('na een mislukte proef helpt de app weer: een week-taak 4 hele weken, een maand-taak 2 hele maanden', () => {
  const failed = (trial) => flexible(trial.period, { trials: [{ ...trial, result: 'failed' }] });
  // de proef liep 19–25 oktober: de app helpt de weken van 26 okt, 2, 9 en 16 nov; de maandag erna (23 nov) kan het weer
  assert.equal(trialCooldownUntil(failed(weekTrial({ answeredOn: '2026-10-23' }))), '2026-11-23');
  // de proef liep in oktober: de app helpt november en december; op 1 januari kan het weer
  assert.equal(trialCooldownUntil(failed(monthTrial({ start: '2026-10-01', end: '2026-10-31', answeredOn: '2026-10-30' }))), '2027-01-01');
  assert.equal(trialCooldownUntil(flexible('week')), null);
  assert.equal(trialCooldownUntil(flexible('week', { trials: [weekTrial({ result: 'passed', answeredOn: '2026-10-23' })] })), null);
});

test('de laatste mislukte proef bepaalt de wachttijd', () => {
  const habit = flexible('week', { trials: [
    { period: 'week', start: '2026-08-03', end: '2026-08-09', result: 'failed', answeredOn: '2026-08-07' },
    { period: 'week', start: '2026-10-05', end: '2026-10-11', result: 'failed', answeredOn: '2026-10-09' },
  ] });
  assert.equal(trialCooldownUntil(habit), '2026-11-09');
});

test('trialOffer: wanneer kan een proef beginnen?', () => {
  const offer = (habit, ratings = good, today = THURSDAY, now = `${today}T09:00`) => trialOffer({ habit, ratings, today, now });
  assert.deepEqual(offer(flexible('week')), { state: 'available', period: 'week', range: { start: '2026-10-19', end: '2026-10-25' } });
  assert.equal(offer(flexible('month')).range.start, '2026-11-01');
  assert.equal(offer(flexible('week', { status: 'graduated' })).state, 'inactive');
  const fixed = flexible('week', { schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } }] });
  assert.equal(offer(fixed).state, 'not_flexible');
  assert.deepEqual([offer(flexible('week'), []).state, offer(flexible('week'), []).have], ['scores', 0]);
  assert.deepEqual([offer(flexible('week'), [rate('2026-10-12', 4)]).state], ['scores'], 'één cijfer is te weinig');
  assert.deepEqual(offer(flexible('week'), [rate('2026-10-05', 2), rate('2026-10-12', 4)]), { state: 'scores', have: 1 });
  assert.equal(offer(flexible('week'), [rate('2026-10-05', 3), rate('2026-10-12', 3)]).state, 'available', '3 is genoeg');
});

test('trialOffer: niet als er al een proef speelt, en niet tijdens de wachttijd', () => {
  const busy = flexible('week', { trials: [weekTrial()] });
  assert.equal(trialOffer({ habit: busy, ratings: good, today: THURSDAY, now: '2026-10-15T09:00' }).state, 'busy');
  assert.equal(trialOffer({ habit: busy, ratings: good, today: '2026-10-21', now: '2026-10-21T09:00' }).state, 'busy');
  const after = flexible('week', { trials: [weekTrial({ result: 'passed', answeredOn: '2026-10-23' })] });
  assert.equal(trialOffer({ habit: after, ratings: good, today: '2026-10-27', now: '2026-10-27T09:00' }).state, 'available', 'na een gelukte proef kan het weer');
  const cooling = flexible('week', { trials: [weekTrial({ result: 'failed', answeredOn: '2026-10-23' })] });
  assert.deepEqual(trialOffer({ habit: cooling, ratings: good, today: '2026-11-22', now: '2026-11-22T09:00' }), { state: 'cooldown', until: '2026-11-23' });
  assert.equal(trialOffer({ habit: cooling, ratings: good, today: '2026-11-23', now: '2026-11-23T09:00' }).state, 'available');
  const lapsed = flexible('week', { trials: [weekTrial()] });
  assert.equal(trialOffer({ habit: lapsed, ratings: good, today: '2026-10-27', now: '2026-10-27T09:00' }).state, 'available', 'verlopen zonder antwoord: geen wachttijd');
});

test('currentTrial en hasPassedTrial', () => {
  const habit = flexible('week', { trials: [weekTrial({ result: 'passed', answeredOn: '2026-10-09', start: '2026-10-05', end: '2026-10-11' }), weekTrial()] });
  assert.equal(currentTrial(habit, THURSDAY, '2026-10-15T09:00').start, '2026-10-19');
  assert.equal(hasPassedTrial(habit), true);
  assert.equal(hasPassedTrial(flexible('week')), false);
  assert.equal(currentTrial(flexible('week'), THURSDAY, '2026-10-15T09:00'), null);
});

test('trialsToAnswer: de proeven waar de review van die week of maand nu naar vraagt', () => {
  const a = flexible('week', { id: 'a', trials: [weekTrial()] });
  const b = flexible('month', { id: 'b', trials: [monthTrial({ start: '2026-10-01', end: '2026-10-31' })] });
  const habits = [a, b];
  const ask = (period, start, today, now) => trialsToAnswer({ habits, period, start, today, now }).map((x) => x.habit.id);
  assert.deepEqual(ask('week', '2026-10-19', '2026-10-23', '2026-10-23T09:00'), ['a']);
  assert.deepEqual(ask('week', '2026-10-19', '2026-10-21', '2026-10-21T09:00'), [], 'de review is nog niet open');
  assert.deepEqual(ask('week', '2026-10-12', '2026-10-23', '2026-10-23T09:00'), [], 'een andere week');
  assert.deepEqual(ask('month', '2026-10-01', '2026-10-26', '2026-10-26T09:00'), ['b']);
  assert.deepEqual(ask('week', '2026-10-01', '2026-10-26', '2026-10-26T09:00'), [], 'een maandproef hoort niet bij een weekreview');
});

test('validateTrials en validateHabit: een proef moet kloppen', () => {
  assert.deepEqual(validateTrials(undefined), []);
  assert.deepEqual(validateTrials([weekTrial(), monthTrial({ result: 'passed', answeredOn: '2026-11-26' })]), []);
  const invalid = (trial) => validateTrials([trial]).length > 0;
  assert.equal(invalid({ ...weekTrial(), period: 'year' }), true);
  assert.equal(invalid({ ...weekTrial(), start: 'morgen' }), true);
  assert.equal(invalid({ ...weekTrial(), end: '2026-10-18' }), true, 'het eind komt voor de start');
  assert.equal(invalid({ ...weekTrial(), result: 'maybe' }), true);
  assert.equal(invalid({ ...weekTrial(), answeredOn: 'gisteren' }), true);
  assert.equal(validateTrials('niets').length, 1);
  assert.deepEqual(validateHabit(flexible('week', { trials: [weekTrial()] })), []);
  assert.deepEqual(validateHabit(flexible('week', { trials: [{ ...weekTrial(), period: 'year' }] })), [{ field: 'trials', code: 'invalid' }]);
});
