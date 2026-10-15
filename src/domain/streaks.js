// Reeksen en consistentie (PLAN §4.4), berekend uit eenheden.
import { addDays } from './dates.js';
import { CONSISTENCY_WINDOW_DAYS, CONSISTENCY_WINDOW_MIN_PERIODS } from './constants.js';
import { isClosed, isPositive } from './units.js';

/**
 * Reeks = opeenvolgende gedane eenheden zonder gemiste. Overgeslagen, gepauzeerde en nog open
 * eenheden onderbreken niet en tellen niet mee. Bij flexibele habits is de eenheid de week/maand.
 */
export function computeStreaks(units) {
  let current = 0;
  let best = 0;
  for (const unit of units) {
    if (isPositive(unit)) {
      current += 1;
      if (current > best) best = current;
    } else if (unit.status === 'missed') {
      current = 0;
    }
  }
  return { current, best };
}

/**
 * Consistentie = gedaan ÷ (gedaan + gemist) over de laatste `windowDays` dagen.
 * Eindigt de laatste afgesloten eenheid op een maand en zijn er dan minder dan `minPeriods`
 * eenheden in het venster, dan worden het de laatste `minPeriods` afgesloten eenheden.
 * rate is null zolang er niets is afgesloten.
 */
export function computeConsistency(
  units,
  { today, windowDays = CONSISTENCY_WINDOW_DAYS, minPeriods = CONSISTENCY_WINDOW_MIN_PERIODS },
) {
  const closed = units.filter(isClosed);
  const windowStart = addDays(today, -(windowDays - 1));
  let inWindow = closed.filter((u) => u.end >= windowStart);
  if (closed.at(-1)?.span === 'month' && inWindow.length < minPeriods) inWindow = closed.slice(-minPeriods);
  const done = inWindow.filter(isPositive).length;
  const missed = inWindow.length - done;
  return { done, missed, total: inWindow.length, rate: inWindow.length === 0 ? null : done / inWindow.length };
}
