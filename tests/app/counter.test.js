import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustCounter, applyHabitForm, logCheckIn, RuleError } from '../../src/app/actions.js';
import { buildDayView } from '../../src/app/day-view.js';
import { ValidationError } from '../../src/data/repository.js';
import { clampCounter, counterDoneValue, counterStatus, COUNTER_MAX } from '../../src/domain/counter.js';
import { validateHabit } from '../../src/domain/habit.js';
import { computeUnits } from '../../src/domain/units.js';
import { TEMPLATES } from '../../src/content/templates.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const water = (over = {}) => validHabit({ id: 'w', name: 'Water', counter: { unit: 'glazen', target: 8 }, ...over });
const codes = (errors) => errors.map((e) => `${e.field}.${e.code}`);

// --- domein ------------------------------------------------------------------------------------

test('counterStatus: met doel pas gedaan op het doel; zonder doel meteen bij 1', () => {
  const goal = { unit: 'glazen', target: 8 };
  assert.equal(counterStatus(0, goal), null);
  assert.equal(counterStatus(-1, goal), null);
  assert.equal(counterStatus(1, goal), 'partial');
  assert.equal(counterStatus(7, goal), 'partial');
  assert.equal(counterStatus(8, goal), 'done');
  assert.equal(counterStatus(11, goal), 'done');
  const free = { unit: 'glazen', target: null };
  assert.equal(counterStatus(0, free), null);
  assert.equal(counterStatus(1, free), 'done');
});

test('clampCounter en counterDoneValue', () => {
  assert.equal(clampCounter(-3), 0);
  assert.equal(clampCounter(5), 5);
  assert.equal(clampCounter(5000), COUNTER_MAX);
  assert.equal(counterDoneValue({ unit: 'x', target: 8 }, 3), 8);
  assert.equal(counterDoneValue({ unit: 'x', target: 8 }, 10), 10);
  assert.equal(counterDoneValue({ unit: 'x', target: null }, 0), 1);
});

test('validateHabit: tellerregels', () => {
  assert.deepEqual(validateHabit(water()), []);
  assert.deepEqual(validateHabit(water({ counter: { unit: 'glazen', target: null } })), []);
  assert.deepEqual(codes(validateHabit(water({ counter: { unit: '  ', target: 8 } }))), ['counterUnit.required']);
  assert.deepEqual(codes(validateHabit(water({ counter: { unit: 'x'.repeat(21), target: 8 } }))), ['counterUnit.too_long']);
  assert.deepEqual(codes(validateHabit(water({ counter: { unit: 'glazen', target: 0 } }))), ['counterTarget.invalid']);
  assert.deepEqual(codes(validateHabit(water({ counter: { unit: 'glazen', target: 8.5 } }))), ['counterTarget.invalid']);
  assert.deepEqual(codes(validateHabit(water({ counter: { unit: 'glazen', target: 1000 } }))), ['counterTarget.invalid']);
});

test('validateHabit: een teller past niet bij N× per week of dag van de maand', () => {
  const weekly = [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period: 'week', count: 2 } }];
  assert.deepEqual(codes(validateHabit(water({ schedules: weekly }))), ['counter.needs_weekdays']);
});

test('een deels geteld ("partial") dag is niet gedaan: verleden = gemist, vandaag = open', () => {
  const habit = water({ startDate: '2026-10-13', schedules: [{ effectiveFrom: '2026-10-13', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } }] });
  const units = computeUnits({
    habit,
    checkIns: [
      { date: '2026-10-13', status: 'partial', value: 5 },
      { date: '2026-10-14', status: 'done', value: 8 },
      { date: TODAY, status: 'partial', value: 3 },
    ],
    today: TODAY,
  });
  assert.deepEqual(units.map((u) => u.status), ['missed', 'done', 'open']);
});

// --- opslag en acties ------------------------------------------------------------------------------

test('repository: waarde wordt bewaard en gevalideerd', async () => {
  const { repo } = testRepo();
  await repo.setCheckIn({ habitId: 'w', date: TODAY, status: 'partial', value: 3 });
  assert.equal((await repo.getCheckIn('w', TODAY)).value, 3);
  await repo.setCheckIn({ habitId: 'w', date: TODAY, status: 'done' });
  assert.equal((await repo.getCheckIn('w', TODAY)).value, null);
  for (const value of [-1, 1.5, 1000, 'acht']) {
    await assert.rejects(() => repo.setCheckIn({ habitId: 'w', date: TODAY, status: 'done', value }), ValidationError);
  }
});

test('adjustCounter: +1 telt op en de status volgt het doel', async () => {
  const { repo } = testRepo();
  const habit = water();
  for (let i = 1; i <= 7; i++) await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  let checkIn = await repo.getCheckIn('w', TODAY);
  assert.deepEqual([checkIn.value, checkIn.status], [7, 'partial']);
  await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  checkIn = await repo.getCheckIn('w', TODAY);
  assert.deepEqual([checkIn.value, checkIn.status], [8, 'done']);
  await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY); // meer dan het doel mag
  assert.equal((await repo.getCheckIn('w', TODAY)).value, 9);
});

test('adjustCounter: −1 tot 0 wist de check-in; nooit onder 0; terug onder het doel is weer partial', async () => {
  const { repo } = testRepo();
  const habit = water();
  await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  await adjustCounter(repo, { habit, date: TODAY, delta: -1 }, TODAY);
  assert.equal(await repo.getCheckIn('w', TODAY), null);
  const result = await adjustCounter(repo, { habit, date: TODAY, delta: -1 }, TODAY);
  assert.equal(result.value, 0);
  assert.equal(await repo.getCheckIn('w', TODAY), null);

  for (let i = 0; i < 8; i++) await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  await adjustCounter(repo, { habit, date: TODAY, delta: -1 }, TODAY);
  const back = await repo.getCheckIn('w', TODAY);
  assert.deepEqual([back.value, back.status], [7, 'partial']);
});

