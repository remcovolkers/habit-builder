// Losse afspraken: opslag, handelingen (met ongedaan maken), het Vandaag-scherm, de back-up en de sync (docs/LOSSE-AFSPRAKEN.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../src/data/repository.js';
import { DATA_COLLECTIONS } from '../../src/data/memory-store.js';
import { RuleError, addAppointment, editAppointment, logCheckIn, removeAppointment, setAppointmentDone } from '../../src/app/actions.js';
import { buildDayView } from '../../src/app/day-view.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { buildWeekStrip } from '../../src/app/overview.js';
import { buildScoreSummary } from '../../src/app/score.js';
import { buildAttention } from '../../src/app/attention.js';
import { TODAY, testRepo, validHabit } from './helpers.js';

const WEEK_LATER = '2026-10-22';
const YESTERDAY = '2026-10-14';

test('opslag: id, getrimde tekst, dagdeel "anytime" als standaard, tijdstempels', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveAppointment({ title: '  Bellen met Anna  ', date: '2026-10-17' });
  assert.equal(saved.id, 'id-1');
  assert.equal(saved.title, 'Bellen met Anna');
  assert.equal(saved.daypart, 'anytime');
  assert.equal(saved.doneOn, null);
  assert.ok(saved.createdAt && saved.updatedAt);
  assert.deepEqual((await repo.listAppointments()).map((a) => a.id), ['id-1']);
  assert.equal((await repo.getAppointment('id-1')).title, 'Bellen met Anna');
});

test('opslag: ongeldige invoer wordt geweigerd en verandert niets', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => repo.saveAppointment({ title: '', date: TODAY }), ValidationError);
  await assert.rejects(() => repo.saveAppointment({ title: 'x', date: 'morgen' }), ValidationError);
  await assert.rejects(() => repo.saveAppointment({ title: 'x', date: TODAY, daypart: 'noon' }), ValidationError);
  assert.deepEqual(await repo.listAppointments(), []);
});

test('opslag: bijwerken behoudt createdAt; verwijderen is zacht en komt in de outbox', async () => {
  const { repo, store } = testRepo();
  const first = await repo.saveAppointment({ title: 'Bellen', date: TODAY });
  const again = await repo.saveAppointment({ ...first, title: 'Bellen met Anna' });
  assert.equal(again.createdAt, first.createdAt);
  assert.notEqual(again.updatedAt, first.updatedAt);
  assert.equal(await repo.deleteAppointment(first.id), true);
  assert.equal(await repo.deleteAppointment(first.id), false);
  assert.deepEqual(await repo.listAppointments(), []);
  assert.equal(await repo.getAppointment(first.id), null);
  assert.ok((await store.get('appointments', first.id)).deletedAt); // de grafsteen blijft voor de sync
  assert.ok(await store.get('outbox', `appointments|${first.id}`));
});

test('de lijst staat op datum', async () => {
  const { repo } = testRepo();
  await repo.saveAppointment({ title: 'Later', date: '2026-10-20' });
  await repo.saveAppointment({ title: 'Eerder', date: '2026-10-16' });
  assert.deepEqual((await repo.listAppointments()).map((a) => a.title), ['Eerder', 'Later']);
});

test('het is een gesynchroniseerde collectie en zit in de snapshot', async () => {
  assert.ok(DATA_COLLECTIONS.includes('appointments'));
  const { repo } = testRepo();
  await repo.saveAppointment({ title: 'Bellen', date: TODAY });
  assert.equal((await repo.snapshot()).appointments.length, 1);
});

test('afspraak toevoegen: op een dag vanaf vandaag, met ongedaan maken', async () => {
  const { repo } = testRepo();
  const { appointment, undo } = await addAppointment(repo, { title: 'Bellen met Anna', date: '2026-10-17', daypart: 'afternoon' }, TODAY);
  assert.equal(appointment.daypart, 'afternoon');
  assert.equal((await repo.listAppointments()).length, 1);
  await undo();
  assert.deepEqual(await repo.listAppointments(), []);
});

