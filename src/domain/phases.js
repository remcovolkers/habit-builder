// Actieve dagen en fases (PLAN §2 en §4.5).
import { addDays, diffDays } from './dates.js';
import { DEFAULT_GRADUATION_DAYS, PHASE_STARTING_UNTIL_DAY } from './constants.js';

/** Dagen sinds de start (inclusief vandaag), zonder gepauzeerde dagen. */
export function countActiveDays({ habit, pauses = [], today }) {
  const { startDate, endDate = null } = habit;
  const last = endDate !== null && endDate < today ? endDate : today;
  if (startDate > last) return 0;

  const ranges = pauses
    .map((p) => [p.from > startDate ? p.from : startDate, p.to == null || p.to > last ? last : p.to])
    .filter(([from, to]) => from <= to)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  let paused = 0;
  let cursor = null; // laatste dag die al als gepauzeerd is geteld
  for (const [from, to] of ranges) {
    const effectiveFrom = cursor !== null && from <= cursor ? addDays(cursor, 1) : from;
    if (effectiveFrom > to) continue;
    paused += diffDays(to, effectiveFrom) + 1;
    cursor = to;
  }
  return diffDays(last, startDate) + 1 - paused;
}

/**
 * 'planned' (nog niet gestart) → 'starting' (t/m dag 21) → 'building' → 'established' (alleen als
 * de gebruiker de habit ingeburgerd heeft verklaard).
 *
 * Standaard loopt de voortgang in actieve dagen. Met `times` (zeldzame taken) loopt hij in keren:
 * { repetitions, required, startingUntil }. `day` en `total` staan dan in die eenheid (`unit`: 'days' | 'times').
 */
export function phaseFor({ activeDays, graduationDays = DEFAULT_GRADUATION_DAYS, graduated = false, times = null }) {
  const day = times ? times.repetitions : activeDays;
  const total = times ? times.required : graduationDays;
  const startingUntil = times ? times.startingUntil : PHASE_STARTING_UNTIL_DAY;

  let phase;
  if (graduated) phase = 'established';
  else if (activeDays <= 0) phase = 'planned';
  else if (day <= startingUntil) phase = 'starting';
  else phase = 'building';
  return {
    phase,
    unit: times ? 'times' : 'days',
    day,
    total,
    startingUntil,
    graduationDays,
    progress: Math.min(1, Math.max(0, day / total)),
  };
}
