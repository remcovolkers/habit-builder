// Een taak voor één dag naar een ander dagdeel zetten (docs/DAGDEEL-EN-DAGREFLECTIE.md): de regels, opslaan en terugdraaien, de kaarten op Vandaag,
// de back-up en de sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveToDaypart, planHabit, RuleError, unplanHabit } from '../../src/app/actions.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { buildDayView } from '../../src/app/day-view.js';
import { ValidationError } from '../../src/data/repository.js';
import { dayMoveId, effectiveDaypart, moveTargets, movesOn, validateDayMove } from '../../src/domain/daymoves.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const TOMORROW = '2026-10-16';
const teeth = (over = {}) => validHabit({ id: 't', name: 'Tandenpoetsen', daypart: 'morning', dayparts: ['morning', 'evening'], ...over });
const walk = (over = {}) => validHabit({ id: 'w', name: 'Wandelen', daypart: 'morning', ...over });
const where = (view, habitId) => view.groups.filter((g) => g.entries.some((e) => e.habitId === habitId)).map((g) => g.daypart);

async function withHabit(habit) {
  const { repo, store } = testRepo();
  const saved = await repo.saveHabit(habit);
  return { repo, store, habit: saved };
}
const view = async (repo, date = TODAY) => buildDayView({ snapshot: await repo.snapshot(), date, today: TODAY });

// --- de regels ----------------------------------------------------------------------------------------------------

test('een verplaatsing heeft een habit, een dag, een eigen dagdeel en een ander dagdeel', () => {
  assert.deepEqual(validateDayMove({ habitId: 'a', date: TODAY, from: 'morning', to: 'evening' }), []);
  assert.deepEqual(validateDayMove({ habitId: 'a', date: TODAY, from: 'morning', to: 'morning' }).map((e) => e.field), ['to'], 'naar het eigen dagdeel is terugzetten, geen verplaatsing');
  assert.deepEqual(validateDayMove({ habitId: 'a', date: TODAY, from: 'morning', to: 'nacht' }).map((e) => e.field), ['to']);
  assert.deepEqual(validateDayMove({ habitId: '', date: '2026-13-40', from: 'x', to: 'evening' }).map((e) => e.field), ['habitId', 'date', 'from']);
});

test('moveTargets: alle andere dagdelen, behalve waar al een ander dagdeel van dezelfde habit staat', () => {
  assert.deepEqual(moveTargets(walk(), 'morning', new Map()), ['afternoon', 'evening', 'anytime']);
  assert.deepEqual(moveTargets(teeth(), 'morning', new Map()), ['afternoon', 'anytime'], 'de avond heeft al een kaart van deze habit');
  // de avondkaart is naar de middag gegaan: nu is de avond vrij, en de middag bezet
  const moves = new Map([['t|evening', 'afternoon']]);
  assert.deepEqual(moveTargets(teeth(), 'morning', moves), ['evening', 'anytime']);
  assert.deepEqual(moveTargets(teeth(), 'evening', moves), ['morning', 'evening', 'anytime'].filter((d) => d !== 'morning'), 'terug naar de avond mag, de ochtend is bezet');
});

test('movesOn en effectiveDaypart: alleen de verplaatsingen van die dag', () => {
  const moves = movesOn([
    { habitId: 'a', date: TODAY, from: 'morning', to: 'evening' },
    { habitId: 'a', date: TOMORROW, from: 'morning', to: 'afternoon' },
  ], TODAY);
  assert.equal(effectiveDaypart(moves, 'a', 'morning'), 'evening');
  assert.equal(effectiveDaypart(moves, 'b', 'morning'), 'morning');
  assert.equal(effectiveDaypart(new Map(), 'a', 'morning'), 'morning');
});

// --- opslaan en terugdraaien --------------------------------------------------------------------------------------

