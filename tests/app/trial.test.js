// De proef "zonder app" en de cijfers met "wat hielp": de handelingen en wat de rest van de app ervan merkt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerTrial, cancelTrial, rateAutomaticity, rateCues, RuleError, startTrial } from '../../src/app/actions.js';
import { buildDayView } from '../../src/app/day-view.js';
import { buildWeekPlan } from '../../src/app/week-plan.js';
import { buildReminderSummary } from '../../src/app/reminder.js';
import { buildHabitDetail } from '../../src/app/habit-detail.js';
import { attentionFor } from '../../src/domain/attention.js';
import { ValidationError } from '../../src/data/repository.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const NOW = `${TODAY}T09:00`;
const weekly = { type: 'times_per_period', period: 'week', count: 2 };
const monthly = { type: 'times_per_period', period: 'month', count: 2 };

async function setup({ schedule = weekly, scores = [3, 4] } = {}) {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit({ name: 'Tuin', startDate: '2026-09-01', schedules: [{ effectiveFrom: '2026-09-01', schedule }] }));
  const weeks = ['2026-10-05', '2026-10-12'];
  for (const [i, score] of scores.entries()) await repo.setRating({ habitId: habit.id, weekStart: weeks[i], score });
  return { repo, habit };
}

const dayView = async (repo, date, today = date) => buildDayView({ snapshot: await repo.snapshot(), date, today });

test('rateAutomaticity bewaart wat er hielp, en een nieuw cijfer laat dat staan', async () => {
  const { repo } = testRepo();
  await rateAutomaticity(repo, { habitId: 'h', score: 3, cues: ['reminder', 'routine'] }, TODAY);
  await rateAutomaticity(repo, { habitId: 'h', score: 4 }, TODAY);
  const [rating] = await repo.listRatings('h');
  assert.deepEqual([rating.score, rating.cues], [4, ['reminder', 'routine']]);
  await rateCues(repo, { habitId: 'h', cues: ['nothing', 'reminder'] }, TODAY);
  assert.deepEqual((await repo.listRatings('h'))[0].cues, ['nothing'], 'onzin wordt opgeruimd: "niets" staat alleen');
  await rateCues(repo, { habitId: 'h', cues: [] }, TODAY);
  assert.equal('cues' in (await repo.listRatings('h'))[0], false, 'leeg betekent geen antwoord');
});

test('wat hielp moet bij een cijfer van deze week horen en geldig zijn', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => rateCues(repo, { habitId: 'h', cues: ['routine'] }, TODAY), (e) => e instanceof RuleError && e.code === 'not_rated');
  await assert.rejects(() => repo.setRating({ habitId: 'h', weekStart: '2026-10-12', score: 3, cues: ['magic'] }), ValidationError);
  await assert.rejects(() => repo.setRating({ habitId: 'h', weekStart: '2026-10-12', score: 3, cues: 'routine' }), ValidationError);
});

test('startTrial: de eerstvolgende hele week, en wat daarvoor was ingepland vervalt', async () => {
  const { repo, habit } = await setup();
  await repo.setDayPlan({ habitId: habit.id, date: '2026-10-20' });
  await repo.setDayPlan({ habitId: habit.id, date: '2026-10-17' }); // nog deze week: blijft
  const saved = await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  assert.deepEqual(saved.trials, [{ period: 'week', start: '2026-10-19', end: '2026-10-25', result: null, answeredOn: null }]);
  assert.deepEqual((await repo.listDayPlans()).map((p) => p.date), ['2026-10-17']);
});

test('startTrial: alleen als het kan (cijfers, flexibel, nog geen proef)', async () => {
  const low = await setup({ scores: [2, 4] });
  await assert.rejects(() => startTrial(low.repo, { habitId: low.habit.id }, TODAY, NOW), (e) => e instanceof RuleError && e.code === 'trial_scores');
  const fixed = await setup({ schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } });
  await assert.rejects(() => startTrial(fixed.repo, { habitId: fixed.habit.id }, TODAY, NOW), (e) => e.code === 'trial_not_flexible');
  const { repo, habit } = await setup();
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  await assert.rejects(() => startTrial(repo, { habitId: habit.id }, TODAY, NOW), (e) => e.code === 'trial_busy');
  await assert.rejects(() => startTrial(repo, { habitId: 'bestaat-niet' }, TODAY, NOW), RuleError);
});

test('een proef per maand begint op de eerste van de volgende maand', async () => {
  const { repo, habit } = await setup({ schedule: monthly });
  const saved = await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  assert.deepEqual([saved.trials[0].period, saved.trials[0].start, saved.trials[0].end], ['month', '2026-11-01', '2026-11-30']);
});

test('cancelTrial stopt een proef zonder wachttijd', async () => {
  const { repo, habit } = await setup();
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  const saved = await cancelTrial(repo, { habitId: habit.id }, TODAY, NOW);
  assert.deepEqual(saved.trials, []);
  assert.equal(await cancelTrial(repo, { habitId: habit.id }, TODAY, NOW), null, 'er is niets meer om te stoppen');
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW); // meteen opnieuw kan
});

