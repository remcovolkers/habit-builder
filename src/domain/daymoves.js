// Een taak voor één dag naar een ander dagdeel zetten ("vandaag doe ik de wandeling pas 's avonds"). De habit zelf verandert niet: morgen staat hij weer
// in zijn eigen dagdeel. Het werkt voor elke taak op Vandaag, ook een vrij in te plannen taak (die staat pas op een dag als je hem inplant). Puur.
//
//   verplaatsing = { id: 'habitId|datum|van', habitId, date, from, to }
//   from = het eigen dagdeel van de kaart (bij een habit met meerdere dagdelen: dat ene dagdeel), to = waar hij die dag staat
import { isValidDate } from './dates.js';
import { DAYPARTS } from './habit.js';
import { habitDayparts } from './dayparts.js';

export const dayMoveId = (habitId, date, from) => `${habitId}|${date}|${from}`;

/** Geeft [{ field, code }]; leeg = geldig. Een verplaatsing naar het eigen dagdeel bestaat niet: dat is terugzetten. */
export function validateDayMove({ habitId, date, from, to }) {
  const errors = [];
  if (!habitId) errors.push({ field: 'habitId', code: 'required' });
  if (!isValidDate(date)) errors.push({ field: 'date', code: 'invalid' });
  if (!DAYPARTS.includes(from)) errors.push({ field: 'from', code: 'invalid' });
  if (!DAYPARTS.includes(to) || to === from) errors.push({ field: 'to', code: 'invalid' });
  return errors;
}

/** De verplaatsingen van één dag als `habitId|van` → naar. */
export function movesOn(dayMoves, date) {
  const moves = new Map();
  for (const move of dayMoves) if (move.date === date) moves.set(`${move.habitId}|${move.from}`, move.to);
  return moves;
}

/** Waar staat dit dagdeel van de habit op deze dag? */
export const effectiveDaypart = (moves, habitId, part) => moves.get(`${habitId}|${part}`) ?? part;

/**
 * Naar welke dagdelen mag deze kaart? Alle andere dan waar hij nu staat, behalve waar al een ander dagdeel van dezelfde habit staat
 * (tandenpoetsen 's ochtends en 's avonds: de ochtend gaat niet naar de avond, want daar staat al een kaart van die habit).
 */
export function moveTargets(habit, part, moves) {
  const here = effectiveDaypart(moves, habit.id, part);
  const taken = new Set(habitDayparts(habit).filter((other) => other !== part).map((other) => effectiveDaypart(moves, habit.id, other)));
  return DAYPARTS.filter((daypart) => daypart !== here && !taken.has(daypart));
}