test('de repository bewaart een verplaatsing per habit, dag en dagdeel en wist hem weer', async () => {
  const { repo, habit } = await withHabit(walk());
  const saved = await repo.setDayMove({ habitId: habit.id, date: TODAY, from: 'morning', to: 'evening' });
  assert.equal(saved.id, dayMoveId(habit.id, TODAY, 'morning'));
  await repo.setDayMove({ habitId: habit.id, date: TODAY, from: 'morning', to: 'afternoon' });
  assert.deepEqual((await repo.listDayMoves()).map((m) => m.to), ['afternoon'], 'opnieuw zetten overschrijft');
  assert.equal((await repo.snapshot()).dayMoves.length, 1);
  await repo.clearDayMove(habit.id, TODAY, 'morning');
  assert.deepEqual(await repo.listDayMoves(), []);
  await assert.rejects(repo.setDayMove({ habitId: habit.id, date: TODAY, from: 'morning', to: 'morning' }), ValidationError);
});

test('moveToDaypart zet de kaart voor die dag in een ander dagdeel en is terug te draaien', async () => {
  const { repo, habit } = await withHabit(walk());
  const { undo } = await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  assert.deepEqual(where(await view(repo), habit.id), ['evening']);
  await undo();
  assert.deepEqual(where(await view(repo), habit.id), ['morning']);
});

test('terug naar het eigen dagdeel haalt de verplaatsing weg, en de undo zet hem terug', async () => {
  const { repo, habit } = await withHabit(walk());
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  const { undo } = await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'morning' }, TODAY);
  assert.deepEqual(await repo.listDayMoves(), []);
  await undo();
  assert.deepEqual((await repo.listDayMoves()).map((m) => m.to), ['evening']);
});

test('een andere dag blijft zoals hij was: de verplaatsing geldt alleen voor die dag', async () => {
  const { repo, habit } = await withHabit(walk());
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  assert.deepEqual(where(await view(repo, TOMORROW), habit.id), ['morning']);
});

test('verplaatsen kan op de dag zelf, tot 14 dagen terug en op dagen die je kunt plannen; verder niet', async () => {
  const { repo, habit } = await withHabit(walk());
  const move = (date) => moveToDaypart(repo, { habit, date, part: 'morning', to: 'evening' }, TODAY);
  await move('2026-10-01'); // 14 dagen terug
  await move('2026-10-22'); // 7 dagen vooruit
  await assert.rejects(move('2026-09-30'), (e) => e instanceof RuleError && e.code === 'move_window');
  await assert.rejects(move('2026-10-23'), (e) => e instanceof RuleError && e.code === 'move_window');
});

test('naar een dagdeel waar al een ander dagdeel van dezelfde habit staat mag niet', async () => {
  const { repo, habit } = await withHabit(teeth());
  await assert.rejects(moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY), (e) => e instanceof RuleError && e.code === 'move_blocked');
  assert.deepEqual(await repo.listDayMoves(), []);
});

// --- de kaarten op Vandaag ----------------------------------------------------------------------------------------

test('de kaart staat in het nieuwe dagdeel, weet waar hij vandaan komt en waar hij heen mag', async () => {
  const { repo, habit } = await withHabit(walk());
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  const day = await view(repo);
  const card = day.groups.find((g) => g.daypart === 'evening').entries[0];
  assert.equal(card.moved, true);
  assert.equal(card.fromDaypart, 'morning');
  assert.equal(card.daypart, 'evening');
  assert.deepEqual(card.moveTargets, ['morning', 'afternoon', 'anytime']);
  assert.equal(day.groups.some((g) => g.daypart === 'morning'), false, 'het oude dagdeel is leeg en verdwijnt');
  assert.equal(day.canMove, true);
});

test('een kaart die niet is verplaatst weet dat ook, en de teller blijft kloppen', async () => {
  const { repo, habit } = await withHabit(walk());
  const card = (await view(repo)).groups[0].entries[0];
  assert.equal(card.moved, false);
  assert.equal(card.fromDaypart, 'morning');
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'afternoon' }, TODAY);
  await repo.setCheckIn({ habitId: habit.id, date: TODAY, status: 'done' });
  assert.deepEqual((await view(repo)).progress, { done: 1, total: 1 });
});

