// Ingeburgerd (PLAN §4.5): de app stelt het voor, de gebruiker bevestigt.
import {
  AUTOMATICITY_THRESHOLD,
  CONSISTENCY_THRESHOLD,
  DEFAULT_GRADUATION_DAYS,
} from './constants.js';

/**
 * Alle criteria moeten gelden:
 *   days         ≥ graduationDays actieve dagen (standaard 66)
 *   consistency  ≥ 80% over het consistentievenster
 *   automaticity ≥ 4 op de laatste zelfrapportage — alleen als useAutomaticity aan staat
 */
export function evaluateGraduation({
  activeDays,
  graduationDays = DEFAULT_GRADUATION_DAYS,
  consistencyRate,
  useAutomaticity = false,
  automaticityScore = null,
}) {
  const criteria = [
    { key: 'days', met: activeDays >= graduationDays, value: activeDays, required: graduationDays },
    {
      key: 'consistency',
      met: consistencyRate !== null && consistencyRate !== undefined && consistencyRate >= CONSISTENCY_THRESHOLD,
      value: consistencyRate ?? null,
      required: CONSISTENCY_THRESHOLD,
    },
  ];
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
