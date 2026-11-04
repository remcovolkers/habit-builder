// Een dagreflectie: hoe ging deze dag? Eén cijfer van 1 tot 5 en een korte notitie, per dag. Het is voor jezelf en telt nergens mee (punten, reeksen,
// aandacht): je ziet het terug in de weekreview. Puur.
//
//   reflectie = { id: datum, date, score, note }
import { NOTE_MAX_LENGTH } from './constants.js';
import { isValidDate } from './dates.js';

export const REFLECTION_SCORES = Object.freeze([1, 2, 3, 4, 5]);

/** Geeft [{ field, code }]; leeg = geldig. */
export function validateReflection({ date, score, note = null }) {
  const errors = [];
  if (!isValidDate(date)) errors.push({ field: 'date', code: 'invalid' });
  if (!REFLECTION_SCORES.includes(score)) errors.push({ field: 'score', code: 'invalid' });
  if (note !== null && typeof note !== 'string') errors.push({ field: 'note', code: 'invalid' });
  else if (note !== null && note.trim().length > NOTE_MAX_LENGTH) errors.push({ field: 'note', code: 'too_long' });
  return errors;
}

/** De reflecties van een periode (van t/m tot), op datum. */
export const reflectionsBetween = (reflections, from, to) => reflections
  .filter((r) => r.date >= from && r.date <= to)
  .sort((a, b) => a.date.localeCompare(b.date));

/** Het gemiddelde cijfer (op één decimaal), of null zonder reflecties. */
export function averageScore(reflections) {
  if (reflections.length === 0) return null;
  return Math.round((reflections.reduce((sum, r) => sum + r.score, 0) / reflections.length) * 10) / 10;
}