test('een habit met meerdere dagdelen: één kaart gaat mee, het vinkje blijft bij zijn eigen dagdeel', async () => {
  const { repo, habit } = await withHabit(teeth());
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'afternoon' }, TODAY);
  await repo.setCheckIn({ habitId: habit.id, date: TODAY, status: 'partial', parts: ['morning'] });
  const day = await view(repo);
  assert.deepEqual(day.groups.map((g) => g.daypart), ['afternoon', 'evening']);
  const moved = day.groups[0].entries[0];
  assert.equal(moved.part, 'morning', 'het vinkje hoort nog bij de ochtend');
  assert.equal(moved.partDone, true);
  assert.equal(moved.moved, true);
  assert.equal(day.groups[1].entries[0].part, 'evening');
  assert.equal(day.groups[1].entries[0].moved, false);
});

test('een vrij in te plannen taak kan na het inplannen worden verplaatst, en gaat bij "terug naar de stapel" weer naar zijn eigen dagdeel', async () => {
  const { repo, habit } = await withHabit(walk({
    schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period: 'week', count: 2 } }],
  }));
  await planHabit(repo, { habitId: habit.id, date: TODAY }, TODAY);
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  assert.deepEqual(where(await view(repo), habit.id), ['evening']);

  const { undo } = await unplanHabit(repo, { habitId: habit.id, date: TODAY });
  assert.deepEqual(await repo.listDayMoves(), [], 'de verplaatsing gaat mee weg');
  assert.deepEqual(where(await view(repo), habit.id), [], 'terug in de stapel');
  await undo();
  assert.deepEqual(where(await view(repo), habit.id), ['evening'], 'de undo zet plan en verplaatsing terug');
});

test('een verplaatsing van een dagdeel dat de habit niet meer heeft doet niets', async () => {
  const { repo, habit } = await withHabit(walk({ daypart: 'afternoon' }));
  await repo.setDayMove({ habitId: habit.id, date: TODAY, from: 'morning', to: 'evening' });
  assert.deepEqual(where(await view(repo), habit.id), ['afternoon']);
});

// --- back-up en sync ----------------------------------------------------------------------------------------------

test('een verplaatsing staat in de back-up en komt na terugzetten terug', async () => {
  const { repo, habit } = await withHabit(walk());
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  const exported = buildExport(await repo.snapshot());
  assert.equal(exported.data.dayMoves.length, 1);
  const parsed = parseImport(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.warnings.length, 0);
  const { repo: other } = testRepo();
  await other.replaceAll(parsed.data);
  assert.deepEqual((await other.listDayMoves()).map((m) => [m.date, m.from, m.to]), [[TODAY, 'morning', 'evening']]);
});

test('een back-up met een ongeldige of verweesde verplaatsing neemt die niet over', () => {
  const habitRecord = { ...validHabit(), id: 'w' };
  const backup = (record) => JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: [habitRecord], dayMoves: [record] } });
  const good = { id: dayMoveId('w', TODAY, 'morning'), habitId: 'w', date: TODAY, from: 'morning', to: 'evening' };
  assert.equal(parseImport(backup(good)).data.dayMoves.length, 1);
  assert.equal(parseImport(backup({ ...good, to: 'morning' })).data.dayMoves.length, 0);
  assert.equal(parseImport(backup({ ...good, id: 'ergens-anders' })).data.dayMoves.length, 0);
  assert.equal(parseImport(backup({ ...good, habitId: 'onbekend', id: dayMoveId('onbekend', TODAY, 'morning') })).data.dayMoves.length, 0);
});

test('een verplaatsing gaat via de outbox naar de server', async () => {
  const { repo, store, habit } = await withHabit(walk());
  await moveToDaypart(repo, { habit, date: TODAY, part: 'morning', to: 'evening' }, TODAY);
  assert.ok((await store.getAll('outbox')).some((entry) => entry.collection === 'dayMoves' && entry.recordId === dayMoveId(habit.id, TODAY, 'morning')));
});
