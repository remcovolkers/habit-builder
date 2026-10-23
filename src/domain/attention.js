// Aandacht (PLAN §4.9): welke taken vragen om een reactie? Puur: een habit met zijn check-ins in, signalen uit.
//
// Vier soorten, van belangrijk naar minder belangrijk:
//   late    een vaste dag in de maand is voorbij en de taak staat nog open
//   silent  langer niet gedaan dan bij het ritme past (SILENT_FACTOR × de verwachte tussentijd, minstens SILENT_MIN_DAYS)
//   failed  een week of maand is voorbij zonder dat de afspraak gehaald is (bij vaste weekdagen: de gemiste dagen van een week)
//   behind  een week of maand loopt nog, maar de afspraak is niet meer te halen (of het is de laatste dag en hij is niet gehaald)
//
// De eerste (aangebroken) periode telt niet mee: wie midden in de maand begint krijgt niet de volgende dag al een vraag.
// Een reactie (reden) dekt alle signalen die op of vóór de dag van de reactie begonnen (`since`); een nieuw signaal komt pas daarna.
import {
  FAILED_LOOKBACK_DAYS, SILENT_FACTOR, SILENT_MIN_DAYS,
} from './constants.js';
import { addDays, addMonths, diffDays, eachDay, startOfMonth, startOfWeek } from './dates.js';
import { paceOn, scheduleOn } from './pace.js';
import { isTracked } from './rules.js';
import { isOnTrial } from './trial.js';
import { computeUnits } from './units.js';

export const SLIP_REASONS = Object.freeze(['no_time', 'no_money', 'forgot', 'no_motivation', 'busy_sick', 'wrong_rhythm', 'other']);
/** Waarover "ga ik niet doen" gaat voor deze taak op `date`: 'day' (vaste weekdagen), 'week' of 'month'. */
export function wontSpan(habit, date) {
  const schedule = scheduleOn(habit, date);
  if (schedule?.type === 'day_of_month') return 'month';
  return schedule?.type === 'times_per_period' ? schedule.period : 'day';
}

export const ATTENTION_KINDS = Object.freeze(['late', 'silent', 'failed', 'behind']); // volgorde = belang

const counts = (status) => status === 'done' || status === 'minimal';
/** Voor "stil": alles wat laat zien dat je er mee bezig bent, ook een half gehaalde teller en een bewust overgeslagen dag. */
const active = (status) => counts(status) || status === 'partial' || status === 'skipped';

/** Week of maand waarin dit schema "telt": maand bij een maandschema, anders week. */
const spanOf = (schedule) => (schedule?.type === 'day_of_month' || (schedule?.type === 'times_per_period' && schedule.period === 'month') ? 'month' : 'week');

/** Begin van de eerste volledige periode op of na de startdatum. */
export function firstFullPeriodStart(startDate, span) {
  const start = span === 'month' ? startOfMonth(startDate) : startOfWeek(startDate);
  if (start >= startDate) return start;
  return span === 'month' ? addMonths(start, 1) : addDays(start, 7);
}

/** Begon de week of maand van deze eenheid op of na de startdatum? Zo niet, dan is het de eerste, aangebroken periode. */
function inFullPeriod(unit, startDate) {
  if (unit.type === 'day_of_month') return true; // bestaat alleen als de vaste dag op of na de start valt: dan was hij echt afgesproken
  const periodStart = unit.kind === 'day' ? startOfWeek(unit.start) : unit.start;
  return periodStart >= startDate;
}

/**
 * Alle signalen voor één habit op `today`, het belangrijkste eerst. Leeg voor een habit die niet meetelt of gepauzeerd is.
 * Elk signaal: { kind, habitId, key, since, episode, detail }.
 *   since    vanaf welke dag dit signaal nieuw is: een reactie op of na die dag dekt het (bij "stil" schuift het op, zie hieronder)
 *   episode  wanneer het probleem begon; de ochtendmelding komt vanaf die dag elke week terug (app/attention.js)
 */
