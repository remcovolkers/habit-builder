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
 */
export function phaseFor({ activeDays, graduationDays = DEFAULT_GRADUATION_DAYS, graduated = false }) {
  let phase;
  if (graduated) phase = 'established';
  else if (activeDays <= 0) phase = 'planned';
  else if (activeDays <= PHASE_STARTING_UNTIL_DAY) phase = 'starting';
  else phase = 'building';
  return { phase, day: activeDays, graduationDays, progress: Math.min(1, Math.max(0, activeDays / graduationDays)) };
}
