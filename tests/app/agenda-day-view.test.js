// De agenda op het Vandaag-scherm: in het dagdeel van de afspraak, alleen om te lezen, en nergens van invloed (docs/AGENDA.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayView } from '../../src/app/day-view.js';
import { buildExport } from '../../src/app/backup.js';
import { agendaOn } from '../../src/domain/agenda.js';
import { TODAY, testRepo, validHabit } from './helpers.js';

const item = (over = {}) => ({ id: 'x', title: 'Tandarts', date: TODAY, start: '14:30', end: '15:30', allDay: false, ...over });

async function snapshotWithHabit() {
  const { repo } = testRepo();
  await repo.saveHabit(validHabit({ name: 'Lezen', daypart: 'morning' }));
  return repo.snapshot();
}

test('een afspraak uit je agenda staat in zijn dagdeel, onder de habits', async () => {
  const snapshot = await snapshotWithHabit();
  const agenda = agendaOn({ items: [item({ id: 'a', title: 'Stand-up', start: '09:00' }), item({ id: 'b' }), item({ id: 'c', title: 'Verjaardag', start: null, end: null, allDay: true })], date: TODAY });
  const view = buildDayView({ snapshot, date: TODAY, today: TODAY, agenda });
  assert.deepEqual(view.groups.map((g) => [g.daypart, g.entries.length, g.agenda.map((a) => a.title)]), [
    ['morning', 1, ['Stand-up']],
    ['afternoon', 0, ['Tandarts']],
    ['anytime', 0, ['Verjaardag']],
  ]);
});

test('een dagdeel met alleen agenda bestaat, en zonder agenda blijft alles zoals het was', async () => {
  const snapshot = await snapshotWithHabit();
  const plain = buildDayView({ snapshot, date: TODAY, today: TODAY });
  assert.deepEqual(plain.groups.map((g) => [g.daypart, g.agenda]), [['morning', []]]);
  const withAgenda = buildDayView({ snapshot, date: TODAY, today: TODAY, agenda: agendaOn({ items: [item()], date: TODAY }) });
  assert.equal(withAgenda.groups.length, 2);
});

test('de agenda telt nergens mee: niet in de teller, het feest of de rest van het scherm', async () => {
  const snapshot = await snapshotWithHabit();
  const agenda = agendaOn({ items: [item(), item({ id: 'y', start: '09:00' })], date: TODAY });
  const plain = buildDayView({ snapshot, date: TODAY, today: TODAY });
  const withAgenda = buildDayView({ snapshot, date: TODAY, today: TODAY, agenda });
  assert.deepEqual(withAgenda.progress, plain.progress);
  assert.deepEqual(withAgenda.pool, plain.pool);
  assert.equal(withAgenda.hasHabits, plain.hasHabits);
  assert.equal(withAgenda.hasAppointments, plain.hasAppointments, 'een afspraak uit je agenda is geen afspraak van de app: de knop "Afspraak toevoegen" verandert niet');
});

test('een afgevinkte afspraak uit je agenda verandert niets aan de teller of het feest', async () => {
  const snapshot = await snapshotWithHabit();
  const agenda = agendaOn({ items: [item()], date: TODAY }).map((a) => ({ ...a, done: true }));
  const plain = buildDayView({ snapshot, date: TODAY, today: TODAY });
  const view = buildDayView({ snapshot, date: TODAY, today: TODAY, agenda });
  assert.deepEqual(view.progress, plain.progress);
  assert.equal(view.groups.find((g) => g.daypart === 'afternoon').agenda[0].done, true);
});

test('de agenda zit niet in je gegevens: niet in de snapshot en niet in de back-up', async () => {
  const snapshot = await snapshotWithHabit();
  assert.equal('agenda' in snapshot, false);
  const backup = JSON.stringify(buildExport(snapshot, new Date('2026-10-15T08:00:00Z')));
  assert.ok(!/agenda|calendar|hb-agenda/i.test(backup));
});
