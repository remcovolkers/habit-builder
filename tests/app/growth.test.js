import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeGoal, removeGoal, setGoal, takeStep } from '../../src/app/growth.js';
import { graduateHabit, RuleError } from '../../src/app/actions.js';
import { buildHabitDetail } from '../../src/app/habit-detail.js';
import { ValidationError } from '../../src/data/repository.js';
import { addDays } from '../../src/domain/dates.js';
import { scheduleAt } from '../../src/domain/schedule.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const weekly = (count) => ({ type: 'times_per_period', period: 'week', count });
const snapshotOf = async (repo) => repo.snapshot();

/** Een habit "2× per week" met 5 weken vinkjes (10 keer), zodat de nudge klaar staat. */
async function sportHabit(repo, { count = 2, weeks = 5, days = [0, 2] } = {}) {
  const habit = await repo.saveHabit(validHabit({ name: 'Sporten', startDate: '2026-09-07', schedules: [{ effectiveFrom: '2026-09-07', schedule: weekly(count) }] }));
  for (let w = 0; w < weeks; w += 1) for (const d of days) await repo.setCheckIn({ habitId: habit.id, date: addDays('2026-09-07', w * 7 + d), status: 'done' });
  return habit;
}

test('setGoal: een frequentiedoel op een habit met N× per week; de trede begint vandaag, zonder tegoed en logboek', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo);
  const { habit: saved, undo } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, TODAY);
  assert.deepEqual([saved.goal.kind, saved.goal.stepStart, saved.goal.credit, saved.goal.log, saved.goal.completedOn], ['frequency', TODAY, 0, [], null]);
  assert.deepEqual((await repo.getHabit(habit.id)).goal.ideal, { schedule: weekly(4) });
  await undo();
  assert.equal((await repo.getHabit(habit.id)).goal, undefined);
});

test('setGoal: vaste weekdagen kunnen geen frequentiedoel hebben, een hoeveelheid vraagt een teller, en alleen een lopende habit', async () => {
  const { repo } = testRepo();
  const fixed = await repo.saveHabit(validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }] }));
  await assert.rejects(() => setGoal(repo, { habit: fixed, kind: 'frequency', ideal: { schedule: weekly(4) } }, TODAY), ValidationError);
  await assert.rejects(() => setGoal(repo, { habit: fixed, kind: 'quantity', ideal: { target: 2000 } }, TODAY), ValidationError);
  const archived = { ...fixed, status: 'archived' };
  await assert.rejects(() => setGoal(repo, { habit: archived, kind: 'text', ideal: { text: 'een uur lezen' }, stepText: 'een kwartier lezen' }, TODAY), (e) => e instanceof RuleError && e.code === 'not_active');
});

test('takeStep omhoog: een nieuw ritme vanaf vandaag, de oude versie blijft, de boost is de helft van de keren (hoogstens de helft van de nieuwe drempel)', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo);
  const { habit: withGoal } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, '2026-09-07');
  const checkIns = (await snapshotOf(repo)).checkIns;
  const { habit: stepped, undo } = await takeStep(repo, { habit: withGoal, choice: 'up', to: 3, note: 'ging goed' }, TODAY, checkIns);

  assert.deepEqual(stepped.schedules.map((v) => [v.effectiveFrom, v.schedule.count]), [['2026-09-07', 2], [TODAY, 3]], 'het oude ritme blijft in de geschiedenis');
  assert.equal(scheduleAt(stepped.schedules, '2026-10-01').count, 2);
  // 10 keren op de vorige trede: de helft is 5; drempel van 3× per week is 12, de helft 6: dus 5
  assert.equal(stepped.goal.credit, 5);
  assert.equal(stepped.goal.stepStart, TODAY);
  assert.equal(stepped.goal.snoozedAt, null);
  assert.deepEqual(stepped.goal.log, [{ date: TODAY, choice: 'up', from: '2× per week', to: '3× per week', note: 'ging goed' }]);

  await undo();
  assert.deepEqual((await repo.getHabit(habit.id)).schedules.map((v) => v.schedule.count), [2]);
  assert.equal((await repo.getHabit(habit.id)).goal.log.length, 0);
});

test('takeStep: alleen omhoog tot het ideaal, alleen omlaag tot 1, en niet naar dezelfde trede', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo);
  const { habit: g } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, '2026-09-07');
  const reject = (args) => assert.rejects(() => takeStep(repo, { habit: g, ...args }, TODAY, []), (e) => e instanceof RuleError && e.code === 'step_invalid');
  await reject({ choice: 'up', to: 2 });
  await reject({ choice: 'up', to: 5 });
  await reject({ choice: 'up', to: 'veel' });
  await reject({ choice: 'down', to: 2 });
  await reject({ choice: 'down', to: 0 });
  await reject({ choice: 'sideways', to: 3 });
  assert.deepEqual((await takeStep(repo, { habit: g, choice: 'down', to: 1 }, TODAY, [])).habit.schedules.at(-1).schedule.count, 1, 'terug naar 1× mag');
  const plain = await repo.saveHabit(validHabit({ name: 'Zonder doel' }));
  await assert.rejects(() => takeStep(repo, { habit: plain, choice: 'stay' }, TODAY, []), (e) => e instanceof RuleError && e.code === 'not_growing');
});

