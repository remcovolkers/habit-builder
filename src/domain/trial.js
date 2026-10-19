// De proef "zonder app" (docs/AUTOMATISME.md): een flexibele taak (N× per week of maand) een hele week of maand zonder herinnering of kaartje
// van de app doen. Aan het eind staat in de review de vraag of het gelukt is. Puur.
//
// Een proef staat op de habit zelf: habit.trials = [{ period, start, end, result, answeredOn }]
//   period      'week' | 'month': de eenheid van de taak (bij het begin van de proef)
//   start, end  de hele week (maandag t/m zondag) of maand
//   result      null (nog niet beantwoord) | 'passed' | 'failed'
//   answeredOn  de dag van het antwoord, of null
// Zonder antwoord vóór de review sluit is een proef "verlopen": de app helpt weer, zonder wachttijd.
import { addDays, addMonths, endOfMonth, endOfWeek, isValidDate, startOfMonth, startOfWeek } from './dates.js';
import { monthReviewState, weekReviewState } from './reviews.js';
import { recentScores } from './automaticity.js';
import { scheduleAt } from './schedule.js';

export const TRIAL_PERIODS = Object.freeze(['week', 'month']);
export const TRIAL_RESULTS = Object.freeze(['passed', 'failed']);
/** Een proef kan pas als de laatste twee cijfers minstens dit zijn. */
export const TRIAL_MIN_SCORE = 3;
export const TRIAL_MIN_RATINGS = 2;
/** Na een mislukte proef helpt de app weer: een week-taak 4 hele weken, een maand-taak 2 hele maanden (gerekend vanaf het eind van de proef). */
export const TRIAL_COOLDOWN_DAYS = 28;
export const TRIAL_COOLDOWN_MONTHS = 2;
/** Zoveel proeven bewaren we per habit (de oudste vallen af). */
export const TRIALS_KEPT = 12;

export const trialsOf = (habit) => (Array.isArray(habit?.trials) ? habit.trials : []);

/** Geeft [{ field, code }]; leeg = geldig. Voor validateHabit. */
export function validateTrials(trials) {
  if (trials == null) return [];
  if (!Array.isArray(trials) || trials.length > TRIALS_KEPT * 2) return [{ field: 'trials', code: 'invalid' }];
  const bad = trials.some((trial) => !trial || !TRIAL_PERIODS.includes(trial.period) || !isValidDate(trial.start) || !isValidDate(trial.end) || trial.end < trial.start
    || (trial.result != null && !TRIAL_RESULTS.includes(trial.result)) || (trial.answeredOn != null && !isValidDate(trial.answeredOn)));
  return bad ? [{ field: 'trials', code: 'invalid' }] : [];
}

/** De week of maand van een taak: 'week' | 'month' voor een flexibele taak op `date`, anders null (een proef is alleen voor flexibele taken). */
export function trialPeriodOf(habit, date) {
  const schedule = scheduleAt(habit.schedules, date);
  return schedule?.type === 'times_per_period' ? schedule.period : null;
}

const rangeOf = (period, date) => (period === 'month' ? { start: startOfMonth(date), end: endOfMonth(date) } : { start: startOfWeek(date), end: endOfWeek(date) });

/** Waar begint een proef die je nu start? Vandaag als dat de eerste dag van de week of maand is, anders de eerstvolgende. { start, end }. */
export function trialRangeFrom(period, today) {
  const current = rangeOf(period, today);
  return current.start === today ? current : rangeOf(period, addDays(current.end, 1));
}

/** Hoe laat de review van deze proef open staat: dezelfde als de review van de week of maand ervan. */
const reviewState = (trial, now) => (trial.period === 'month' ? monthReviewState(trial.start, now) : weekReviewState(trial.start, now));

/**
 * In welke stand is een proef op `today`/`now`?
 *   planned    begint nog
 *   running    loopt (en de review staat nog niet open)
 *   answer     de review staat open en er is nog geen antwoord: hier hoort de vraag
 *   passed | failed   beantwoord
 *   expired    de review is dicht en er kwam geen antwoord
 */
