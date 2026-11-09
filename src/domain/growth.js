// Uitbouwen (docs/FEEDBACKRONDE-2026-11.md, F1): een habit met een doel ("ideale versie") waar je trede voor trede naartoe groeit. Puur.
//
// habit.goal = null | {
//   kind:       'frequency' (4× per week) | 'quantity' (0,5 → 2 liter, een teller) | 'text' (een concrete trede in woorden: "een kwartier lezen" → "een uur")
//   ideal:      frequency { schedule: { type: 'times_per_period', period, count } } | quantity { target } | text { text }
//   stepText:   alleen bij 'text': de trede van nu
//   stepStart:  de dag waarop de trede van nu begon; de keren op deze trede tellen vanaf dan
//   credit:     tegoed in keren bij het begin van de trede (de boost, zie boostCredit)
//   snoozedAt:  { date, reps } als je "Niet nu" koos bij de nudge, anders null
//   completedOn: de dag waarop je het uitbouwen afrondde ("Uitgebouwd"), anders null
//   log:        [{ date, choice: 'up' | 'stay' | 'down', from, to, note }], de laatste GOAL_LOG_MAX besluiten
// }
// De trede zelf staat in de habit: het ritme (schedules) bij 'frequency', het tellerdoel (counter.target) bij 'quantity', stepText bij 'text'.
import { COUNTER_MAX } from './counter.js';
import { diffDays, isValidDate } from './dates.js';
import {
  CONSISTENCY_THRESHOLD,
  DEFAULT_GRADUATION_DAYS,
  GOAL_LOG_MAX,
  NUDGE_BACK_BELOW,
  NUDGE_BACK_UNITS,
  NUDGE_MIN_REPETITIONS,
  NUDGE_SHARE,
  NUDGE_SNOOZE_DAYS,
} from './constants.js';
import { graduationPace } from './pace.js';
import { scheduleAt, validateSchedule } from './schedule.js';
import { isClosed, isPositive } from './units.js';

export const GOAL_KINDS = Object.freeze(['frequency', 'quantity', 'text']);
export const GOAL_CHOICES = Object.freeze(['up', 'stay', 'down']);
export const GOAL_TEXT_MAX = 60;
export const GOAL_NOTE_MAX = 200;

/** Heeft de habit een doel waar nog naartoe gewerkt wordt? (Na het afronden is het "Uitgebouwd" en volgt de habit het gewone traject.) */
export const isGrowing = (habit) => habit?.goal != null && habit.goal.completedOn == null;

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Geeft [{ field, code }]; leeg = geldig. `habit` is de habit waar het doel bij hoort (voor het ritme en de teller). */
export function validateGoal(goal, habit = {}) {
  if (goal == null) return [];
  const errors = [];
  const bad = (field, code = 'invalid') => errors.push({ field: `goal.${field}`, code });
  if (!plain(goal)) return [{ field: 'goal', code: 'invalid' }];
  if (!GOAL_KINDS.includes(goal.kind)) bad('kind');
  if (!isValidDate(goal.stepStart)) bad('stepStart');
  if (!isInt(goal.credit ?? 0, 0, COUNTER_MAX)) bad('credit');
  if (goal.completedOn != null && !isValidDate(goal.completedOn)) bad('completedOn');
  if (goal.snoozedAt != null && !(plain(goal.snoozedAt) && isValidDate(goal.snoozedAt.date) && isInt(goal.snoozedAt.reps, 0, 100000))) bad('snoozedAt');

  const ideal = goal.ideal;
  if (!plain(ideal)) bad('ideal');
  else if (goal.kind === 'frequency') {
    const schedule = ideal.schedule;
    if (!schedule || schedule.type !== 'times_per_period' || validateSchedule(schedule).length > 0) bad('ideal');
    else {
      const current = scheduleAt(habit.schedules ?? [], goal.stepStart) ?? habit.schedules?.at(-1)?.schedule;
      if (current && (current.type !== 'times_per_period' || current.period !== schedule.period)) bad('ideal', 'needs_times_per_period');
    }
  } else if (goal.kind === 'quantity') {
    if (!isInt(ideal.target, 1, COUNTER_MAX)) bad('ideal');
    else if (habit.counter == null) bad('ideal', 'needs_counter');
  } else if (goal.kind === 'text') {
    const text = typeof ideal.text === 'string' ? ideal.text.trim() : '';
    if (text === '') bad('ideal', 'required');
    else if (text.length > GOAL_TEXT_MAX) bad('ideal', 'too_long');
    const step = typeof goal.stepText === 'string' ? goal.stepText.trim() : '';
    if (step === '') bad('stepText', 'required');
    else if (step.length > GOAL_TEXT_MAX) bad('stepText', 'too_long');
  }

  if (goal.log != null) {
    if (!Array.isArray(goal.log) || goal.log.length > GOAL_LOG_MAX) bad('log');
    else {
      for (const entry of goal.log) {
        const ok = plain(entry) && isValidDate(entry.date) && GOAL_CHOICES.includes(entry.choice)
          && typeof entry.from === 'string' && entry.from.length <= GOAL_TEXT_MAX && typeof entry.to === 'string' && entry.to.length <= GOAL_TEXT_MAX
          && (entry.note == null || (typeof entry.note === 'string' && entry.note.length <= GOAL_NOTE_MAX));
        if (!ok) { bad('log'); break; }
      }
    }
  }
  return errors;
}