test('in een proef staat de taak niet op Vandaag, niet in de stapel, niet in de herinnering en niet in Plan je week', async () => {
  const { repo, habit } = await setup();
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  const during = '2026-10-21';

  const before = await dayView(repo, '2026-10-16', TODAY);
  assert.equal(before.pool.length, 1, 'vóór de proef staat hij gewoon in de stapel');
  const view = await dayView(repo, during, during);
  assert.deepEqual([view.pool.length, view.groups.length], [0, 0]);
  assert.equal((await dayView(repo, '2026-10-26', '2026-10-26')).pool.length, 1, 'na de proef is hij terug');

  const snapshot = await repo.snapshot();
  assert.equal(buildWeekPlan({ snapshot, today: during }).length, 0);
  assert.equal(buildWeekPlan({ snapshot, today: TODAY }).length, 1);
  const summary = buildReminderSummary({ snapshot, today: during, settings: { displayName: '' }, days: 1 });
  assert.deepEqual(summary.days[during].slice(0, 2), [0, 0], 'geen herinnering voor deze taak');
});

test('in een proef komt er geen aandachtssignaal voor de taak', async () => {
  const { repo, habit } = await setup();
  const before = (await repo.snapshot()).habits[0];
  const quiet = '2026-10-25'; // zondag: de laatste dag van de week, nog niets gedaan
  assert.ok(attentionFor({ habit: before, today: quiet }).length > 0, 'zonder proef wijst de app erop');
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  const inTrial = (await repo.snapshot()).habits[0];
  assert.deepEqual(attentionFor({ habit: inTrial, today: quiet }), []);
});

test('answerTrial: gelukt kan alleen als de taak in de periode is gedaan, en alleen in de review', async () => {
  const { repo, habit } = await setup();
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  const friday = '2026-10-23';
  const answer = (passed, today = friday, now = `${today}T10:00`) => answerTrial(repo, { habitId: habit.id, start: '2026-10-19', passed }, today, now);

  await assert.rejects(() => answer(true, '2026-10-21'), (e) => e instanceof RuleError && e.code === 'trial_closed'); // de review is nog dicht
  await assert.rejects(() => answer(true), (e) => e instanceof RuleError && e.code === 'trial_not_done'); // niet afgevinkt
  await repo.setCheckIn({ habitId: habit.id, date: '2026-10-22', status: 'done' });
  const saved = await answer(true);
  assert.deepEqual([saved.trials[0].result, saved.trials[0].answeredOn], ['passed', friday]);
  await assert.rejects(() => answer(false), (e) => e.code === 'trial_closed', 'een beantwoorde proef is klaar');
});

test('answerTrial: mislukt mag ook zonder afvinken, de app helpt weer en de wachttijd loopt', async () => {
  const { repo, habit } = await setup();
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  const friday = '2026-10-23';
  const saved = await answerTrial(repo, { habitId: habit.id, start: '2026-10-19', passed: false }, friday, `${friday}T10:00`);
  assert.equal(saved.trials[0].result, 'failed');

  // meteen weer de gewone stapel (ook de rest van die week)
  assert.equal((await dayView(repo, '2026-10-24', '2026-10-24')).pool.length, 1);
  // en een nieuwe proef kan pas na de wachttijd: 4 hele weken na het eind van de proef
  await assert.rejects(() => startTrial(repo, { habitId: habit.id }, '2026-11-22', '2026-11-22T09:00'), (e) => e.code === 'trial_cooldown');
  const again = await startTrial(repo, { habitId: habit.id }, '2026-11-23', '2026-11-23T09:00');
  assert.equal(again.trials.length, 2);
  assert.equal(again.trials[1].start, '2026-11-23', 'de eerste dag van de week is vandaag: de proef begint meteen');
});

test('answerTrial: na het sluiten van de review kan het niet meer (de proef verloopt, zonder wachttijd)', async () => {
  const { repo, habit } = await setup();
  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  await assert.rejects(() => answerTrial(repo, { habitId: habit.id, start: '2026-10-19', passed: false }, '2026-10-26', '2026-10-26T12:00'), (e) => e.code === 'trial_closed');
  const next = await startTrial(repo, { habitId: habit.id }, '2026-10-27', '2026-10-27T09:00');
  assert.equal(next.trials.length, 2, 'verlopen zonder antwoord: meteen opnieuw kan');
});

test('de detailpagina zegt wat er met de proef is en telt een geslaagde proef mee voor ingeburgerd', async () => {
  const { repo, habit } = await setup();
  const detail = async (today = TODAY, now = NOW) => {
    const snapshot = await repo.snapshot();
    return buildHabitDetail({ habit: snapshot.habits[0], snapshot, today, now });
  };
  assert.equal((await detail()).trial.offer.state, 'available');
  assert.equal((await detail()).level, 'almost');
  assert.equal((await detail()).advice, 'once');

  await startTrial(repo, { habitId: habit.id }, TODAY, NOW);
  const running = await detail('2026-10-21', '2026-10-21T09:00');
  assert.deepEqual([running.trial.offer.state, running.trial.current.status, running.trial.current.done], ['busy', 'running', 0]);
  await repo.setCheckIn({ habitId: habit.id, date: '2026-10-21', status: 'done' });
  assert.equal((await detail('2026-10-23', '2026-10-23T09:00')).trial.current.status, 'answer');
  assert.equal((await detail('2026-10-23', '2026-10-23T09:00')).trial.current.done, 1);
  await answerTrial(repo, { habitId: habit.id, start: '2026-10-19', passed: true }, '2026-10-23', '2026-10-23T09:00');
  const after = await detail('2026-10-30', '2026-10-30T09:00');
  assert.equal(after.trial.passed, true);
  assert.equal(after.trial.current, null);
});