test('adjustCounter: zonder doel is 1 al gedaan', async () => {
  const { repo } = testRepo();
  const habit = water({ counter: { unit: 'koppen', target: null } });
  const { status } = await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  assert.equal(status, 'done');
});

test('adjustCounter: undo zet de vorige waarde terug', async () => {
  const { repo } = testRepo();
  const habit = water();
  await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  const second = await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  await second.undo();
  assert.equal((await repo.getCheckIn('w', TODAY)).value, 1);
  const first = await adjustCounter(repo, { habit, date: '2026-10-14', delta: 1 }, TODAY);
  await first.undo();
  assert.equal(await repo.getCheckIn('w', '2026-10-14'), null);
});

test('adjustCounter: geldt per dag — gisteren en vandaag zijn los van elkaar', async () => {
  const { repo } = testRepo();
  const habit = water();
  for (let i = 0; i < 8; i++) await adjustCounter(repo, { habit, date: '2026-10-14', delta: 1 }, TODAY);
  await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  assert.equal((await repo.getCheckIn('w', '2026-10-14')).status, 'done');
  assert.equal((await repo.getCheckIn('w', TODAY)).value, 1); // vandaag begon bij 0
});

test('adjustCounter: alleen voor tellers en binnen het invulvenster', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => adjustCounter(repo, { habit: validHabit({ id: 'x' }), date: TODAY, delta: 1 }, TODAY), (e) => e instanceof RuleError && e.code === 'not_a_counter');
  await assert.rejects(() => adjustCounter(repo, { habit: water(), date: '2026-09-01', delta: 1 }, TODAY), (e) => e.code === 'backfill_window');
  await assert.rejects(() => adjustCounter(repo, { habit: water(), date: '2026-10-16', delta: 1 }, TODAY), RuleError);
});

test('adjustCounter: een overgeslagen dag begint opnieuw bij 0; "doel gehaald" via het menu bewaart de waarde', async () => {
  const { repo } = testRepo();
  const habit = water();
  await repo.setCheckIn({ habitId: 'w', date: TODAY, status: 'skipped', note: 'ziek' });
  const { value } = await adjustCounter(repo, { habit, date: TODAY, delta: 1 }, TODAY);
  assert.equal(value, 1);

  await logCheckIn(repo, { habitId: 'w', date: '2026-10-14', status: 'done', value: counterDoneValue(habit.counter, 3) }, TODAY);
  assert.equal((await repo.getCheckIn('w', '2026-10-14')).value, 8);
  const more = await adjustCounter(repo, { habit, date: '2026-10-14', delta: 1 }, TODAY);
  assert.equal(more.value, 9);
});

test('adjustCounter: een als gedaan gemarkeerde dag zonder waarde telt vanaf het doel door', async () => {
  const { repo } = testRepo();
  await repo.setCheckIn({ habitId: 'w', date: TODAY, status: 'done' }); // bv. oude data zonder waarde
  const { value } = await adjustCounter(repo, { habit: water(), date: TODAY, delta: 1 }, TODAY);
  assert.equal(value, 9);
});

// --- formulier en dagoverzicht ----------------------------------------------------------------------

test('applyHabitForm: teller wordt opgeschoond; zonder teller blijft het null', () => {
  const values = (counter) => ({
    name: 'Water', icon: '💧', color: 'c2', daypart: 'anytime', startDate: '2026-10-01',
    schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, counter,
  });
  const withCounter = applyHabitForm({ values: values({ unit: ' glazen ', target: 8 }), today: TODAY });
  assert.deepEqual(withCounter.counter, { unit: 'glazen', target: 8 });
  assert.equal(applyHabitForm({ values: values(null), today: TODAY }).counter, null);
  assert.deepEqual(applyHabitForm({ values: values({ unit: 'koppen', target: null }), today: TODAY }).counter, { unit: 'koppen', target: null });
});

test('het water-sjabloon levert een geldige habit op', () => {
  const template = TEMPLATES.water;
  const habit = applyHabitForm({
    values: { ...template, startDate: '2026-10-01', cue: '', why: '', minimalVersion: '' },
    today: TODAY,
  });
  assert.deepEqual(validateHabit(habit), []);
  assert.deepEqual(habit.counter, { unit: 'glazen', target: 8 });
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const built = applyHabitForm({ values: { ...t, startDate: '2026-10-01' }, today: TODAY });
    assert.deepEqual(validateHabit(built), [], key);
  }
});

test('dagoverzicht: waarde per dag, deels geteld is open en telt niet als gedaan', () => {
  const snapshot = {
    habits: [water({ startDate: '2026-10-01' })],
    checkIns: [
      { habitId: 'w', date: '2026-10-14', status: 'done', value: 8 },
      { habitId: 'w', date: TODAY, status: 'partial', value: 3 },
    ],
    pauses: [], dayPlans: [],
  };
  const today = buildDayView({ snapshot, date: TODAY, today: TODAY });
  const entry = today.groups[0].entries[0];
  assert.deepEqual([entry.valueToday, entry.loggedToday, entry.doneToday], [3, 'partial', false]);
  assert.deepEqual(today.progress, { done: 0, total: 1 });

  const yesterday = buildDayView({ snapshot, date: '2026-10-14', today: TODAY });
  assert.deepEqual([yesterday.groups[0].entries[0].valueToday, yesterday.progress], [8, { done: 1, total: 1 }]);

  const tomorrow = buildDayView({ snapshot, date: '2026-10-16', today: TODAY });
  assert.equal(tomorrow.groups[0].entries[0].valueToday, null); // een nieuwe dag begint op 0
});