// --- de trede van nu en het doel -----------------------------------------------------------------

/** "1× per week" voor een times_per_period-ritme. */
const perPeriodLabel = (schedule) => `${schedule.count}× per ${schedule.period === 'week' ? 'week' : 'maand'}`;

/** De waarde van de trede van nu volgens de soort: { count } | { target } | { text } (null als dat niet te bepalen is). */
export function currentStep(habit, today) {
  const goal = habit.goal;
  if (!goal) return null;
  if (goal.kind === 'frequency') {
    const schedule = scheduleAt(habit.schedules ?? [], today) ?? habit.schedules?.at(-1)?.schedule;
    return schedule?.type === 'times_per_period' ? { count: schedule.count, period: schedule.period } : null;
  }
  if (goal.kind === 'quantity') return habit.counter?.target != null ? { target: habit.counter.target, unit: habit.counter.unit } : null;
  return goal.stepText ? { text: goal.stepText } : null;
}

/**
 * Wat de schermen tonen: de trede van nu, het ideaal, hoe ver je bent (0–1, null bij een tekstdoel) en het nummer van de trede
 * (1 + het aantal keer dat je netto omhoog ging).
 */
export function growthView(habit, today) {
  const goal = habit?.goal;
  if (!goal) return null;
  const step = currentStep(habit, today);
  const ups = (goal.log ?? []).filter((e) => e.choice === 'up').length - (goal.log ?? []).filter((e) => e.choice === 'down').length;
  const stepNumber = Math.max(1, 1 + ups);
  let current = '';
  let ideal = '';
  let progress = null;
  if (goal.kind === 'frequency') {
    current = step ? perPeriodLabel({ count: step.count, period: step.period }) : '';
    ideal = perPeriodLabel(goal.ideal.schedule);
    progress = step ? Math.min(1, step.count / goal.ideal.schedule.count) : 0;
  } else if (goal.kind === 'quantity') {
    const unit = habit.counter?.unit ?? '';
    current = step ? `${step.target} ${unit}`.trim() : '';
    ideal = `${goal.ideal.target} ${unit}`.trim();
    progress = step ? Math.min(1, step.target / goal.ideal.target) : 0;
  } else {
    current = goal.stepText ?? '';
    ideal = goal.ideal.text;
  }
  const atIdeal = goal.kind === 'text' ? false : progress !== null && progress >= 1; // bij een tekstdoel zegt alleen de gebruiker dat hij er is
  return { kind: goal.kind, current, ideal, progress, stepNumber, atIdeal, completed: goal.completedOn != null };
}

// --- wat je hebt gedaan (voor de prestaties) -------------------------------------------------------

/** Hoe vaak ging je met deze habit een trede hoger? */
export const countStepsUp = (goal) => (goal?.log ?? []).filter((entry) => entry.choice === 'up').length;

/** Ging je een keer terug en pakte je het daarna weer op: later weer een trede hoger, of het uitbouwen afgerond? */
export function hasSteppedBack(goal) {
  const log = goal?.log ?? [];
  const down = log.findIndex((entry) => entry.choice === 'down');
  if (down < 0) return false;
  return log.slice(down + 1).some((entry) => entry.choice === 'up') || goal.completedOn != null;
}