test('afspraak toevoegen: niet in het verleden en niet verder dan een jaar vooruit', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => addAppointment(repo, { title: 'x', date: YESTERDAY }, TODAY), (e) => e instanceof RuleError && e.code === 'appointment_window');
  await assert.rejects(() => addAppointment(repo, { title: 'x', date: '2028-01-01' }, TODAY), (e) => e instanceof RuleError && e.code === 'appointment_window');
  await addAppointment(repo, { title: 'x', date: TODAY }, TODAY); // vandaag mag
  assert.equal((await repo.listAppointments()).length, 1);
});

test('afspraak wijzigen: een andere dag maakt hem weer open; dezelfde dag houdt het afvinken; ongedaan maken zet alles terug', async () => {
  const { repo } = testRepo();
  const { appointment } = await addAppointment(repo, { title: 'Bellen', date: TODAY }, TODAY);
  await setAppointmentDone(repo, { id: appointment.id, date: TODAY, done: true }, TODAY);

  await editAppointment(repo, { id: appointment.id, title: 'Bellen met Anna', date: TODAY, daypart: 'afternoon' }, TODAY);
  const same = await repo.getAppointment(appointment.id);
  assert.equal(same.title, 'Bellen met Anna');
  assert.equal(same.doneOn, TODAY);

  const { undo } = await editAppointment(repo, { id: appointment.id, title: 'Bellen met Anna', date: WEEK_LATER, daypart: 'afternoon' }, TODAY);
  const moved = await repo.getAppointment(appointment.id);
  assert.equal(moved.date, WEEK_LATER);
  assert.equal(moved.doneOn, null);
  await undo();
  assert.equal((await repo.getAppointment(appointment.id)).date, TODAY);
  assert.equal((await repo.getAppointment(appointment.id)).doneOn, TODAY);
});

test('afspraak wijzigen: een afspraak van een eerdere dag mag die dag houden, maar niet naar een andere dag in het verleden', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveAppointment({ title: 'Gemist', date: '2026-10-13' });
  await editAppointment(repo, { id: saved.id, title: 'Gemist, nu anders', date: '2026-10-13', daypart: 'morning' }, TODAY);
  assert.equal((await repo.getAppointment(saved.id)).title, 'Gemist, nu anders');
  await assert.rejects(() => editAppointment(repo, { id: saved.id, title: 'x', date: '2026-10-12', daypart: 'morning' }, TODAY), (e) => e.code === 'appointment_window');
});

test('afspraak afvinken en weer openzetten, met ongedaan maken; alleen op dagen waarop afvinken mag', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveAppointment({ title: 'Bellen', date: TODAY });
  const { undo } = await setAppointmentDone(repo, { id: saved.id, date: TODAY, done: true }, TODAY);
  assert.equal((await repo.getAppointment(saved.id)).doneOn, TODAY);
  await undo();
  assert.equal((await repo.getAppointment(saved.id)).doneOn, null);

  await setAppointmentDone(repo, { id: saved.id, date: TODAY, done: true }, TODAY);
  await setAppointmentDone(repo, { id: saved.id, date: TODAY, done: false }, TODAY);
  assert.equal((await repo.getAppointment(saved.id)).doneOn, null);

  await assert.rejects(() => setAppointmentDone(repo, { id: saved.id, date: '2026-10-16', done: true }, TODAY), (e) => e.code === 'backfill_window'); // de toekomst
  await assert.rejects(() => setAppointmentDone(repo, { id: saved.id, date: '2026-09-01', done: true }, TODAY), (e) => e.code === 'backfill_window'); // te lang geleden
});

