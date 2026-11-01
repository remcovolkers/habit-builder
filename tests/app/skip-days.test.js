import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logCheckIn, RuleError, skipDays, unskipDay } from '../../src/app/actions.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { buildDayView } from '../../src/app/day-view.js';
import { buildHabitDetail } from '../../src/app/habit-detail.js';
import { ValidationError } from '../../src/data/repository.js';
import { computeUnits } from '../../src/domain/units.js';
import { skipDayPauses, validateSkipDay } from '../../src/domain/skipdays.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

// TODAY (2026-10-15) is een donderdag; het vriendenweekend was za 2026-10-10 en zo 2026-10-11.
const WEEKEND = ['2026-10-10', '2026-10-11'];

async function withHabit(over = {}) {
  const { repo, store } = testRepo();
  const habit = await repo.saveHabit(validHabit(over));
  return { repo, store, habit };
}

// --- de regels ---------------------------------------------------------------------------------------------------

test('een reden is verplicht, en bij "Anders" ook de toelichting', () => {
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: 'away' }), []);
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: null }).map((e) => e.field), ['reason']);
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: 'sneeuw' }).map((e) => e.field), ['reason']);
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: 'other' }), [{ field: 'note', code: 'required' }]);
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: 'other', note: '   ' }), [{ field: 'note', code: 'required' }]);
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: 'other', note: 'Bruiloft' }), []);
  assert.deepEqual(validateSkipDay({ date: TODAY, reason: 'away', note: 'x'.repeat(201) }), [{ field: 'note', code: 'too_long' }]);
  assert.deepEqual(validateSkipDay({ date: '2026-13-40', reason: 'away' }).map((e) => e.field), ['date']);
});

test('opeenvolgende dagen worden één afgeleide pauze, voor elke habit', () => {
  const pauses = skipDayPauses([{ id: 'a' }, { id: 'b' }], [{ date: '2026-10-11' }, { date: '2026-10-10' }, { date: '2026-10-14' }]);
  assert.deepEqual(pauses.filter((p) => p.habitId === 'a').map((p) => [p.from, p.to]), [['2026-10-10', '2026-10-11'], ['2026-10-14', '2026-10-14']]);
  assert.equal(pauses.length, 4);
  assert.ok(pauses.every((p) => p.derived === true));
});

// --- opslaan en terugdraaien -------------------------------------------------------------------------------------

test('een weekend overslaan: elke dag krijgt dezelfde reden, en het is terug te draaien', async () => {
  const { repo } = await withHabit();
  const { days, undo } = await skipDays(repo, { from: WEEKEND[0], to: WEEKEND[1], reason: 'away', note: 'Vriendenweekend' }, TODAY);
  assert.equal(days, 2);
  const saved = await repo.listSkipDays();
  assert.deepEqual(saved.map((d) => [d.date, d.reason, d.note]), WEEKEND.map((d) => [d, 'away', 'Vriendenweekend']));
  await undo();
  assert.deepEqual(await repo.listSkipDays(), []);
});

test('zonder reden wordt er niets opgeslagen', async () => {
  const { repo } = await withHabit();
  await assert.rejects(skipDays(repo, { from: TODAY, reason: null }, TODAY), (e) => e instanceof RuleError && e.code === 'skip_invalid');
  await assert.rejects(skipDays(repo, { from: TODAY, reason: 'other' }, TODAY), (e) => e instanceof RuleError && e.code === 'skip_invalid');
  await assert.rejects(repo.setSkipDay({ date: TODAY, reason: null }), ValidationError);
  assert.deepEqual(await repo.listSkipDays(), []);
});

test('het venster: 14 dagen terug en 31 vooruit, en hooguit 31 dagen tegelijk', async () => {
  const { repo } = await withHabit();
  await skipDays(repo, { from: '2026-10-01', reason: 'sick' }, TODAY); // precies 14 dagen terug
  await assert.rejects(skipDays(repo, { from: '2026-09-30', reason: 'sick' }, TODAY), (e) => e.code === 'skip_window');
  await skipDays(repo, { from: '2026-11-15', reason: 'away' }, TODAY); // precies 31 dagen vooruit
  await assert.rejects(skipDays(repo, { from: '2026-11-16', reason: 'away' }, TODAY), (e) => e.code === 'skip_window');
  await assert.rejects(skipDays(repo, { from: '2026-10-10', to: '2026-11-15', reason: 'away' }, TODAY), (e) => e.code === 'skip_range'); // 37 dagen
  await assert.rejects(skipDays(repo, { from: TODAY, to: '2026-10-14', reason: 'away' }, TODAY), (e) => e.code === 'skip_invalid'); // einde voor begin
  assert.equal((await repo.listSkipDays()).length, 2); // alleen de twee die mochten
});

test('opnieuw overslaan wijzigt de reden, ongedaan maken zet de oude terug; weer meetellen kan ook', async () => {
  const { repo } = await withHabit();
  await skipDays(repo, { from: TODAY, reason: 'sick' }, TODAY);
  const { undo } = await skipDays(repo, { from: TODAY, reason: 'other', note: 'Bruiloft' }, TODAY);
  assert.deepEqual((await repo.listSkipDays()).map((d) => [d.reason, d.note]), [['other', 'Bruiloft']]);
  await undo();
  assert.deepEqual((await repo.listSkipDays()).map((d) => [d.reason, d.note]), [['sick', null]]);
  const removed = await unskipDay(repo, { date: TODAY });
  assert.deepEqual(await repo.listSkipDays(), []);
  await removed.undo();
  assert.deepEqual((await repo.listSkipDays()).map((d) => d.reason), ['sick']);
});

