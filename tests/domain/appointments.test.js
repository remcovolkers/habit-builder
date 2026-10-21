import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPOINTMENT_AHEAD_DAYS, APPOINTMENT_TITLE_MAX, appointmentsOn, inAppointmentWindow, validateAppointment } from '../../src/domain/appointments.js';

const TODAY = '2026-10-15'; // donderdag
const appt = (id, over = {}) => ({ id, title: id, date: TODAY, daypart: 'anytime', doneOn: null, createdAt: `2026-10-10T08:00:0${id.length}.000Z`, ...over });
const ids = (list) => list.map((a) => a.id);

test('validatie: tekst, dag en dagdeel', () => {
  const ok = { title: 'Bellen met Anna', date: TODAY, daypart: 'afternoon', doneOn: null };
  assert.deepEqual(validateAppointment(ok), []);
  assert.deepEqual(validateAppointment({ ...ok, title: '   ' }), [{ field: 'title', code: 'required' }]);
  assert.deepEqual(validateAppointment({ ...ok, title: undefined }), [{ field: 'title', code: 'required' }]);
  assert.deepEqual(validateAppointment({ ...ok, title: 'x'.repeat(APPOINTMENT_TITLE_MAX + 1) }), [{ field: 'title', code: 'too_long' }]);
  assert.deepEqual(validateAppointment({ ...ok, title: 'x'.repeat(APPOINTMENT_TITLE_MAX) }), []);
  assert.deepEqual(validateAppointment({ ...ok, date: '2026-13-40' }), [{ field: 'date', code: 'invalid' }]);
  assert.deepEqual(validateAppointment({ ...ok, daypart: 'noon' }), [{ field: 'daypart', code: 'invalid' }]);
  assert.deepEqual(validateAppointment({ ...ok, doneOn: 'gisteren' }), [{ field: 'doneOn', code: 'invalid' }]);
});

test('het venster: vandaag tot 366 dagen vooruit, niet in het verleden', () => {
  assert.equal(inAppointmentWindow(TODAY, TODAY), true);
  assert.equal(inAppointmentWindow('2026-10-14', TODAY), false);
  assert.equal(inAppointmentWindow('2027-10-16', TODAY), true); // 366 dagen
  assert.equal(inAppointmentWindow('2027-10-17', TODAY), false);
  assert.equal(APPOINTMENT_AHEAD_DAYS, 366);
});

test('een afspraak staat op zijn eigen dag en alleen daar', () => {
  const list = [appt('Bellen', { date: '2026-10-17' })];
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: '2026-10-17', today: TODAY })), ['Bellen']);
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: TODAY, today: TODAY })), []);
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: '2026-10-18', today: TODAY })), []);
});

test('een open afspraak van een eerdere dag schuift stil door naar vandaag, gemarkeerd als "carried"', () => {
  const list = [appt('Gemist', { date: '2026-10-13' })];
  const [onToday] = appointmentsOn({ appointments: list, date: TODAY, today: TODAY });
  assert.equal(onToday.id, 'Gemist');
  assert.equal(onToday.carried, true);
  assert.equal(onToday.done, false);
  // op zijn eigen dag staat hij gewoon (niet als doorgeschoven)
  const [onOwnDay] = appointmentsOn({ appointments: list, date: '2026-10-13', today: TODAY });
  assert.equal(onOwnDay.carried, false);
  // en niet op andere eerdere dagen of in de toekomst
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: '2026-10-14', today: TODAY })), []);
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: '2026-10-16', today: TODAY })), []);
});

test('doorgeschoven en vandaag afgevinkt: blijft vandaag in beeld; eerder afgevinkt: alleen op zijn eigen dag', () => {
  const doneToday = appt('Vandaag klaar', { date: '2026-10-13', doneOn: TODAY });
  const doneBefore = appt('Eerder klaar', { date: '2026-10-12', doneOn: '2026-10-13' });
  const shown = appointmentsOn({ appointments: [doneToday, doneBefore], date: TODAY, today: TODAY });
  assert.deepEqual(ids(shown), ['Vandaag klaar']);
  assert.equal(shown[0].done, true);
  assert.equal(shown[0].carried, true);
  assert.deepEqual(ids(appointmentsOn({ appointments: [doneBefore], date: '2026-10-12', today: TODAY })), ['Eerder klaar']);
});

test('doorschuiven geldt alleen voor de echte vandaag, niet als je een andere dag bekijkt', () => {
  const list = [appt('Gemist', { date: '2026-10-13' })];
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: '2026-10-16', today: TODAY })), []);
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: '2026-10-12', today: TODAY })), []);
});

test('de volgorde: dagdeel van de dag, dan aanmaakmoment', () => {
  const list = [
    appt('Avond', { daypart: 'evening' }),
    appt('Later gemaakt', { daypart: 'morning', createdAt: '2026-10-11T08:00:00.000Z' }),
    appt('Overdag'),
    appt('Eerst gemaakt', { daypart: 'morning', createdAt: '2026-10-09T08:00:00.000Z' }),
    appt('Middag', { daypart: 'afternoon' }),
  ];
  assert.deepEqual(ids(appointmentsOn({ appointments: list, date: TODAY, today: TODAY })), ['Eerst gemaakt', 'Later gemaakt', 'Middag', 'Avond', 'Overdag']);
});