test('afspraak verwijderen, met ongedaan maken; een onbekende afspraak geeft een RuleError', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveAppointment({ title: 'Bellen', date: TODAY, daypart: 'evening' });
  const { undo } = await removeAppointment(repo, { id: saved.id });
  assert.deepEqual(await repo.listAppointments(), []);
  await undo();
  const back = await repo.getAppointment(saved.id);
  assert.equal(back.title, 'Bellen');
  assert.equal(back.daypart, 'evening');
  await assert.rejects(() => removeAppointment(repo, { id: 'bestaat-niet' }), (e) => e.code === 'appointment_missing');
  await assert.rejects(() => setAppointmentDone(repo, { id: 'bestaat-niet', date: TODAY, done: true }, TODAY), (e) => e.code === 'appointment_missing');
  await assert.rejects(() => editAppointment(repo, { id: 'bestaat-niet', title: 'x', date: TODAY, daypart: 'morning' }, TODAY), (e) => e.code === 'appointment_missing');
});

// --- het Vandaag-scherm ---------------------------------------------------------------------------------------------------------

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const lezen = (over = {}) => validHabit({ id: 'Lezen', name: 'Lezen', schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }], ...over });
const snap = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], appointments: [], ...over });
const appt = (id, over = {}) => ({ id, title: id, date: TODAY, daypart: 'afternoon', doneOn: null, createdAt: '2026-10-10T08:00:00.000Z', ...over });

