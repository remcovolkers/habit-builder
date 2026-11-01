// Een dag overslaan (docs/DAG-OVERSLAAN.md): je bent een dag of meer uit je ritme (weg, ziek, een bijzondere dag), voor al je habits tegelijk.
// Zo'n dag telt als gepauzeerd, niet als gemist: geen gebroken reeks, geen aandacht, en hij tikt niet mee naar "ingeburgerd". Een reden is verplicht,
// zodat je later kunt terugzien waarom. Puur.
//
//   overgeslagen dag = { id: datum, date, reason, note }
import { BACKFILL_DAYS, NOTE_MAX_LENGTH } from './constants.js';
import { addDays, diffDays, isValidDate } from './dates.js';

export const SKIP_REASONS = Object.freeze(['away', 'sick', 'event', 'other']);
/** Zo ver vooruit mag een dag worden overgeslagen (een weekend dat je al weet), en zo lang mag één keer overslaan duren. */
export const SKIP_AHEAD_DAYS = 31;
export const SKIP_MAX_DAYS = 31;

/** Geeft [{ field, code }]; leeg = geldig. Bij "Anders" is de toelichting de reden en dus verplicht. */
export function validateSkipDay({ date, reason, note = null }) {
  const errors = [];
  const add = (field, code) => errors.push({ field, code });
  const text = typeof note === 'string' ? note.trim() : '';
  if (!isValidDate(date)) add('date', 'invalid');
  if (!SKIP_REASONS.includes(reason)) add('reason', 'invalid');
  if (note !== null && typeof note !== 'string') add('note', 'invalid');
  else if (text.length > NOTE_MAX_LENGTH) add('note', 'too_long');
  else if (reason === 'other' && text === '') add('note', 'required');
  return errors;
}

/** Mag deze dag worden overgeslagen of weer meegeteld? Tot BACKFILL_DAYS terug (zoals afvinken) en tot SKIP_AHEAD_DAYS vooruit. */
export function inSkipWindow(date, today) {
  const ahead = diffDays(date, today);
  return ahead >= -BACKFILL_DAYS && ahead <= SKIP_AHEAD_DAYS;
}

/**
 * De overgeslagen dagen als pauzes voor elke habit, zodat alles wat al met pauzes rekent (eenheden, reeksen, sterkte, fase, heatmap, aandacht)
 * ze meeneemt. Opeenvolgende dagen worden één pauze. Deze pauzes worden niet opgeslagen: ze hebben `derived: true` en horen niet in een
 * back-up, bij "Hervat" of bij de prestatie voor het hervatten van een pauze.
 */
export function skipDayPauses(habits, skipDays) {
  const dates = [...new Set(skipDays.map((d) => d.date))].sort();
  const ranges = [];
  for (const date of dates) {
    const last = ranges.at(-1);
    if (last && addDays(last.to, 1) === date) last.to = date;
    else ranges.push({ from: date, to: date });
  }
  return habits.flatMap((habit) => ranges.map((range) => ({ id: `skip|${habit.id}|${range.from}`, habitId: habit.id, ...range, derived: true })));
}

/** Een pauze die de gebruiker zelf heeft gemaakt (en niet voortkomt uit een overgeslagen dag). */
export const isOwnPause = (pause) => pause.derived !== true;
