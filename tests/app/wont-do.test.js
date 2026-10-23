import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttention } from '../../src/app/attention.js';
import { clearCheckIn, declineHabit, logCheckIn, RuleError } from '../../src/app/actions.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { buildDayView, isSetAside } from '../../src/app/day-view.js';
import { buildScoreSummary } from '../../src/app/score.js';
import { ValidationError } from '../../src/data/repository.js';
import { wontSpan } from '../../src/domain/attention.js';
import { buildHeatmap } from '../../src/domain/heatmap.js';
import { computeUnits } from '../../src/domain/units.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

// 2026-10-12 is een maandag, TODAY (2026-10-15) een donderdag; de week loopt t/m zondag 2026-10-18.
const perWeek = (count) => ({ type: 'times_per_period', period: 'week', count });
const onDay = (day) => ({ type: 'day_of_month', day });
const habitWith = (schedule, over = {}) => validHabit({ startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule }], ...over });
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ratings: [], reasons: [], ...over });
const unitsOf = (habit, checkIns, today = TODAY) => computeUnits({ habit: { ...habit, id: 'h1' }, checkIns, pauses: [], today });

// --- de rekenlaag: "ga ik niet doen" telt als gemist ------------------------------------------------------------

test('een dag die je opgeeft is meteen gemist, ook vandaag', () => {
  const units = unitsOf(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }), [{ date: TODAY, status: 'wont' }]);
  assert.equal(units.at(-1).start, TODAY);
  assert.equal(units.at(-1).status, 'missed'); // zonder 'wont' was het 'open'
});

test('een week- of maandtaak die je opgeeft is gemist voor de héle periode, ook als die nog loopt', () => {
  const [week] = unitsOf(habitWith(perWeek(3), { startDate: '2026-10-12' }), [{ date: TODAY, status: 'done' }, { date: '2026-10-14', status: 'wont' }]);
  assert.deepEqual([week.status, week.count, week.givenUp, week.givenUpOn, week.remainingDays], ['missed', 1, true, '2026-10-14', 0]);
  const [month] = unitsOf(habitWith(onDay(10), { startDate: '2026-10-01' }), [{ date: TODAY, status: 'wont' }]);
  assert.deepEqual([month.status, month.givenUp], ['missed', true]);
});

test('is de week ondanks "ga ik niet doen" toch gehaald, dan is hij gedaan', () => {
  const [week] = unitsOf(habitWith(perWeek(1), { startDate: '2026-10-12' }), [{ date: '2026-10-13', status: 'wont' }, { date: TODAY, status: 'done' }]);
  assert.deepEqual([week.status, week.givenUp], ['done', false]);
});

test('de rest van een opgegeven week staat niet meer in de stapel, op de dag zelf wel (met de status)', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith(perWeek(3), { startDate: '2026-10-12' }));
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'no_time' }, TODAY);
  const snap = await repo.snapshot();
  const onDayItself = buildDayView({ snapshot: snap, date: TODAY, today: TODAY });
  assert.equal(onDayItself.groups.flatMap((g) => g.entries)[0].loggedToday, 'wont');
  assert.equal(onDayItself.pool.length, 0);
  const next = buildDayView({ snapshot: snap, date: '2026-10-16', today: '2026-10-16' });
  assert.deepEqual([next.groups.length, next.pool.length], [0, 0]);
  // de week erna begint gewoon weer
  const later = buildDayView({ snapshot: snap, date: '2026-10-19', today: '2026-10-19' });
  assert.equal(later.pool.length, 1);
});

test('de heatmap toont een opgegeven dag als gemist', () => {
  const habit = habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const { weeks } = buildHeatmap({ habit, checkIns: [{ date: TODAY, status: 'wont' }], pauses: [], today: TODAY });
  assert.equal(weeks.flat().find((cell) => cell.date === TODAY).state, 'missed');
});

// --- de handeling -------------------------------------------------------------------------------------------------