test('Vandaag: een afspraak staat in zijn dagdeel, onder de habits, en telt niet mee in de voortgang', () => {
  const view = buildDayView({
    snapshot: snap({ habits: [lezen({ daypart: 'afternoon' })], appointments: [appt('Bellen met Anna')] }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(view.groups.map((g) => g.daypart), ['afternoon']);
  assert.deepEqual(view.groups[0].entries.map((e) => e.habit.name), ['Lezen']);
  assert.deepEqual(view.groups[0].appointments.map((a) => a.title), ['Bellen met Anna']);
  assert.deepEqual(view.progress, { done: 0, total: 1 });
});

test('Vandaag: een dagdeel met alleen afspraken bestaat; zonder dagdeel staat hij bij Overdag', () => {
  const view = buildDayView({
    snapshot: snap({ habits: [lezen({ daypart: 'morning' })], appointments: [appt('Bellen', { daypart: 'evening' }), appt('Pakketje', { daypart: 'anytime' })] }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(view.groups.map((g) => g.daypart), ['morning', 'evening', 'anytime']);
  assert.deepEqual(view.groups[1].entries, []);
  assert.deepEqual(view.groups[1].appointments.map((a) => a.title), ['Bellen']);
  assert.deepEqual(view.progress, { done: 0, total: 1 });
});

test('Vandaag: alleen afspraken op een dag zonder habits laat de dag niet leeg ogen en houdt de ingang bereikbaar', () => {
  const view = buildDayView({ snapshot: snap({ appointments: [appt('Bellen')] }), date: TODAY, today: TODAY });
  assert.equal(view.groups.length, 1);
  assert.equal(view.hasHabits, false);
  assert.equal(view.hasAppointments, true);
  assert.deepEqual(view.progress, { done: 0, total: 0 });
  // zonder afspraken en zonder habits blijft het de lege introductie
  const empty = buildDayView({ snapshot: snap(), date: TODAY, today: TODAY });
  assert.equal(empty.hasAppointments, false);
});

test('Vandaag: een snapshot zonder afspraken (oudere gegevens) werkt gewoon', () => {
  const { appointments, ...old } = snap({ habits: [lezen()] });
  const view = buildDayView({ snapshot: old, date: TODAY, today: TODAY });
  assert.equal(view.hasAppointments, false);
  assert.deepEqual(view.groups[0].appointments, []);
});

test('Vandaag: een gemiste afspraak schuift door; op een toekomstige dag staat alleen wat voor die dag is', () => {
  const snapshot = snap({ appointments: [appt('Gemist', { date: '2026-10-13' }), appt('Donderdag', { date: WEEK_LATER })] });
  const today = buildDayView({ snapshot, date: TODAY, today: TODAY });
  assert.deepEqual(today.groups.flatMap((g) => g.appointments).map((a) => [a.title, a.carried]), [['Gemist', true]]);
  const later = buildDayView({ snapshot, date: WEEK_LATER, today: TODAY });
  assert.deepEqual(later.groups.flatMap((g) => g.appointments).map((a) => [a.title, a.carried]), [['Donderdag', false]]);
  assert.equal(later.canLog, false);
  assert.equal(later.canPlan, true);
});

test('afspraken raken punten, aandacht en de weekstrook niet', async () => {
  const { repo } = testRepo();
  await repo.saveHabit(lezen());
  const without = await repo.snapshot();
  await repo.saveAppointment({ title: 'Bellen', date: TODAY, daypart: 'morning' });
  await repo.saveAppointment({ title: 'Gemist', date: '2026-10-13' });
  const withAppts = await repo.snapshot();
  assert.deepEqual(buildScoreSummary({ snapshot: withAppts, today: TODAY }), buildScoreSummary({ snapshot: without, today: TODAY }));
  assert.deepEqual(buildAttention({ snapshot: withAppts, today: TODAY }), buildAttention({ snapshot: without, today: TODAY }));
  const strip = (snapshot) => buildWeekStrip({ snapshot, date: TODAY, today: TODAY });
  assert.deepEqual(strip(withAppts), strip(without));
  await logCheckIn(repo, { habitId: 'Lezen', date: TODAY, status: 'done' }, TODAY);
  const view = buildDayView({ snapshot: await repo.snapshot(), date: TODAY, today: TODAY });
  assert.deepEqual(view.progress, { done: 1, total: 1 }); // de open afspraak houdt "alles gedaan" niet tegen
});

// --- back-up ----------------------------------------------------------------------------------------------------------------------

test('back-up: afspraken gaan mee in de export en komen terug bij het importeren', async () => {
  const { repo } = testRepo();
  await repo.saveAppointment({ title: 'Bellen met Anna', date: '2026-10-17', daypart: 'afternoon' });
  const done = await repo.saveAppointment({ title: 'Klaar', date: TODAY, doneOn: TODAY });
  const json = JSON.stringify(buildExport(await repo.snapshot(), new Date('2026-10-15T08:00:00Z')));
  const parsed = parseImport(json);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.data.appointments.length, 2);

  const fresh = testRepo().repo;
  await fresh.replaceAll(parsed.data);
  const back = await fresh.listAppointments();
  assert.deepEqual(back.map((a) => [a.title, a.date, a.daypart, a.doneOn]), [['Klaar', TODAY, 'anytime', TODAY], ['Bellen met Anna', '2026-10-17', 'afternoon', null]]);
  assert.equal(back.some((a) => a.id === done.id), true);
});

test('back-up: een afspraak zonder habit is geen wees; een ongeldige afspraak wordt weggelaten met een waarschuwing', () => {
  const file = (appointments) => JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: [], appointments } });
  const ok = parseImport(file([{ id: 'a', title: 'Bellen', date: TODAY, daypart: 'morning', doneOn: null }]));
  assert.equal(ok.data.appointments.length, 1);
  assert.deepEqual(ok.warnings, []);
  const bad = parseImport(file([{ id: 'b', title: '', date: TODAY, daypart: 'morning' }, { id: 'c', title: 'x', date: 'nee', daypart: 'morning' }]));
  assert.equal(bad.ok, true);
  assert.equal(bad.data.appointments.length, 0);
  assert.equal(bad.warnings.length, 2);
  assert.equal(parseImport(JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: [], appointments: 'nee' } })).error, 'invalid_data');
});

test('back-up: een oude back-up zonder afspraken importeert zonder fout en maakt de afspraken leeg', async () => {
  const { repo } = testRepo();
  await repo.saveAppointment({ title: 'Bellen', date: TODAY });
  const parsed = parseImport(JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: [] } }));
  assert.equal(parsed.ok, true);
  await repo.replaceAll(parsed.data);
  assert.deepEqual(await repo.listAppointments(), []);
});
