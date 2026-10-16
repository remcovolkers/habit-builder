// Ingeburgerd (PLAN §4.5): de app stelt het voor, de gebruiker bevestigt.
import {
  AUTOMATICITY_THRESHOLD,
  CONSISTENCY_THRESHOLD,
  DEFAULT_GRADUATION_DAYS,
} from './constants.js';

/**
 * Alle criteria moeten gelden:
 *   days         ≥ graduationDays actieve dagen (standaard 66)
 *   repetitions  ≥ requiredRepetitions keer gedaan (zie pace.js) — alleen als het ritme bekend is
 *   consistency  ≥ 80% over het consistentievenster
 *   automaticity ≥ 4 op de laatste zelfrapportage — alleen als useAutomaticity aan staat (verplicht bij zeldzame taken)
 */
export function evaluateGraduation({
  activeDays,
  graduationDays = DEFAULT_GRADUATION_DAYS,
  repetitions = 0,
  requiredRepetitions = null,
  consistencyRate,
  useAutomaticity = false,
  automaticityScore = null,
}) {
  const criteria = [
    { key: 'days', met: activeDays >= graduationDays, value: activeDays, required: graduationDays },
  ];
  if (requiredRepetitions !== null) {
    criteria.push({ key: 'repetitions', met: repetitions >= requiredRepetitions, value: repetitions, required: requiredRepetitions });
  }
  criteria.push({
    key: 'consistency',
    met: consistencyRate !== null && consistencyRate !== undefined && consistencyRate >= CONSISTENCY_THRESHOLD,
    value: consistencyRate ?? null,
    required: CONSISTENCY_THRESHOLD,
  });
  if (useAutomaticity) {
    criteria.push({
      key: 'automaticity',
      met: automaticityScore !== null && automaticityScore >= AUTOMATICITY_THRESHOLD,
      value: automaticityScore,
      required: AUTOMATICITY_THRESHOLD,
    });
  }
  return { eligible: criteria.every((c) => c.met), criteria };
}