test('declineHabit zet de dag op "ga ik niet doen" en bewaart reden en plan bij dezelfde dag', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await logCheckIn(repo, { habitId: habit.id, date: TODAY, status: 'skipped', note: 'later' }, TODAY);
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'no_motivation', note: '  moe  ', plan: '  tien minuten, voor het eten  ' }, TODAY);

  const checkIn = await repo.getCheckIn(habit.id, TODAY);
  assert.deepEqual([checkIn.status, checkIn.note], ['wont', 'later']); // een notitie die er al stond blijft staan
  const [reason] = await repo.listReasons(habit.id);
  assert.deepEqual([reason.date, reason.reason, reason.note, reason.plan], [TODAY, 'no_motivation', 'moe', 'tien minuten, voor het eten']);
});

test('declineHabit: de reden is verplicht en het plan hoogstens 200 tekens; bij een fout verandert er niets', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await assert.rejects(() => declineHabit(repo, { habitId: habit.id, date: TODAY, reason: null }, TODAY), ValidationError);
  await assert.rejects(() => declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'other', plan: 'x'.repeat(201) }, TODAY), ValidationError);
  assert.equal(await repo.getCheckIn(habit.id, TODAY), null);
  assert.deepEqual(await repo.listReasons(), []);
});

test('declineHabit weigert een dag buiten de terugwerkende termijn en een onbekende taak', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await assert.rejects(() => declineHabit(repo, { habitId: habit.id, date: '2026-09-01', reason: 'other' }, TODAY), RuleError);
  await assert.rejects(() => declineHabit(repo, { habitId: 'bestaat-niet', date: TODAY, reason: 'other' }, TODAY), RuleError);
});

test('ongedaan maken zet de dag en de vorige reactie terug', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await logCheckIn(repo, { habitId: habit.id, date: TODAY, status: 'skipped' }, TODAY);
  await repo.setReason({ habitId: habit.id, date: TODAY, reason: 'forgot', note: 'eerder' });

  const { undo } = await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'no_time', plan: 'morgen eerder' }, TODAY);
  await undo();
  assert.equal((await repo.getCheckIn(habit.id, TODAY)).status, 'skipped');
  const [reason] = await repo.listReasons(habit.id);
  assert.deepEqual([reason.reason, reason.note, reason.plan], ['forgot', 'eerder', undefined]);

  const fresh = testRepo().repo;
  const other = await fresh.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  const { undo: undoNew } = await declineHabit(fresh, { habitId: other.id, date: TODAY, reason: 'no_time' }, TODAY);
  await undoNew();
  assert.equal(await fresh.getCheckIn(other.id, TODAY), null);
  assert.deepEqual(await fresh.listReasons(), []);
});

test('wissen haalt "ga ik niet doen" weg, met de reden en het plan; ongedaan maken zet ze terug', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'wrong_rhythm', plan: 'ritme verlagen' }, TODAY);
  const { undo } = await clearCheckIn(repo, { habitId: habit.id, date: TODAY }, TODAY);
  assert.equal(await repo.getCheckIn(habit.id, TODAY), null);
  assert.deepEqual(await repo.listReasons(), []);
  await undo();
  assert.equal((await repo.getCheckIn(habit.id, TODAY)).status, 'wont');
  assert.equal((await repo.listReasons())[0].plan, 'ritme verlagen');
});

test('een gewone check-in wissen laat een reden van die dag met rust', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await logCheckIn(repo, { habitId: habit.id, date: TODAY, status: 'done' }, TODAY);
  await repo.setReason({ habitId: habit.id, date: TODAY, reason: 'forgot' });
  await clearCheckIn(repo, { habitId: habit.id, date: TODAY }, TODAY);
  assert.equal((await repo.listReasons()).length, 1);
});

test('een taak die op die dag niets open heeft (geen geplande dag) bewaart alleen reden en plan', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0] })); // alleen maandag; TODAY is donderdag
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'other', note: 'te veel', plan: 'één dag minder' }, TODAY);
  assert.equal(await repo.getCheckIn(habit.id, TODAY), null);
  assert.equal((await repo.listReasons())[0].plan, 'één dag minder');
});

