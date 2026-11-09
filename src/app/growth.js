// Uitbouwen: de handelingen (docs/FEEDBACKRONDE-2026-11.md, F1). De regels staan in domain/growth.js; hier wordt de habit omgezet en opgeslagen.
// Elke handeling geeft { habit, undo } terug, zodat het scherm "Ongedaan maken" kan tonen.
import { GOAL_LOG_MAX, DEFAULT_GRADUATION_DAYS } from '../domain/constants.js';
import {
  boostCredit, canComplete, currentStep, growthNudge, growthView, isGrowing, nudgeThreshold, stepRepetitions,
} from '../domain/growth.js';
import { scheduleAt } from '../domain/schedule.js';
import { RuleError, sameSchedule } from './actions.js';

const clean = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
};

/** De habit met een nieuw ritme vanaf `today` (zoals Habit bewerken dat doet): de eerdere versies blijven, een habit die nog niet gestart is krijgt het ritme vanaf zijn start. */
function withSchedule(habit, schedule, today) {
  if (habit.startDate > today) return { ...habit, schedules: [{ effectiveFrom: habit.startDate, schedule }] };
  const kept = habit.schedules.filter((v) => v.effectiveFrom !== today);
  return { ...habit, schedules: sameSchedule(scheduleAt(kept, today), schedule) ? kept : [...kept, { effectiveFrom: today, schedule }] };
}

const idealOf = (kind, ideal) => (kind === 'frequency' ? { schedule: ideal.schedule } : kind === 'quantity' ? { target: ideal.target } : { text: String(ideal.text ?? '').trim() });

/**
 * Een doel instellen of aanpassen. `kind`: 'frequency' | 'quantity' | 'text'; `ideal` volgens de soort ({ schedule } | { target } | { text }); `stepText` alleen bij een tekstdoel
 * (de trede van nu). Een bestaand doel houdt zijn trede, zijn tegoed en zijn logboek; alleen het ideaal verandert.
 */
export async function setGoal(repo, { habit, kind, ideal, stepText = null }, today) {
  if (habit.status !== 'active' && habit.status !== 'planned') throw new RuleError('not_active');
  const previous = habit;
  const existing = isGrowing(habit) && habit.goal.kind === kind ? habit.goal : null;
  const goal = {
    kind,
    ideal: idealOf(kind, ideal ?? {}),
    ...(kind === 'text' ? { stepText: clean(stepText) ?? existing?.stepText ?? '' } : {}),
    stepStart: existing?.stepStart ?? today,
    credit: existing?.credit ?? 0,
    snoozedAt: existing?.snoozedAt ?? null,
    completedOn: null,
    log: existing?.log ?? [],
  };
  const saved = await repo.saveHabit({ ...habit, goal });
  return { habit: saved, undo: () => repo.saveHabit(previous) };
}

/** Het doel weghalen: de habit blijft zoals hij nu is (de trede van nu wordt gewoon zijn ritme of teller). */
export async function removeGoal(repo, { habit }) {
  const previous = habit;
  const { goal, ...rest } = habit;
  const saved = await repo.saveHabit(rest);
  return { habit: saved, undo: () => repo.saveHabit(previous) };
}

const labelOf = (habit, today) => growthView(habit, today)?.current ?? '';

/**
 * Een besluit op een trede: 'up' (naar `to`, hoger), 'down' (naar `to`, lager, niet onder 1) of 'stay' (blijven; de nudge zwijgt een tijd).
 * `to` is een getal bij een frequentie (keren per periode) of een hoeveelheid, en tekst bij een tekstdoel. Omhoog gaat hoogstens tot het ideaal.
 * Elke nieuwe trede begint met een tegoed (de boost, zie boostCredit) en met een nieuw ritme, tellerdoel of tekst vanaf vandaag.
 */
export async function takeStep(repo, { habit, choice, to = null, note = null }, today, checkIns = []) {
  if (!isGrowing(habit)) throw new RuleError('not_growing');
  const goal = habit.goal;
  const reps = stepRepetitions(habit, checkIns);
  const step = currentStep(habit, today);
  const from = labelOf(habit, today);
  const entry = (choiceDone, toLabel) => ({ date: today, choice: choiceDone, from, to: toLabel, ...(clean(note) ? { note: clean(note).slice(0, 200) } : {}) });
  const previous = habit;

  if (choice === 'stay') {
    const next = { ...habit, goal: { ...goal, snoozedAt: { date: today, reps }, log: [...(goal.log ?? []), entry('stay', from)].slice(-GOAL_LOG_MAX) } };
    return { habit: await repo.saveHabit(next), undo: () => repo.saveHabit(previous) };
  }
  if (choice !== 'up' && choice !== 'down') throw new RuleError('step_invalid');

  let next;
  if (goal.kind === 'text') {
    const text = clean(to);
    if (text === null || text === step?.text) throw new RuleError('step_invalid');
    next = { ...habit, goal: { ...goal, stepText: text } };
  } else {
    const value = Number(to);
    const now = goal.kind === 'frequency' ? step?.count : step?.target;
    const top = goal.kind === 'frequency' ? goal.ideal.schedule.count : goal.ideal.target;
    if (!Number.isInteger(value) || value < 1 || now == null || (choice === 'up' ? value <= now || value > top : value >= now)) throw new RuleError('step_invalid');
    if (goal.kind === 'frequency') next = withSchedule(habit, { ...goal.ideal.schedule, count: value }, today);
    else next = { ...habit, counter: { ...habit.counter, target: value } };
    next = { ...next, goal };
  }
  const threshold = nudgeThreshold(scheduleAt(next.schedules ?? [], today) ?? next.schedules?.at(-1)?.schedule ?? null, next.graduationDays ?? DEFAULT_GRADUATION_DAYS);
  const toLabel = labelOf(next, today);
  next = {
    ...next,
    goal: {
      ...next.goal,
      stepStart: today,
      credit: boostCredit(reps, threshold),
      snoozedAt: null,
      log: [...(goal.log ?? []), entry(choice, toLabel)].slice(-GOAL_LOG_MAX),
    },
  };
  return { habit: await repo.saveHabit(next), undo: () => repo.saveHabit(previous) };
}

/**
 * Het uitbouwen afronden: "Uitgebouwd". Kan als het ideaal is bereikt en het erin zit (canComplete). Daarna volgt de habit het gewone traject en kan hij
 * ingeburgerd worden; het doel blijft als geschiedenis bij de habit staan.
 */
export async function completeGoal(repo, { habit, units = [], ratings = [] }, today, checkIns = []) {
  if (!isGrowing(habit)) throw new RuleError('not_growing');
  if (!canComplete(growthNudge({ habit, checkIns, units, ratings, today }))) throw new RuleError('not_ready');
  const previous = habit;
  const saved = await repo.saveHabit({ ...habit, goal: { ...habit.goal, completedOn: today } });
  return { habit: saved, undo: () => repo.saveHabit(previous) };
}
