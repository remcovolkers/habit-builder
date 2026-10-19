// Wat de lijst op Habits per habit laat zien: in welke fase hij zit, en bij een flexibele taak hoe ver deze week of maand is. Puur.
import { isTight } from '../domain/tight.js';
import { scheduleAt } from '../domain/schedule.js';
import { computeUnits } from '../domain/units.js';
import { levelOf } from '../domain/automaticity.js';
import { isOnTrial } from '../domain/trial.js';
import { statsForHabit } from './habit-detail.js';

/** Is dit een flexibele taak: N× per week of N× per maand, zonder vaste dag? */
export const isFlexible = (habit, today) => {
  const schedule = scheduleAt(habit.schedules, today) ?? habit.schedules[0]?.schedule;
  return schedule?.type === 'times_per_period';
};

/**
 * { phase: { key, unit, day, total } | null, period: { span, count, target, remainingDays, urgent } | null, level: 'aware'|'coming'|'almost'|'natural'|null, trial: boolean }
 *   phase   de fase uit domain/phases.js met de voortgang in dagen of (bij een zeldzame taak) keren; null voor een habit die nog niet gestart is
 *   period  alleen bij een flexibele taak met een lopende week of maand; urgent = dreigt te falen (atRisk of krap)
 *   level   het niveau van het laatste automatisme-cijfer (domain/automaticity.js), of null zonder cijfers
 *   trial   loopt er nu een proef "zonder app" (domain/trial.js)?
 */
export function habitRowInfo({ habit, snapshot, today }) {
  const { checkIns, pauses, ratings = [] } = snapshot;
  const { stats, latestRating } = statsForHabit({ habit, checkIns, pauses, ratings, today });
  const phase = stats.phase.phase === 'planned' ? null : { key: stats.phase.phase, unit: stats.phase.unit, day: stats.phase.day, total: stats.phase.total };

  let period = null;
  if (habit.status === 'active' && isFlexible(habit, today)) {
    const unit = computeUnits({
      habit,
      checkIns: checkIns.filter((c) => c.habitId === habit.id),
      pauses: pauses.filter((p) => p.habitId === habit.id),
      today,
    }).find((u) => u.type === 'times_per_period' && u.start <= today && today <= u.end);
    if (unit) {
      period = {
        span: unit.span, count: unit.count, target: unit.target, remainingDays: unit.remainingDays,
        urgent: unit.status === 'open' && unit.count < unit.target && (unit.atRisk || isTight(unit)),
      };
    }
  }
  return { phase, period, level: latestRating ? levelOf(latestRating.score) : null, trial: isOnTrial(habit, today) };
}
