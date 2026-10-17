// Dreigt een flexibele taak (N× per week of maand) te falen, ruim voordat het echt niet meer kan? Puur.
// "Echt niet meer kan" is `atRisk` (units.js: er zijn minder dagen over dan keren die nog moeten). Dit is de mildere waarschuwing eerder:
// het stuk van de periode dat nog over is, is kleiner dan TIGHT_RATIO keer het stuk van de afspraak dat nog moet.
import { TIGHT_RATIO } from './constants.js';

/**
 * unit: een eenheid uit computeUnits met { count, target, remainingDays, days } (week of maand).
 * Voorbeelden bij 2× per week: donderdag 0 gedaan (4 van 7 dagen over): krap; donderdag 1 gedaan: niet; woensdag 0 gedaan (5 van 7): nog niet.
 */
export function isTight({ count, target, remainingDays, days }) {
  const needed = target - count;
  if (!(needed > 0) || !(target > 0) || !(days > 0)) return false;
  return remainingDays / days < TIGHT_RATIO * (needed / target);
}
