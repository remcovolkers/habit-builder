// Hoeveel van de keren die een flexibele taak nog moet, hoeven nu een dag te krijgen? Puur.
// Bij "N× per week" alle keren die nog moeten: de week is zelf het venster van Plan je week. Bij "N× per maand" maar je deel van het venster:
// de rest plan je later in de maand, anders blijft de herinnering "Nog 1 taak om in te plannen" staan voor iets dat nog weken de tijd heeft.
import { PLAN_AHEAD_DAYS } from './constants.js';
import { addDays, diffDays } from './dates.js';

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

/**
 * Is deze week de laatste kans voor een taak per maand? Dat is zo als wat nog moet en nog geen dag heeft (`open` min `planned`) niet meer past in de
 * dagen die na deze week nog in de maand zitten: slaat de gebruiker de taak deze week over, dan is het doel niet meer te halen.
 * unitEnd: de laatste dag van de maand; weekEnd: de laatste dag (zondag) van de week waarin we plannen.
 * Geeft { lastChance, daysAfter } (daysAfter: hoeveel dagen er na deze week nog over zijn; 0 in de laatste week van de maand).
 */
export function lastChanceThisWeek({ span, open, planned = 0, unitEnd, weekEnd }) {
  const daysAfter = Math.max(0, diffDays(unitEnd, weekEnd));
  if (span !== 'month' || !(open > 0)) return { lastChance: false, daysAfter };
  return { lastChance: Math.max(0, open - planned) > daysAfter, daysAfter };
}

/**
 * "Niet in deze week" (Plan je week) is per week: `habit.noPlanWeeks` bevat de maandagen waarvoor de taak niet ingepland hoeft te worden.
 * (`noPlanWeek`, één maandag, is het oudere veld: het telt nog mee en verdwijnt zodra de keuze wordt aangepast.)
 */
export const planSkippedIn = (habit, weekStart) => habit.noPlanWeek === weekStart || (habit.noPlanWeeks ?? []).includes(weekStart);

/**
 * De habit met de keuze voor de week van `weekStart` aan of uit; de keuzes voor andere weken blijven staan, behalve wat al voorbij is
 * (alleen de week ervoor, de lopende en de volgende kunnen nog gekozen zijn: oudere weken worden opgeruimd).
 */
export function withPlanSkip(habit, weekStart, skipped) {
  const { noPlanWeek, noPlanWeeks, ...rest } = habit;
  const oldest = addDays(weekStart, -7);
  const weeks = [...new Set([...(noPlanWeeks ?? []), ...(noPlanWeek ? [noPlanWeek] : [])])].filter((week) => week >= oldest && week !== weekStart);
  if (skipped) weeks.push(weekStart);
  return weeks.length > 0 ? { ...rest, noPlanWeeks: weeks.sort() } : rest;
}
