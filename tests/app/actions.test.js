import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHabitForm, archiveHabit, clearCheckIn, logCheckIn, pauseAll, pauseHabit, planHabit,
  resumeAll, resumeHabit, RuleError, unarchiveHabit, unplanHabit,
} from '../../src/app/actions.js';
import { computeUnits } from '../../src/domain/units.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const weekly = (count) => ({ type: 'times_per_period', period: 'week', count });
const formValues = (over = {}) => ({
  name: ' Lezen ', icon: '📖', color: 'c2', daypart: 'evening', startDate: '2026-10-01',
  cue: ' na het eten ', why: '', minimalVersion: '  ', schedule: weekly(2), ...over,
});

// --- check-ins en undo --------------------------------------------------------------------------

test('logCheckIn: binnen 14 dagen mag, daarbuiten en in de toekomst niet', async () => {
  const { repo } = testRepo();
  await logCheckIn(repo, { habitId: 'h', date: TODAY, status: 'done' }, TODAY);
  await logCheckIn(repo, { habitId: 'h', date: '2026-10-01', status: 'done' }, TODAY);
  await assert.rejects(() => logCheckIn(repo, { habitId: 'h', date: '2026-09-30', status: 'done' }, TODAY), (e) => e instanceof RuleError && e.code === 'backfill_window');
  await assert.rejects(() => logCheckIn(repo, { habitId: 'h', date: '2026-10-16', status: 'done' }, TODAY), RuleError);
  assert.equal((await repo.listCheckIns()).length, 2);
});

test('logCheckIn: undo zet de vorige toestand terug (leeg of eerdere status)', async () => {
  const { repo } = testRepo();
  const first = await logCheckIn(repo, { habitId: 'h', date: TODAY, status: 'done' }, TODAY);
  await first.undo();
  assert.equal(await repo.getCheckIn('h', TODAY), null);

  await repo.setCheckIn({ habitId: 'h', date: TODAY, status: 'skipped', note: 'druk' });
  const second = await logCheckIn(repo, { habitId: 'h', date: TODAY, status: 'done' }, TODAY);
  assert.equal((await repo.getCheckIn('h', TODAY)).status, 'done');
  await second.undo();
  const restored = await repo.getCheckIn('h', TODAY);
  assert.deepEqual([restored.status, restored.note], ['skipped', 'druk']);
});

test('clearCheckIn: wist en kan ongedaan worden gemaakt; buiten het venster niet', async () => {
  const { repo } = testRepo();
  await repo.setCheckIn({ habitId: 'h', date: TODAY, status: 'minimal' });
  const { undo } = await clearCheckIn(repo, { habitId: 'h', date: TODAY }, TODAY);
  assert.equal(await repo.getCheckIn('h', TODAY), null);
  await undo();
  assert.equal((await repo.getCheckIn('h', TODAY)).status, 'minimal');
  await assert.rejects(() => clearCheckIn(repo, { habitId: 'h', date: '2026-01-01' }, TODAY), RuleError);
});

// --- plannen ------------------------------------------------------------------------------------

test('planHabit: vandaag t/m 7 dagen vooruit; undo en unplan', async () => {
  const { repo } = testRepo();
  const { undo } = await planHabit(repo, { habitId: 'h', date: TODAY }, TODAY);
  assert.equal((await repo.listDayPlans()).length, 1);
  await undo();
  assert.equal((await repo.listDayPlans()).length, 0);

  await planHabit(repo, { habitId: 'h', date: '2026-10-22' }, TODAY);
  await assert.rejects(() => planHabit(repo, { habitId: 'h', date: '2026-10-23' }, TODAY), (e) => e.code === 'plan_window');
  await assert.rejects(() => planHabit(repo, { habitId: 'h', date: '2026-10-14' }, TODAY), RuleError);

  const removed = await unplanHabit(repo, { habitId: 'h', date: '2026-10-22' });
  assert.equal((await repo.listDayPlans()).length, 0);
  await removed.undo();
  assert.equal((await repo.listDayPlans()).length, 1);
});

// --- habit-formulier ------------------------------------------------------------------------------

test('applyHabitForm: nieuwe habit — één schema met ingangsdatum = startdatum, tekst opgeschoond', () => {
  const habit = applyHabitForm({ values: formValues(), today: TODAY, sortOrder: 3 });
  assert.equal(habit.name, 'Lezen');
  assert.equal(habit.cue, 'na het eten');
  assert.equal(habit.why, null);
  assert.equal(habit.minimalVersion, null);
  assert.equal(habit.status, 'active');
  assert.equal(habit.sortOrder, 3);
  assert.deepEqual(habit.schedules, [{ effectiveFrom: '2026-10-01', schedule: weekly(2) }]);
});

test('applyHabitForm: lopende habit zonder schemawijziging houdt de versies zoals ze waren', () => {
  const existing = validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(2) }] });
  const habit = applyHabitForm({ existing, values: formValues({ name: 'Nieuw' }), today: TODAY });
  assert.deepEqual(habit.schedules, existing.schedules);
  assert.equal(habit.name, 'Nieuw');
});