export function trialStatus(trial, today, now) {
  if (trial.result) return trial.result;
  if (today < trial.start) return 'planned';
  const state = reviewState(trial, now);
  if (state === 'open') return 'answer';
  return state === 'closed' ? 'expired' : 'running';
}

/** De proef die nu speelt (gepland, loopt of wacht op antwoord), of null. Hoogstens één. */
export function currentTrial(habit, today, now) {
  return trialsOf(habit).find((trial) => ['planned', 'running', 'answer'].includes(trialStatus(trial, today, now))) ?? null;
}

/**
 * Houdt de app zich in? Dat is zo van het begin van de proef tot het eind van de week of maand, tenzij het antwoord "mislukt" was
 * (dan helpt de app direct weer). Op Vandaag staat de taak dan niet in de stapel, er komt geen herinnering en Plan je week slaat hem over.
 */
export const isOnTrial = (habit, date) => trialsOf(habit).some((trial) => trial.result !== 'failed' && trial.start <= date && date <= trial.end);

/**
 * Wanneer mag er na een mislukte proef weer een nieuwe? De eerste dag, of null als er geen wachttijd loopt. De app helpt dan TRIAL_COOLDOWN_DAYS dagen
 * (4 weken) of TRIAL_COOLDOWN_MONTHS maanden, vanaf de dag na het eind van de proef: de maandag na vier weken, de eerste dag na twee maanden.
 */
export function trialCooldownUntil(habit) {
  const failed = trialsOf(habit).filter((trial) => trial.result === 'failed').sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (!failed) return null;
  return failed.period === 'month' ? addMonths(failed.end, 1 + TRIAL_COOLDOWN_MONTHS) : addDays(failed.end, 1 + TRIAL_COOLDOWN_DAYS);
}

/** Is er ooit een proef geslaagd? Dat telt als bewijs voor het automatisme (zie graduation.js). */
export const hasPassedTrial = (habit) => trialsOf(habit).some((trial) => trial.result === 'passed');

/**
 * Kan er nu een proef beginnen? { state, ... }:
 *   available    ja; `range` zegt wanneer hij begint
 *   not_flexible geen taak per week of maand
 *   inactive     de habit is niet lopend
 *   busy         er speelt al een proef (`trial`)
 *   scores       er zijn nog geen twee cijfers van minstens TRIAL_MIN_SCORE (`have` = hoeveel van de laatste twee goed zijn)
 *   cooldown     de vorige proef mislukte; vanaf `until` kan het weer
 */
export function trialOffer({ habit, ratings = [], today, now }) {
  if (habit.status !== 'active') return { state: 'inactive' };
  const period = trialPeriodOf(habit, today);
  if (period === null) return { state: 'not_flexible' };
  const trial = currentTrial(habit, today, now);
  if (trial) return { state: 'busy', trial };
  const until = trialCooldownUntil(habit);
  if (until !== null && today < until) return { state: 'cooldown', until };
  const scores = recentScores(ratings, TRIAL_MIN_RATINGS);
  if (scores.length < TRIAL_MIN_RATINGS || scores.some((score) => score < TRIAL_MIN_SCORE)) return { state: 'scores', have: scores.filter((score) => score >= TRIAL_MIN_SCORE).length };
  return { state: 'available', period, range: trialRangeFrom(period, today) };
}

/** De proeven waar op dit moment een antwoord bij hoort, voor de review van de week of maand `start`: [{ habit, trial }]. */
export function trialsToAnswer({ habits, period, start, today, now }) {
  const found = [];
  for (const habit of habits) {
    for (const trial of trialsOf(habit)) {
      if (trial.period === period && trial.start === start && trialStatus(trial, today, now) === 'answer') found.push({ habit, trial });
    }
  }
  return found;
}
