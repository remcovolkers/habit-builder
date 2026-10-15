// Validatie van een habit-record. Geeft foutcodes terug; de UI vertaalt ze via content/nl.js.
import { isValidDate } from './dates.js';
import { validateSchedules } from './schedule.js';

export const DAYPARTS = Object.freeze(['morning', 'afternoon', 'evening', 'anytime']);
export const HABIT_STATUSES = Object.freeze(['planned', 'active', 'graduated', 'archived']);
export const HABIT_COLORS = Object.freeze(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
export const CHECK_IN_STATUSES = Object.freeze(['done', 'minimal', 'skipped']);

export const NAME_MAX = 60;
export const TEXT_MAX = 200;

/**
 * Geeft [{ field, code, detail? }]; leeg = geldig.
 * habit: { name, icon, color, daypart, startDate, status, cue?, why?, minimalVersion?, graduationDays?, schedules }
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
  return errors;
}
