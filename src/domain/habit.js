// Validatie van een habit-record. Geeft foutcodes terug; de UI vertaalt ze via content/nl.js.
import { COUNTER_MAX, COUNTER_UNIT_MAX } from './counter.js';
import { isValidDate } from './dates.js';
import { validateSchedules } from './schedule.js';

export const DAYPARTS = Object.freeze(['morning', 'afternoon', 'evening', 'anytime']);
/** De dagdelen waarop een habit er meerdere kan hebben ("tandenpoetsen 's ochtends en 's avonds"). "Overdag" is geen dagdeel om te combineren. */
export const SPLIT_DAYPARTS = Object.freeze(['morning', 'afternoon', 'evening']);
export const HABIT_STATUSES = Object.freeze(['planned', 'active', 'graduated', 'archived']);
export const HABIT_COLORS = Object.freeze(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
export const CHECK_IN_STATUSES = Object.freeze(['done', 'minimal', 'skipped', 'partial']);

export const NAME_MAX = 60;
export const TEXT_MAX = 200;

/** De dagdelen van een lijst, in de volgorde van de dag. */
export const sortDayparts = (parts) => [...parts].sort((a, b) => DAYPARTS.indexOf(a) - DAYPARTS.indexOf(b));

/** Een geldige lijst: unieke dagdelen uit SPLIT_DAYPARTS, in de volgorde van de dag. `min` = het kleinste aantal. */
export const validParts = (parts, min = 1) => Array.isArray(parts) && parts.length >= min && parts.length <= SPLIT_DAYPARTS.length
  && new Set(parts).size === parts.length && parts.every((part) => SPLIT_DAYPARTS.includes(part))
  && parts.every((part, i) => i === 0 || DAYPARTS.indexOf(parts[i - 1]) < DAYPARTS.indexOf(part));

/**
 * Geeft [{ field, code, detail? }]; leeg = geldig.
 * habit: { name, icon, color, daypart, startDate, status, cue?, why?, minimalVersion?, graduationDays?, noPlanWeek?, schedules }
 */
export function validateHabit(habit) {
  const errors = [];
  const add = (field, code, detail) => errors.push(detail ? { field, code, detail } : { field, code });

  const name = typeof habit.name === 'string' ? habit.name.trim() : '';
  if (!name) add('name', 'required');
  else if (name.length > NAME_MAX) add('name', 'too_long');

  if (typeof habit.icon !== 'string' || habit.icon.trim() === '') add('icon', 'required');
  if (!HABIT_COLORS.includes(habit.color)) add('color', 'invalid');
  if (!DAYPARTS.includes(habit.daypart)) add('daypart', 'invalid');
  if (!HABIT_STATUSES.includes(habit.status)) add('status', 'invalid');
  if (!isValidDate(habit.startDate)) add('startDate', 'invalid');
  if (habit.endDate != null && !isValidDate(habit.endDate)) add('endDate', 'invalid');

  // "Niet in deze week" bij Plan je week: de maandag van de week waarvoor de taak niet ingepland hoeft te worden
  if (habit.noPlanWeek != null && !isValidDate(habit.noPlanWeek)) add('noPlanWeek', 'invalid');

  for (const field of ['cue', 'why', 'minimalVersion']) {
    if (habit[field] != null && String(habit[field]).length > TEXT_MAX) add(field, 'too_long');
  }

  if (habit.graduationDays != null && !(Number.isInteger(habit.graduationDays) && habit.graduationDays >= 7 && habit.graduationDays <= 365)) {
    add('graduationDays', 'invalid');
  }

  const scheduleErrors = validateSchedules(habit.schedules);
  for (const detail of scheduleErrors) add('schedule', 'invalid', detail);
  if (scheduleErrors.length === 0 && isValidDate(habit.startDate)) {
    const earliest = habit.schedules.map((s) => s.effectiveFrom).sort()[0];
    if (earliest > habit.startDate) add('schedule', 'starts_after_habit');
  }

  // meerdere dagdelen: minstens twee, het eerste is ook `daypart` (oudere appversies kennen alleen dat), en alleen bij vaste weekdagen en zonder teller
  if (habit.dayparts != null) {
    if (!validParts(habit.dayparts, 2) || habit.daypart !== habit.dayparts[0]) add('dayparts', 'invalid');
    else if (habit.counter != null) add('dayparts', 'no_counter');
    else if (scheduleErrors.length === 0 && habit.schedules.some((s) => s.schedule.type !== 'weekdays')) add('dayparts', 'needs_weekdays');
  }

  if (habit.counter != null) {
    const unit = typeof habit.counter.unit === 'string' ? habit.counter.unit.trim() : '';
    if (!unit) add('counterUnit', 'required');
    else if (unit.length > COUNTER_UNIT_MAX) add('counterUnit', 'too_long');
    const { target } = habit.counter;
    if (target != null && !(Number.isInteger(target) && target >= 1 && target <= COUNTER_MAX)) add('counterTarget', 'invalid');
    // een dagteller past alleen bij vaste weekdagen; "N× per week" telt dagen, geen hoeveelheden
    if (scheduleErrors.length === 0 && habit.schedules.some((s) => s.schedule.type !== 'weekdays')) add('counter', 'needs_weekdays');
  }
  return errors;
}
