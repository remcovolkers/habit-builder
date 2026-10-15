// Gewoontesterkte (PLAN §4.4): een voortschrijdend gemiddelde over afgesloten eenheden.
// Een gemiste eenheid verlaagt de score een beetje en reset niets, in tegenstelling tot een harde streak.
import { STRENGTH_ALPHA } from './constants.js';
import { isClosed, isPositive } from './units.js';

/** Geeft 0..1. Eenheden wegen mee naar hun lengte: een weekeenheid is a = alpha^7. */
export function computeStrength(units, alpha = STRENGTH_ALPHA) {
  let s = 0;
  for (const unit of units) {
    if (!isClosed(unit)) continue;
    const a = alpha ** unit.days;
    s = s * a + (isPositive(unit) ? 1 : 0) * (1 - a);
  }
  return s;
}
