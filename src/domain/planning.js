// Hoeveel van de keren die een flexibele taak nog moet, hoeven nu een dag te krijgen? Puur.
// Bij "N× per week" alle keren die nog moeten: de week is zelf het venster van Plan je week. Bij "N× per maand" maar je deel van het venster:
// de rest plan je later in de maand, anders blijft de herinnering "Nog 1 taak om in te plannen" staan voor iets dat nog weken de tijd heeft.
import { PLAN_AHEAD_DAYS } from './constants.js';

/** Het venster van Plan je week: vandaag en PLAN_AHEAD_DAYS dagen vooruit. */
export const PLAN_WINDOW_DAYS = PLAN_AHEAD_DAYS + 1;

/**
 * span: 'week' | 'month'; open: hoeveel keren er nog moeten (afspraak min gedaan); remainingDays: hoeveel dagen er in de periode nog over zijn.
 * Maand: je eerlijke deel van het venster (open × venster / dagen over, naar beneden afgerond, minstens één); eindigt de maand binnen het venster,
 * dan alles wat nog moet. Voorbeeld: 2× per maand en nog 13 dagen over geeft 1 (de tweede plan je later), nog 6 dagen over geeft 2.
 */
export function neededInWindow({ span, open, remainingDays }) {
  if (!(open > 0)) return 0;
  if (span !== 'month' || !(remainingDays > PLAN_WINDOW_DAYS)) return open;
  return Math.min(open, Math.max(1, Math.floor((open * PLAN_WINDOW_DAYS) / remainingDays)));
}