export function attentionFor({ habit, checkIns = [], pauses = [], today }) {
  if (!isTracked(habit, today)) return [];
  if (isOnTrial(habit, today)) return []; // in een proef "zonder app" hoort de app niet te wijzen op wat er ligt
  const isPaused = (d) => pauses.some((p) => d >= p.from && (p.to == null || d <= p.to));
  if (isPaused(today)) return [];

  const units = computeUnits({ habit, checkIns, pauses, today });
  const habitId = habit.id;
  // een half gehaalde teller (partial) is geleverd werk en geen misser, net als bij de punten
  const partialDates = new Set(checkIns.filter((c) => c.status === 'partial').map((c) => c.date));
  const signals = [];
  const windowStart = addDays(startOfWeek(today), -FAILED_LOOKBACK_DAYS);

  const dayMisses = new Map(); // weekstart -> { missed, closed, since }
  for (const unit of units) {
    if (unit.status === 'open' && unit.overdue === true) {
      signals.push({ kind: 'late', habitId, key: `late:${unit.start}`, since: unit.due, episode: addDays(unit.due, 1), detail: { due: unit.due, days: diffDays(today, unit.due) } });
    } else if (unit.status === 'open' && unit.type === 'times_per_period' && inFullPeriod(unit, habit.startDate)
      && unit.count < unit.target && (unit.atRisk || unit.end === today)) {
      signals.push({ kind: 'behind', habitId, key: `behind:${unit.start}`, since: unit.start, episode: unit.start, detail: { span: unit.span, count: unit.count, target: unit.target, end: unit.end } });
    } else if (unit.kind === 'day' && inFullPeriod(unit, habit.startDate) && unit.end >= windowStart && (unit.status === 'missed' || counts(unit.status))) {
      const week = startOfWeek(unit.start);
      const entry = dayMisses.get(week) ?? { missed: 0, closed: 0, since: null };
      entry.closed += 1;
      if (unit.status === 'missed' && !partialDates.has(unit.end)) {
        entry.missed += 1;
        entry.since = entry.since === null || unit.end > entry.since ? unit.end : entry.since;
      }
      dayMisses.set(week, entry);
    } else if (unit.status === 'missed' && unit.kind === 'period' && unit.end >= windowStart && inFullPeriod(unit, habit.startDate)) {
      // een periode die de gebruiker zelf opgaf ("ga ik niet doen") is bij het opgeven al beantwoord: `since` is die dag, niet het einde van de periode
      const since = unit.givenUp ? unit.givenUpOn : unit.end;
      signals.push({ kind: 'failed', habitId, key: `failed:${unit.start}`, since, episode: unit.givenUp ? since : addDays(unit.end, 1), detail: { span: unit.span, count: unit.count, target: unit.target, start: unit.start, end: unit.end, givenUp: unit.givenUp === true } });
    }
  }
  for (const [week, entry] of dayMisses) {
    if (entry.missed > 0) signals.push({ kind: 'failed', habitId, key: `failed:${week}`, since: entry.since, episode: entry.since, detail: { span: 'day', count: entry.closed - entry.missed, target: entry.closed, missed: entry.missed, start: week, end: entry.since } });
  }

  const silent = silentSignal({ habit, checkIns, isPaused, today });
  if (silent && !signals.some((s) => s.kind === 'late')) signals.push(silent);

  return signals.sort((a, b) => ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind) || (a.since < b.since ? 1 : -1));
}

function silentSignal({ habit, checkIns, isPaused, today }) {
  const pace = paceOn(habit, today);
  if (pace.timesPerWeek === null || pace.timesPerWeek <= 0) return null;
  const interval = 7 / pace.timesPerWeek;
  const threshold = Math.max(SILENT_MIN_DAYS, Math.floor(SILENT_FACTOR * interval));
  const step = Math.max(SILENT_MIN_DAYS, Math.round(interval)); // het signaal komt elke `step` dagen opnieuw (`since` schuift op) tot je iets doet

  const lastDone = checkIns.filter((c) => active(c.status) && c.date <= today).map((c) => c.date).sort().at(-1) ?? null;
  const firstFull = firstFullPeriodStart(habit.startDate, spanOf(scheduleOn(habit, today)));
  const anchor = lastDone !== null && lastDone > firstFull ? lastDone : firstFull;
  if (anchor >= today) return null;

  const silentDays = eachDay(addDays(anchor, 1), today).filter((d) => !isPaused(d)).length;
  if (silentDays < threshold) return null;

  const since = addDays(anchor, threshold + Math.floor((silentDays - threshold) / step) * step);
  return {
    kind: 'silent',
    habitId: habit.id,
    key: `silent:${anchor}`,
    since,
    episode: addDays(anchor, threshold),
    detail: { days: silentDays, lastDone, threshold, interval: Math.round(interval), timesPerWeek: pace.timesPerWeek },
  };
}
