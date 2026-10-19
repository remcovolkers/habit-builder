// Alles wat de UI per habit wil weten, in één aanroep. Puur: invoer in, cijfers uit.
import { DEFAULT_GRADUATION_DAYS } from './constants.js';
import { evaluateGraduation } from './graduation.js';
import { paceOn } from './pace.js';
import { countActiveDays, phaseFor } from './phases.js';
import { computeConsistency, computeStreaks } from './streaks.js';
import { computeStrength } from './strength.js';
import { computeUnits } from './units.js';

/**
 * habit: zie units.js, plus { id, status, graduationDays?, graduatedAt? }
 * automaticityScores: de zelfrapportages (1–5), oudste eerst; trialPassed: is een proef zonder app geslaagd; useAutomaticity: weegt mee voor
 * ingeburgerd (bij zeldzame taken altijd, zie pace.js).
 */
export function buildHabitStats({
  habit,
  checkIns = [],
  pauses = [],
  today,
  useAutomaticity = false,
  automaticityScores = [],
  trialPassed = false,
}) {
  const units = computeUnits({ habit, checkIns, pauses, today });
  const consistency = computeConsistency(units, { today });
  const activeDays = countActiveDays({ habit, pauses, today });
  const graduationDays = habit.graduationDays ?? DEFAULT_GRADUATION_DAYS;
  const graduated = habit.status === 'graduated' || Boolean(habit.graduatedAt);

  const loggedByDate = new Map();
  for (const c of checkIns) loggedByDate.set(c.date, c.status);
  const doneDates = [...loggedByDate].filter(([, s]) => s === 'done' || s === 'minimal').map(([d]) => d).sort();

  // Het ritme van nu bepaalt hoeveel keren ingeburgerd vraagt; zeldzame taken tellen hun voortgang in keren.
  const pace = paceOn(habit, today);
  const times = pace.sparse
    ? { repetitions: doneDates.length, required: pace.requiredRepetitions, startingUntil: pace.startingRepetitions }
    : null;

  return {
    habitId: habit.id,
    habitStatus: habit.status,
    graduated,
    units,
    streaks: computeStreaks(units),
    consistency,
    strength: computeStrength(units),
    activeDays,
    pace,
    phase: phaseFor({ activeDays, graduationDays, graduated, times }),
    graduation: evaluateGraduation({
      activeDays,
      graduationDays,
      repetitions: doneDates.length,
      requiredRepetitions: pace.requiredRepetitions,
      consistencyRate: consistency.rate,
      useAutomaticity: useAutomaticity || pace.sparse,
      automaticityScores,
      trialPassed,
    }),
    totalDone: doneDates.length,
    lastDoneDate: doneDates.at(-1) ?? null,
  };
}
