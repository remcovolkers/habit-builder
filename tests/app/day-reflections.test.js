// Hoe ging de dag (docs/DAGDEEL-EN-DAGREFLECTIE.md): een cijfer en een notitie per dag, de regels, Vandaag, de weekreview, de back-up en de sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearDayReflection, RuleError, saveDayReflection } from '../../src/app/actions.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { buildDayView } from '../../src/app/day-view.js';
import { buildWeekDays } from '../../src/app/reviews.js';
import { ValidationError } from '../../src/data/repository.js';
import { averageScore, reflectionsBetween, validateReflection } from '../../src/domain/reflections.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const YESTERDAY = '2026-10-14';

async function setup() {
  const { repo, store } = testRepo();
  await repo.saveHabit(validHabit());
  return { repo, store };
}
const view = async (repo, date = TODAY) => buildDayView({ snapshot: await repo.snapshot(), date, today: TODAY });

// --- de regels ----------------------------------------------------------------------------------------------------

test('een reflectie heeft een dag en een cijfer van 1 tot 5; de notitie is kort en optioneel', () => {
  assert.deepEqual(validateReflection({ date: TODAY, score: 3 }), []);
  assert.deepEqual(validateReflection({ date: TODAY, score: 5, note: 'Druk, maar goed' }), []);
  assert.deepEqual(validateReflection({ date: TODAY, score: 0 }).map((e) => e.field), ['score']);
  assert.deepEqual(validateReflection({ date: TODAY, score: 6 }).map((e) => e.field), ['score']);
  assert.deepEqual(validateReflection({ date: TODAY, score: 2.5 }).map((e) => e.field), ['score']);
  assert.deepEqual(validateReflection({ date: '2026-13-40', score: 3 }).map((e) => e.field), ['date']);
  assert.deepEqual(validateReflection({ date: TODAY, score: 3, note: 'x'.repeat(201) }), [{ field: 'note', code: 'too_long' }]);
  assert.deepEqual(validateReflection({ date: TODAY, score: 3, note: 7 }), [{ field: 'note', code: 'invalid' }]);
});

test('het gemiddelde en de dagen van een periode', () => {
  const list = [
    { date: '2026-10-14', score: 4 }, { date: '2026-10-12', score: 2 }, { date: '2026-10-20', score: 5 },
  ];
  assert.equal(averageScore([]), null);
  assert.equal(averageScore(list.slice(0, 2)), 3);
  assert.equal(averageScore(list), 3.7);
  assert.deepEqual(reflectionsBetween(list, '2026-10-12', '2026-10-18').map((r) => r.date), ['2026-10-12', '2026-10-14']);
});

// --- opslaan en terugdraaien --------------------------------------------------------------------------------------

test('de repository bewaart één reflectie per dag; opnieuw bewaren overschrijft, wissen verbergt', async () => {
  const { repo } = await setup();
  await repo.setDayReflection({ date: TODAY, score: 3, note: '  moe  ' });
  await repo.setDayReflection({ date: TODAY, score: 4, note: '' });
  const all = await repo.listDayReflections();
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].id, all[0].score, all[0].note], [TODAY, 4, null]);
  assert.equal((await repo.snapshot()).dayReflections.length, 1);
  await repo.clearDayReflection(TODAY);
  assert.deepEqual(await repo.listDayReflections(), []);
  await assert.rejects(repo.setDayReflection({ date: TODAY, score: 9 }), ValidationError);
});

test('saveDayReflection bewaart en is terug te draaien naar wat er eerst stond', async () => {
  const { repo } = await setup();
  const first = await saveDayReflection(repo, { date: TODAY, score: 2, note: 'Zwaar' }, TODAY);
  const second = await saveDayReflection(repo, { date: TODAY, score: 4, note: 'Beter' }, TODAY);
  assert.deepEqual((await repo.listDayReflections()).map((r) => [r.score, r.note]), [[4, 'Beter']]);
  await second.undo();
  assert.deepEqual((await repo.listDayReflections()).map((r) => [r.score, r.note]), [[2, 'Zwaar']]);
  await first.undo();
  assert.deepEqual(await repo.listDayReflections(), []);
});

