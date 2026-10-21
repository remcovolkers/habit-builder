// Losse afspraken ("Middag: bellen met Anna"): een eenmalige herinnering met een datum. Geen habit: een afspraak heeft geen ritme, sterkte,
// reeks, punten of prestaties en telt nergens mee (zie docs/LOSSE-AFSPRAKEN.md). Puur.
//
//   afspraak = { id, title, date, daypart, doneOn }
//   date     de dag waarop hij staat; daypart een van DAYPARTS ('anytime' = geen vast moment, in de app "Overdag")
//   doneOn   de dag waarop hij is afgevinkt, of null
import { diffDays, isValidDate } from './dates.js';
import { DAYPARTS } from './habit.js';

export const APPOINTMENT_TITLE_MAX = 80;
/** Zo ver vooruit mag een afspraak staan. Vandaag laat hem pas zien zodra hij binnen de dagnavigatie valt. */
export const APPOINTMENT_AHEAD_DAYS = 366;

/** Geeft [{ field, code }]; leeg = geldig. */
export function validateAppointment(appointment) {
  const errors = [];
  const add = (field, code) => errors.push({ field, code });
  const title = typeof appointment.title === 'string' ? appointment.title.trim() : '';
  if (title === '') add('title', 'required');
  else if (title.length > APPOINTMENT_TITLE_MAX) add('title', 'too_long');
  if (!isValidDate(appointment.date)) add('date', 'invalid');
  if (!DAYPARTS.includes(appointment.daypart)) add('daypart', 'invalid');
  if (appointment.doneOn != null && !isValidDate(appointment.doneOn)) add('doneOn', 'invalid');
  return errors;
}

/** Mag een afspraak op deze datum worden gezet? Vandaag of later, tot APPOINTMENT_AHEAD_DAYS vooruit. */
export function inAppointmentWindow(date, today) {
  const ahead = diffDays(date, today);
  return ahead >= 0 && ahead <= APPOINTMENT_AHEAD_DAYS;
}

const byDayThenCreated = (a, b) =>
  DAYPARTS.indexOf(a.daypart) - DAYPARTS.indexOf(b.daypart) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.title.localeCompare(b.title, 'nl');

/**
 * Welke afspraken staan op `date`? Een afspraak staat op zijn eigen dag. Op de echte vandaag staat daarnaast ook wat van een eerdere dag is en nog
 * openstaat, met `carried: true` ("Van gisteren"): een gemiste afspraak schuift stil door, zonder "te laat" of waarschuwing. Is zo'n afspraak vandaag
 * afgevinkt, dan blijft hij vandaag in beeld; is hij op een eerdere dag afgevinkt, dan staat hij alleen op zijn eigen dag.
 *
 * Geeft [{ id, title, date, daypart, doneOn, done, carried }], op dagdeel en dan op aanmaakmoment.
 */
export function appointmentsOn({ appointments, date, today }) {
  return appointments
    .filter((a) => a.date === date || (date === today && a.date < today && (a.doneOn == null || a.doneOn === today)))
    .map((a) => ({ ...a, doneOn: a.doneOn ?? null, done: a.doneOn != null, carried: a.date !== date }))
    .sort(byDayThenCreated);
}