test('applyHabitForm: lopende habit met ander schema krijgt een nieuwe versie vanaf vandaag', () => {
  const existing = validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(2) }] });
  const habit = applyHabitForm({ existing, values: formValues({ schedule: weekly(3) }), today: TODAY });
  assert.deepEqual(habit.schedules, [
    { effectiveFrom: '2026-10-01', schedule: weekly(2) },
    { effectiveFrom: TODAY, schedule: weekly(3) },
  ]);
  assert.equal(habit.startDate, '2026-10-01'); // startdatum van een lopende habit blijft staan
});

test('applyHabitForm: twee keer wijzigen op dezelfde dag geeft één versie; terugdraaien geen extra versie', () => {
  const existing = validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(2) }] });
  const once = applyHabitForm({ existing, values: formValues({ schedule: weekly(3) }), today: TODAY });
  const twice = applyHabitForm({ existing: once, values: formValues({ schedule: weekly(4) }), today: TODAY });
  assert.deepEqual(twice.schedules.map((s) => s.schedule.count), [2, 4]);
  const back = applyHabitForm({ existing: once, values: formValues({ schedule: weekly(2) }), today: TODAY });
  assert.deepEqual(back.schedules, existing.schedules);
});

test('applyHabitForm: weekdagen worden genormaliseerd bij het vergelijken', () => {
  const existing = validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'weekdays', weekdays: [0, 2, 4] } }] });
  const same = applyHabitForm({ existing, values: formValues({ schedule: { type: 'weekdays', weekdays: [4, 0, 2] } }), today: TODAY });
  assert.equal(same.schedules.length, 1);
});

test('applyHabitForm: habit die nog niet gestart is mag startdatum en schema vrij wijzigen', () => {
  const existing = validHabit({ startDate: '2026-10-20', schedules: [{ effectiveFrom: '2026-10-20', schedule: weekly(2) }] });
  const habit = applyHabitForm({ existing, values: formValues({ startDate: '2026-10-25', schedule: weekly(5) }), today: TODAY });
  assert.equal(habit.startDate, '2026-10-25');
  assert.deepEqual(habit.schedules, [{ effectiveFrom: '2026-10-25', schedule: weekly(5) }]);
});

test('een door het formulier gemaakte habit is geldig volgens de repository', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveHabit(applyHabitForm({ values: formValues(), today: TODAY }));
  assert.equal(saved.id, 'id-1');
});

// --- pauzeren en archiveren ------------------------------------------------------------------------

test('pauseHabit is idempotent; resumeHabit sluit de pauze af op gisteren', async () => {
  const { repo } = testRepo();
  await pauseHabit(repo, 'h', '2026-10-10');
  await pauseHabit(repo, 'h', '2026-10-11'); // al gepauzeerd
  assert.equal((await repo.listPauses('h')).length, 1);
  await resumeHabit(repo, 'h', TODAY);
  const [pause] = await repo.listPauses('h');
  assert.deepEqual([pause.from, pause.to], ['2026-10-10', '2026-10-14']);
  await resumeHabit(repo, 'h', TODAY); // niets meer open: geen fout
});

test('resumeHabit op dezelfde dag als de pauze begon verwijdert de pauze', async () => {
  const { repo } = testRepo();
  await pauseHabit(repo, 'h', TODAY);
  await resumeHabit(repo, 'h', TODAY);
  assert.deepEqual(await repo.listPauses('h'), []);
});

test('pauseAll / resumeAll raken alleen actieve habits', async () => {
  const { repo } = testRepo();
  const a = await repo.saveHabit(validHabit({ name: 'A' }));
  const b = await repo.saveHabit(validHabit({ name: 'B', sortOrder: 1 }));
  const old = await repo.saveHabit(validHabit({ name: 'Oud', status: 'archived', endDate: '2026-10-05', sortOrder: 2 }));
  await pauseAll(repo, '2026-10-12');
  assert.equal((await repo.listPauses(a.id)).length, 1);
  assert.equal((await repo.listPauses(b.id)).length, 1);
  assert.equal((await repo.listPauses(old.id)).length, 0);
  await resumeAll(repo, TODAY);
  assert.ok((await repo.listPauses()).every((p) => p.to === '2026-10-14'));
});

test('archiveHabit zet status en einddatum; unarchive telt de archieftijd als pauze, niet als gemist', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveHabit(validHabit({ startDate: '2026-10-01' }));
  const archived = await archiveHabit(repo, saved, '2026-10-05');
  assert.deepEqual([archived.status, archived.endDate], ['archived', '2026-10-05']);

  const restored = await unarchiveHabit(repo, archived, TODAY);
  assert.deepEqual([restored.status, restored.endDate], ['active', null]);
  const [pause] = await repo.listPauses(saved.id);
  assert.deepEqual([pause.from, pause.to], ['2026-10-06', '2026-10-14']);

  const units = computeUnits({ habit: restored, pauses: await repo.listPauses(saved.id), today: TODAY });
  assert.deepEqual(units.map((u) => u.status), ['missed', 'missed', 'missed', 'missed', 'missed', 'paused', 'paused', 'paused', 'paused', 'paused', 'paused', 'paused', 'paused', 'paused', 'open']);
});

test('archive en direct terugzetten op dezelfde dag maakt geen pauze', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveHabit(validHabit());
  const archived = await archiveHabit(repo, saved, TODAY);
  await unarchiveHabit(repo, archived, TODAY);
  assert.deepEqual(await repo.listPauses(saved.id), []);
});
