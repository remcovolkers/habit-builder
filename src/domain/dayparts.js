// Een habit met meerdere dagdelen ("tandenpoetsen 's ochtends en 's avonds"): elk dagdeel vink je apart af. Het werkt als een teller met een
// vast doel: de dag is gedaan als alle dagdelen gedaan zijn, en daaronder staat hij op 'partial' (zie domain/counter.js). Zo rekenen punten,
// aandacht en het overzicht er zonder aanpassing mee.
//
//   habit.dayparts  = ['morning', 'evening'] (alleen bij twee of meer; anders ontbreekt het) en habit.daypart = het eerste
//   check-in.parts  = welke dagdelen gedaan zijn, bij een deels of volledig gedane dag van zo'n habit
import { sortDayparts } from './habit.js';

/** De dagdelen van een habit, in de volgorde van de dag (één bij een gewone habit). */
export const habitDayparts = (habit) => (Array.isArray(habit.dayparts) && habit.dayparts.length > 1 ? habit.dayparts : [habit.daypart]);

export const hasMultipleDayparts = (habit) => habitDayparts(habit).length > 1;

/**
 * Welke dagdelen zijn gedaan volgens een check-in ({ status, parts? }, of niets)? Een volledig gedane of minimale dag telt voor alle dagdelen,
 * ook als hij is gelogd vóór de habit meerdere dagdelen kreeg; overslaan telt voor geen.
 */
export function donePartsOf(habit, checkIn) {
  const all = habitDayparts(habit);
  if (!checkIn) return [];
  if (checkIn.status === 'done' || checkIn.status === 'minimal') return Array.isArray(checkIn.parts) ? sortDayparts(checkIn.parts.filter((p) => all.includes(p))) : all;
  if (checkIn.status === 'partial' && Array.isArray(checkIn.parts)) return sortDayparts(checkIn.parts.filter((p) => all.includes(p)));
  return [];
}

/** 'done' | 'partial' | null (niets gedaan), uit het aantal gedane dagdelen. */
export function partsStatus(done, total) {
  if (!(done > 0)) return null;
  return done >= total ? 'done' : 'partial';
}