// --- Vandaag en de aandacht -----------------------------------------------------------------------------------------

test('een opgegeven taak staat met reden en plan op de kaart en telt niet meer mee in "x van y"', async () => {
  const { repo } = testRepo();
  const lezen = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, { name: 'Lezen' }));
  const rennen = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, { name: 'Rennen' }));
  await declineHabit(repo, { habitId: rennen.id, date: TODAY, reason: 'busy_sick', plan: 'korter rennen' }, TODAY);
  await logCheckIn(repo, { habitId: lezen.id, date: TODAY, status: 'done' }, TODAY);

  const view = buildDayView({ snapshot: await repo.snapshot(), date: TODAY, today: TODAY });
  const entries = view.groups.flatMap((g) => g.entries);
  const wont = entries.find((e) => e.habitId === rennen.id);
  assert.equal(isSetAside(wont), true);
  assert.deepEqual(wont.wontToday, { reason: 'busy_sick', note: null, plan: 'korter rennen' });
  assert.deepEqual(view.progress, { done: 1, total: 1 }); // "alles gedaan" kan dus weer
});

test('een opgegeven week beantwoordt zijn eigen signaal: in de lijst met reden en plan, niet als open vraag', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith(perWeek(3), { startDate: '2026-08-01' }));
  // de afgelopen weken gewoon gedaan, zodat alleen deze week opvalt
  for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) await logCheckIn(repo, { habitId: habit.id, date, status: 'done' }, '2026-10-12');
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'no_time', plan: 'maandag plannen' }, TODAY);

  const items = buildAttention({ snapshot: await repo.snapshot(), today: TODAY });
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].signal.kind, items[0].signal.detail.givenUp, items[0].handled, items[0].reason.plan], ['failed', true, true, 'maandag plannen']);
});

test('"ga ik niet doen" breekt de reeks, maar kost die dag zelf geen punten (een misser telt pas als de dag voorbij is)', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, { startDate: '2026-10-12' }));
  for (const date of ['2026-10-12', '2026-10-13', '2026-10-14']) await logCheckIn(repo, { habitId: habit.id, date, status: 'done' }, TODAY);
  const before = buildScoreSummary({ snapshot: await repo.snapshot(), today: TODAY });
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'other', note: 'x' }, TODAY);
  const after = buildScoreSummary({ snapshot: await repo.snapshot(), today: TODAY });
  assert.equal(after.points, before.points);
  assert.equal(after.lastActive, before.lastActive); // een opgegeven dag is geen activiteit
  assert.deepEqual([before.streak, after.streak], [3, 0]);
});

test('wontSpan: per dag, week of maand volgens het ritme', () => {
  assert.equal(wontSpan(habitWith({ type: 'weekdays', weekdays: [0] }), TODAY), 'day');
  assert.equal(wontSpan(habitWith(perWeek(2)), TODAY), 'week');
  assert.equal(wontSpan(habitWith({ type: 'times_per_period', period: 'month', count: 2 }), TODAY), 'month');
  assert.equal(wontSpan(habitWith(onDay(10)), TODAY), 'month');
});

// --- opslag: back-up en validatie ------------------------------------------------------------------------------------

test('een opgegeven dag en het plan gaan mee in de back-up; een te lang plan wordt weggelaten', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(habitWith({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  await declineHabit(repo, { habitId: habit.id, date: TODAY, reason: 'no_money', plan: 'goedkoper alternatief' }, TODAY);
  const exported = buildExport(await repo.snapshot());
  const parsed = parseImport(JSON.stringify(exported));
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.data.checkIns[0].status, 'wont');
  assert.equal(parsed.data.reasons[0].plan, 'goedkoper alternatief');

  const broken = structuredClone(exported);
  broken.data.reasons[0].plan = 'x'.repeat(201);
  const lenient = parseImport(JSON.stringify(broken));
  assert.equal(lenient.data.reasons.length, 0);
  assert.equal(lenient.warnings.length, 1);
});
