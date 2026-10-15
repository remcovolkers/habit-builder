// Kleine regels die op meerdere plekken terugkomen.
import { diffDays } from './dates.js';
import { BACKFILL_DAYS } from './constants.js';

/** Terugwerkend invullen of corrigeren: vandaag t/m 14 dagen terug, nooit in de toekomst. */
export function canBackfill(date, today) {
  const age = diffDays(today, date);
  return age >= 0 && age <= BACKFILL_DAYS;
}

/**
 * Hoort de habit op `today` in de dagelijkse lijsten? Gearchiveerd of afgelopen niet; gepland pas vanaf
 * de startdatum; ingeburgerd alleen in onderhoudsmodus (habit.maintenance).
 */
export function isTracked(habit, today) {
  if (habit.status === 'archived') return false;
  if (habit.startDate > today) return false;
  if (habit.endDate != null && habit.endDate < today) return false;
  if (habit.status === 'graduated') return habit.maintenance === true;
  return true;
}
