// Ingeburgerd (PLAN §4.5): de app stelt het voor, de gebruiker bevestigt.
import {
  AUTOMATICITY_CONFIRMATIONS,
  AUTOMATICITY_THRESHOLD,
  CONSISTENCY_THRESHOLD,
  DEFAULT_GRADUATION_DAYS,
} from './constants.js';

/**
 * Alle criteria moeten gelden:
 *   days         ≥ graduationDays actieve dagen (standaard 66)
 *   repetitions  ≥ requiredRepetitions keer gedaan (zie pace.js) — alleen als het ritme bekend is
 *   consistency  ≥ 80% over het consistentievenster
 *   automaticity ≥ 4 in de laatste twee zelfrapportages (of één keer ≥ 4 na een geslaagde proef zonder app) — alleen als useAutomaticity
 *                aan staat (verplicht bij zeldzame taken). Eén gelukkig cijfer is te weinig: het gaat om wat blijft.
 */
export function evaluateGraduation({
  activeDays,
  graduationDays = DEFAULT_GRADUATION_DAYS,
  repetitions = 0,
  requiredRepetitions = null,
  consistencyRate,
  useAutomaticity = false,
  automaticityScores = [],
  trialPassed = false,
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
    const scores = automaticityScores.slice(-AUTOMATICITY_CONFIRMATIONS);
    const latest = scores.at(-1) ?? null;
    let run = 0; // hoe vaak de laatste cijfers achter elkaar goed zijn
    for (let i = scores.length - 1; i >= 0 && scores[i] >= AUTOMATICITY_THRESHOLD; i -= 1) run += 1;
    const confirmed = run + (trialPassed && latest !== null && latest >= AUTOMATICITY_THRESHOLD ? 1 : 0);
    criteria.push({
      key: 'automaticity',
      met: confirmed >= AUTOMATICITY_CONFIRMATIONS,
      value: latest,
      required: AUTOMATICITY_THRESHOLD,
      confirmed: Math.min(confirmed, AUTOMATICITY_CONFIRMATIONS),
      needed: AUTOMATICITY_CONFIRMATIONS,
      trialPassed,
    });
  }
  return { eligible: criteria.every((c) => c.met), criteria };
}
