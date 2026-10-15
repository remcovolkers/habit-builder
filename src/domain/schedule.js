// Cadence-schema's. Een habit heeft een lijst versies: [{ effectiveFrom, schedule }].
//
// schedule is een van:
//   { type: 'weekdays', weekdays: [0..6] }                  vaste weekdagen (dagelijks = alle 7)
//   { type: 'times_per_period', period: 'week'|'month', count }   N× per week/maand, geen vaste dag
//   { type: 'day_of_month', day: 1..31 }                    vaste dag; korte maand -> laatste dag
import { daysInMonth, endOfMonth, endOfWeek, isValidDate, startOfMonth, startOfWeek } from './dates.js';

export const ALL_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
export const WORKDAYS = Object.freeze([0, 1, 2, 3, 4]);

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

/** Geeft een lijst foutmeldingen; leeg = geldig. */
export function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return ['schema ontbreekt'];
  switch (schedule.type) {
    case 'weekdays': {
      const days = schedule.weekdays;
      if (!Array.isArray(days) || days.length === 0) return ['kies minstens één weekdag'];
      if (!days.every((d) => isInt(d, 0, 6))) return ['weekdagen moeten 0 (ma) t/m 6 (zo) zijn'];
      if (new Set(days).size !== days.length) return ['weekdagen mogen niet dubbel voorkomen'];
      return [];
    }
    case 'times_per_period': {
      if (schedule.period !== 'week' && schedule.period !== 'month') return ['periode moet week of month zijn'];
      const max = schedule.period === 'week' ? 7 : 31;
      return isInt(schedule.count, 1, max) ? [] : [`aantal moet een geheel getal van 1 t/m ${max} zijn`];
    }
    case 'day_of_month':
      return isInt(schedule.day, 1, 31) ? [] : ['dag van de maand moet 1 t/m 31 zijn'];
    default:
      return ['onbekend type schema'];
  }
}

export function validateSchedules(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return ['minstens één schema vereist'];
  const errors = [];
  for (const v of versions) {
    if (!isValidDate(v?.effectiveFrom)) errors.push('ongeldige ingangsdatum');
    else errors.push(...validateSchedule(v.schedule));
  }
  return errors;
}

/** Het schema dat op `date` geldt: de laatste versie met effectiveFrom <= date, of null. */
export function scheduleAt(versions, date) {
  let found = null;
  for (const v of versions) {
    if (v.effectiveFrom <= date && (found === null || v.effectiveFrom >= found.effectiveFrom)) found = v;
  }
  return found ? found.schedule : null;
}

export const isFlexible = (schedule) => schedule?.type === 'times_per_period';

/** Kalenderbegrenzing van de week of maand waarin `date` valt. */
export function periodBounds(date, period) {
  return period === 'week'
    ? { start: startOfWeek(date), end: endOfWeek(date) }
    : { start: startOfMonth(date), end: endOfMonth(date) };
}

/** Vervaldatum van een 'dag van de maand'-schema in de maand van `date`; korte maand -> laatste dag. */
export function dueDateInMonth(day, date) {
  const dim = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  return `${date.slice(0, 8)}${String(Math.min(day, dim)).padStart(2, '0')}`;
}