test('takeStep stay: de nudge zwijgt een tijd en het besluit staat in het logboek', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo);
  const { habit: g } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, '2026-09-07');
  const checkIns = (await snapshotOf(repo)).checkIns;
  const { habit: stayed } = await takeStep(repo, { habit: g, choice: 'stay' }, TODAY, checkIns);
  assert.deepEqual(stayed.goal.snoozedAt, { date: TODAY, reps: 10 });
  assert.deepEqual(stayed.schedules.map((v) => v.schedule.count), [2], 'het ritme verandert niet');
  assert.equal(stayed.goal.stepStart, '2026-09-07', 'en de trede ook niet');
  const detail = buildHabitDetail({ habit: stayed, snapshot: await snapshotOf(repo), today: TODAY });
  assert.equal(detail.growth.nudge.state, 'snoozed');
});

test('takeStep bij een hoeveelheid: het tellerdoel gaat omhoog (2 liter in ml), de oude check-ins blijven', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit({ name: 'Water', startDate: '2026-09-07', counter: { unit: 'ml', target: 500 }, schedules: [{ effectiveFrom: '2026-09-07', schedule: daily }] }));
  await repo.setCheckIn({ habitId: habit.id, date: '2026-10-10', status: 'done', value: 500 });
  const { habit: g } = await setGoal(repo, { habit, kind: 'quantity', ideal: { target: 2000 } }, '2026-09-07');
  const { habit: up } = await takeStep(repo, { habit: g, choice: 'up', to: 750 }, TODAY, (await snapshotOf(repo)).checkIns);
  assert.equal(up.counter.target, 750);
  assert.equal(up.counter.unit, 'ml');
  assert.deepEqual(up.goal.log.at(-1), { date: TODAY, choice: 'up', from: '500 ml', to: '750 ml' });
  assert.equal((await repo.getCheckIn(habit.id, '2026-10-10')).status, 'done', 'wat gedaan was blijft gedaan');
  await assert.rejects(() => takeStep(repo, { habit: up, choice: 'up', to: 2500 }, TODAY, []), RuleError, 'niet boven het ideaal');
});

test('takeStep bij een tekstdoel: jij typt de volgende trede; "meer lezen" is geen trede maar een concrete tekst is het wel', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit({ name: 'Lezen', startDate: '2026-09-07', schedules: [{ effectiveFrom: '2026-09-07', schedule: daily }] }));
  const { habit: g } = await setGoal(repo, { habit, kind: 'text', ideal: { text: 'een uur lezen' }, stepText: 'een kwartier lezen' }, '2026-09-07');
  assert.equal(g.goal.stepText, 'een kwartier lezen');
  const { habit: up } = await takeStep(repo, { habit: g, choice: 'up', to: '30 minuten lezen' }, TODAY, []);
  assert.equal(up.goal.stepText, '30 minuten lezen');
  assert.deepEqual(up.goal.log.at(-1), { date: TODAY, choice: 'up', from: 'een kwartier lezen', to: '30 minuten lezen' });
  await assert.rejects(() => takeStep(repo, { habit: up, choice: 'up', to: '  ' }, TODAY, []), RuleError);
  await assert.rejects(() => takeStep(repo, { habit: up, choice: 'up', to: '30 minuten lezen' }, TODAY, []), RuleError, 'dezelfde trede is geen stap');
});

test('een habit die uitbouwt wordt niet ingeburgerd, ook niet als alle criteria halen; Uitgebouwd maakt het weer kan', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo, { count: 4, weeks: 5, days: [0, 1, 3, 5] });
  const { habit: g } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, '2026-09-07');
  const snapshot = await snapshotOf(repo);
  const detail = buildHabitDetail({ habit: g, snapshot, today: TODAY });
  assert.equal(detail.canGraduate, false);
  assert.equal(detail.growth.growing, true);
  assert.equal(detail.growth.nudge.state, 'ready');
  await assert.rejects(() => graduateHabit(repo, g, TODAY), (e) => e instanceof RuleError && e.code === 'growing');

  // afronden kan alleen als het ideaal is bereikt en het erin zit
  const below = await sportHabit(repo, { count: 2 });
  const { habit: g2 } = await setGoal(repo, { habit: below, kind: 'frequency', ideal: { schedule: weekly(4) } }, '2026-09-07');
  await assert.rejects(() => completeGoal(repo, { habit: g2 }, TODAY, snapshot.checkIns), (e) => e instanceof RuleError && e.code === 'not_ready');

  const { habit: done, undo } = await completeGoal(repo, { habit: g, units: detail.stats.units }, TODAY, snapshot.checkIns);
  assert.equal(done.goal.completedOn, TODAY);
  assert.equal(buildHabitDetail({ habit: done, snapshot, today: TODAY }).growth.growing, false);
  assert.equal((await graduateHabit(repo, done, TODAY)).status, 'graduated', 'daarna kan hij ingeburgerd worden');
  await undo();
});

test('removeGoal: de habit blijft zoals hij is, zonder doel', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo);
  const { habit: g } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, TODAY);
  const { habit: plain, undo } = await removeGoal(repo, { habit: g });
  assert.equal('goal' in plain, false);
  assert.deepEqual((await repo.getHabit(habit.id)).schedules.map((v) => v.schedule.count), [2]);
  await undo();
  assert.equal((await repo.getHabit(habit.id)).goal.kind, 'frequency');
});

test('een oudere app slaat een habit op zonder het doel te verliezen: het record wordt gespreid, onbekende velden blijven', async () => {
  const { repo } = testRepo();
  const habit = await sportHabit(repo);
  const { habit: g } = await setGoal(repo, { habit, kind: 'frequency', ideal: { schedule: weekly(4) } }, TODAY);
  const fromOldApp = { ...(await repo.getHabit(habit.id)), name: 'Sporten (hernoemd)' }; // wat een app zonder kennis van `goal` doet: het record meegeven met een andere naam
  await repo.saveHabit(fromOldApp);
  assert.deepEqual((await repo.getHabit(habit.id)).goal, g.goal);
});
