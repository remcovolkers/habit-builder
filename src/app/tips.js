// Welke tip hoort bij de situatie van een habit? Puur en deterministisch (eerste regel die past wint).
import { PHASE_STARTING_UNTIL_DAY } from '../domain/constants.js';
import { isClosed } from '../domain/units.js';

const DIP_UNTIL_DAY = 21;
const CUE_UNTIL_DAY = 42;

/**
 * phase: 'planned' | 'starting' | 'building' | 'established'
 * Geeft een sleutel uit content/tips.js.
 */
export function pickTip({ phase, activeDays, graduationDays, units, pausedNow }) {
  if (phase === 'planned') return 'planned';
  if (pausedNow) return 'paused';
  if (phase === 'established') return 'maintain';

  const lastClosed = units.filter(isClosed).at(-1);
  if (lastClosed?.status === 'missed') return 'never_miss_twice';

  if (activeDays <= PHASE_STARTING_UNTIL_DAY - 14) return 'start_small'; // eerste week
  if (activeDays <= DIP_UNTIL_DAY) return 'dip';
  if (activeDays <= CUE_UNTIL_DAY) return 'cue';
  if (activeDays >= graduationDays - 14) return 'automatic';
  return 'identity';
}