// --- wat het met de telling doet ---------------------------------------------------------------------------------

test('een overgeslagen dag is gepauzeerd voor alle habits, niet gemist, en breekt de reeks niet', async () => {
  const { repo, habit } = await withHabit({ startDate: '2026-10-08', schedules: validHabit().schedules.map((s) => ({ ...s, effectiveFrom: '2026-10-08' })) });
  for (const date of ['2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', TODAY]) await logCheckIn(repo, { habitId: habit.id, date, status: 'done' }, TODAY);
  const before = computeUnits({ habit, checkIns: await repo.listCheckIns(), pauses: [], today: TODAY });
  assert.equal(before.find((u) => u.start === '2026-10-10').status, 'missed');

  await skipDays(repo, { from: WEEKEND[0], to: WEEKEND[1], reason: 'away', note: 'Vriendenweekend' }, TODAY);
  const snapshot = await repo.snapshot();
  const after = computeUnits({ habit, checkIns: snapshot.checkIns, pauses: snapshot.pauses.filter((p) => p.habitId === habit.id), today: TODAY });
  assert.deepEqual(WEEKEND.map((d) => after.find((u) => u.start === d).status), ['paused', 'paused']);
  assert.equal(after.filter((u) => u.status === 'missed').length, 0);
});

test('wat je op een overgeslagen dag al had afgevinkt blijft gedaan', async () => {
  const { repo, habit } = await withHabit();
  await logCheckIn(repo, { habitId: habit.id, date: '2026-10-10', status: 'done' }, TODAY);
  await skipDays(repo, { from: '2026-10-10', reason: 'away' }, TODAY);
  const snapshot = await repo.snapshot();
  const units = computeUnits({ habit, checkIns: snapshot.checkIns, pauses: snapshot.pauses, today: TODAY });
  assert.equal(units.find((u) => u.start === '2026-10-10').status, 'done');
});

test('de dagweergave kent de reden, en op een overgeslagen dag staan de habits niet open', async () => {
  const { repo } = await withHabit();
  await skipDays(repo, { from: '2026-10-10', reason: 'away', note: 'Vriendenweekend' }, TODAY);
  const snapshot = await repo.snapshot();
  const skipped = buildDayView({ snapshot, date: '2026-10-10', today: TODAY });
  assert.equal(skipped.skipDay.reason, 'away');
  assert.equal(skipped.skipDay.note, 'Vriendenweekend');
  assert.equal(skipped.canSkip, true);
  assert.equal(skipped.progress.total, 0);
  assert.deepEqual(skipped.groups, []);
  const normal = buildDayView({ snapshot, date: '2026-10-09', today: TODAY });
  assert.equal(normal.skipDay, null);
  assert.equal(normal.progress.total, 1);
  assert.equal(buildDayView({ snapshot, date: '2026-09-01', today: TODAY }).canSkip, false);
});

test('een overgeslagen vandaag maakt van de habit geen "gepauzeerde" habit met een knop Hervat', async () => {
  const { repo, habit } = await withHabit();
  await skipDays(repo, { from: TODAY, reason: 'sick' }, TODAY);
  const detail = buildHabitDetail({ habit, snapshot: await repo.snapshot(), today: TODAY });
  assert.equal(detail.pausedNow, false);
});

// --- bewaren, back-up en sync ------------------------------------------------------------------------------------

test('de afgeleide pauzes komen niet in een back-up, de overgeslagen dagen en hun reden wel', async () => {
  const { repo, habit } = await withHabit();
  await repo.addPause({ habitId: habit.id, from: '2026-10-02', to: '2026-10-03' });
  await skipDays(repo, { from: WEEKEND[0], to: WEEKEND[1], reason: 'away', note: 'Vriendenweekend' }, TODAY);
  const exported = buildExport(await repo.snapshot());
  assert.equal(exported.data.pauses.length, 1);
  assert.deepEqual(exported.data.skipDays.map((d) => [d.date, d.reason, d.note]), WEEKEND.map((d) => [d, 'away', 'Vriendenweekend']));

  const parsed = parseImport(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.warnings.length, 0);
  const { repo: other } = testRepo();
  await other.replaceAll(parsed.data);
  assert.deepEqual((await other.listSkipDays()).map((d) => d.reason), ['away', 'away']);
  assert.equal((await other.listPauses()).length, 1);
});

test('een back-up met een overgeslagen dag zonder reden wordt niet overgenomen', () => {
  const backup = (record) => JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: [], skipDays: [record] } });
  const bad = parseImport(backup({ id: '2026-10-10', date: '2026-10-10', reason: 'nope' }));
  assert.equal(bad.data.skipDays.length, 0);
  assert.equal(bad.warnings.length, 1);
  assert.equal(parseImport(backup({ id: '2026-10-10', date: '2026-10-10', reason: 'sick', note: null })).data.skipDays.length, 1);
});

test('een overgeslagen dag gaat via de outbox naar de server', async () => {
  const { repo, store } = await withHabit();
  await skipDays(repo, { from: TODAY, reason: 'sick' }, TODAY);
  assert.ok((await store.getAll('outbox')).some((entry) => entry.collection === 'skipDays' && entry.recordId === TODAY));
});
