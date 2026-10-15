// Alles wat de UI per habit wil weten, in één aanroep. Puur: invoer in, cijfers uit.
import { DEFAULT_GRADUATION_DAYS } from './constants.js';
import { evaluateGraduation } from './graduation.js';
import { countActiveDays, phaseFor } from './phases.js';
import { computeConsistency, computeStreaks } from './streaks.js';
import { computeStrength } from './strength.js';
import { computeUnits } from './units.js';

/**
 * habit: zie units.js, plus { id, status, graduationDays?, graduatedAt? }
 * automaticityScore: laatste zelfrapportage (1–5) of null; useAutomaticity: weegt mee voor ingeburgerd.
 */
export function buildHabitStats({
  habit,
  checkIns = [],
  pauses = [],
  today,
  useAutomaticity = false,
  automaticityScore = null,
}) {
  const units = computeUnits({ habit, checkIns, pauses, today });
  const consistency = computeConsistency(units, { today });
  const activeDays = countActiveDays({ habit, pauses, today });
  const graduationDays = habit.graduationDays ?? DEFAULT_GRADUATION_DAYS;
  const graduated = habit.status === 'graduated' || Boolean(habit.graduatedAt);

  const loggedByDate = new Map();
  for (const c of checkIns) loggedByDate.set(c.date, c.status);
  const doneDates = [...loggedByDate].filter(([, s]) => s === 'done' || s === 'minimal').map(([d]) => d).sort();

  return {
    habitId: habit.id,
    habitStatus: habit.status,
    graduated,
    units,
    streaks: computeStreaks(units),
    consistency,
    strength: computeStrength(units),
    activeDays,
    phase: phaseFor({ activeDays, graduationDays, graduated }),
    graduation: evaluateGraduation({
      activeDays,
      graduationDays,
      consistencyRate: consistency.rate,
      useAutomaticity,
      automaticityScore,
    }),
    totalDone: doneDates.length,
    lastDoneDate: doneDates.at(-1) ?? null,
  };
}