// --- keren op deze trede en de nudge ---------------------------------------------------------------

/** Hoeveel keren moet je op een trede gedaan hebben voor de nudge? Zie NUDGE_*: de helft van wat ingeburgerd bij dit ritme vraagt, met een ondergrens. */
export function nudgeThreshold(schedule, graduationDays = DEFAULT_GRADUATION_DAYS) {
  const { requiredRepetitions } = graduationPace({ schedule, graduationDays });
  const half = requiredRepetitions === null ? 0 : Math.ceil(requiredRepetitions * NUDGE_SHARE - 1e-9);
  return Math.max(NUDGE_MIN_REPETITIONS, half);
}

/** De boost bij een nieuwe trede: een deel van de keren op de vorige, hoogstens de helft van de drempel van de nieuwe. Je begint dus nooit op nul. */
export function boostCredit(previousReps, newThreshold) {
  return Math.max(0, Math.min(Math.floor(previousReps * NUDGE_SHARE), Math.floor(newThreshold * NUDGE_SHARE)));
}

/** Keren gedaan (of de minimale versie) op de trede van nu: het tegoed plus wat sinds het begin van de trede is afgevinkt. */
export function stepRepetitions(habit, checkIns) {
  const goal = habit.goal;
  if (!goal) return 0;
  const done = checkIns.filter((c) => c.habitId === habit.id && isPositiveStatus(c.status) && c.date >= goal.stepStart).length;
  return (goal.credit ?? 0) + done;
}
const isPositiveStatus = (status) => status === 'done' || status === 'minimal';

/**
 * Moet de app nu iets zeggen over de trede? Alleen een rustig voorstel: jij beslist.
 *   state 'reached'   het ideaal is gehaald (nudge tot afronden: kijk bij `ready` of het ook zit)
 *   state 'ready'     genoeg keren en het ging goed: tijd om te kijken of je een trede hoger wilt
 *   state 'building'  nog niet genoeg keren
 *   state 'shaky'     het gaat wankel: terugschakelen mag
 *   state 'snoozed'   je koos "Niet nu"; wacht
 *   state 'wait'      het automatisme-cijfer zegt dat het nog moeite kost
 * `units`: de eenheden van de habit (stats.units), `ratings`: de automatisme-cijfers van de habit, oudste eerst.
 */
export function growthNudge({ habit, checkIns, units = [], ratings = [], today }) {
  const goal = habit?.goal;
  if (!goal || goal.completedOn != null) return { state: 'none' };
  const schedule = scheduleAt(habit.schedules ?? [], today) ?? habit.schedules?.at(-1)?.schedule ?? null;
  const threshold = nudgeThreshold(schedule, habit.graduationDays ?? DEFAULT_GRADUATION_DAYS);
  const reps = stepRepetitions(habit, checkIns);
  const view = growthView(habit, today);
  const closed = units.filter((u) => isClosed(u) && u.end >= goal.stepStart);
  const positive = closed.filter(isPositive).length;
  const rate = closed.length === 0 ? null : positive / closed.length;
  const lastTwoMissed = closed.slice(-2).some((u) => u.status === 'missed');
  const recent = closed.slice(-NUDGE_BACK_UNITS);
  const recentRate = recent.length === 0 ? null : recent.filter(isPositive).length / recent.length;
  const base = { reps, threshold, rate, atIdeal: view?.atIdeal ?? false };

  if (recent.length >= NUDGE_BACK_UNITS && recentRate < NUDGE_BACK_BELOW && !view?.atIdeal) return { ...base, state: 'shaky' };
  if (reps < threshold || rate === null || rate < CONSISTENCY_THRESHOLD || lastTwoMissed) return { ...base, state: view?.atIdeal ? 'reached' : 'building' };
  if ((ratings.at(-1)?.score ?? 5) <= 2) return { ...base, state: 'wait' };
  const snoozed = goal.snoozedAt;
  if (snoozed && (reps < snoozed.reps + Math.ceil(threshold / 2) || diffDays(today, snoozed.date) < NUDGE_SNOOZE_DAYS)) return { ...base, state: 'snoozed' };
  return { ...base, state: 'ready' };
}

/** Is het uitbouwen af? Het ideaal is bereikt én het zit erin (genoeg keren op de laatste trede met een goed verloop). */
export const canComplete = (nudge) => nudge.state === 'ready' && nudge.atIdeal;