test('clearDayReflection wist en de undo zet het terug; wissen zonder reflectie doet niets', async () => {
  const { repo } = await setup();
  assert.deepEqual(await (await clearDayReflection(repo, { date: TODAY }, TODAY)).undo(), undefined);
  await saveDayReflection(repo, { date: TODAY, score: 5, note: 'Top' }, TODAY);
  const { undo } = await clearDayReflection(repo, { date: TODAY }, TODAY);
  assert.deepEqual(await repo.listDayReflections(), []);
  await undo();
  assert.deepEqual((await repo.listDayReflections()).map((r) => [r.score, r.note]), [[5, 'Top']]);
});

test('invullen kan op de dag zelf en tot 14 dagen terug, niet in de toekomst of te lang geleden', async () => {
  const { repo } = await setup();
  await saveDayReflection(repo, { date: '2026-10-01', score: 3 }, TODAY);
  await assert.rejects(saveDayReflection(repo, { date: '2026-09-30', score: 3 }, TODAY), (e) => e instanceof RuleError && e.code === 'backfill_window');
  await assert.rejects(saveDayReflection(repo, { date: '2026-10-16', score: 3 }, TODAY), (e) => e instanceof RuleError && e.code === 'backfill_window');
  await assert.rejects(saveDayReflection(repo, { date: TODAY, score: 7 }, TODAY), (e) => e instanceof RuleError && e.code === 'reflection_invalid');
});

// --- Vandaag en de weekreview ---------------------------------------------------------------------------------------

test('Vandaag kent de reflectie van de dag en weet of je hem nog mag invullen', async () => {
  const { repo } = await setup();
  await saveDayReflection(repo, { date: YESTERDAY, score: 4, note: 'Goed' }, TODAY);
  const today = await view(repo);
  assert.equal(today.reflection, null);
  assert.equal(today.canReflect, true);
  const yesterday = await view(repo, YESTERDAY);
  assert.deepEqual([yesterday.reflection.score, yesterday.reflection.note], [4, 'Goed']);
  assert.equal(yesterday.canReflect, true);
  assert.equal((await view(repo, '2026-10-16')).canReflect, false, 'een dag in de toekomst kun je nog niet beoordelen');
  assert.equal((await view(repo, '2026-09-20')).canReflect, false, 'te lang geleden');
});

test('de weekreview toont de dagen van die week met het gemiddelde', async () => {
  const { repo } = await setup();
  await saveDayReflection(repo, { date: '2026-10-12', score: 2, note: 'Moe' }, TODAY);
  await saveDayReflection(repo, { date: TODAY, score: 4 }, TODAY);
  await saveDayReflection(repo, { date: '2026-10-05', score: 5 }, TODAY); // vorige week
  const snapshot = await repo.snapshot();
  const week = buildWeekDays({ snapshot, start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(week.days.map((d) => d.date), ['2026-10-12', TODAY]);
  assert.equal(week.average, 3);
  assert.deepEqual(buildWeekDays({ snapshot, start: '2026-10-19', end: '2026-10-25' }), { days: [], average: null });
});

// --- back-up en sync ----------------------------------------------------------------------------------------------

test('een reflectie staat in de back-up en komt na terugzetten terug; de teller en punten veranderen er niet door', async () => {
  const { repo } = await setup();
  await saveDayReflection(repo, { date: TODAY, score: 3, note: 'Gewoon' }, TODAY);
  const exported = buildExport(await repo.snapshot());
  assert.deepEqual(exported.data.dayReflections.map((r) => [r.date, r.score, r.note]), [[TODAY, 3, 'Gewoon']]);
  const parsed = parseImport(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.warnings.length, 0);
  const { repo: other } = testRepo();
  await other.replaceAll(parsed.data);
  assert.deepEqual((await other.listDayReflections()).map((r) => r.score), [3]);
  assert.deepEqual((await view(repo)).progress, { done: 0, total: 1 });
});

test('een back-up met een ongeldige reflectie neemt die niet over', () => {
  const backup = (record) => JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: [], dayReflections: [record] } });
  assert.equal(parseImport(backup({ id: TODAY, date: TODAY, score: 3, note: null })).data.dayReflections.length, 1);
  assert.equal(parseImport(backup({ id: TODAY, date: TODAY, score: 8, note: null })).data.dayReflections.length, 0);
  assert.equal(parseImport(backup({ id: 'x', date: TODAY, score: 3, note: null })).data.dayReflections.length, 0);
});

test('een reflectie gaat via de outbox naar de server', async () => {
  const { repo, store } = await setup();
  await saveDayReflection(repo, { date: TODAY, score: 3 }, TODAY);
  assert.ok((await store.getAll('outbox')).some((entry) => entry.collection === 'dayReflections' && entry.recordId === TODAY));
});
