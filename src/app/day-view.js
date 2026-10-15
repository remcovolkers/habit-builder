// Het view-model voor het Vandaag-scherm: snapshot + datum in, gegroepeerde lijsten uit. Puur.
import { DAYPARTS } from '../domain/habit.js';
import { canBackfill } from '../domain/rules.js';
import { buildToday } from '../domain/today.js';

const byHabitOrder = (a, b) =>
  (a.habit.sortOrder ?? 0) - (b.habit.sortOrder ?? 0) || a.habit.name.localeCompare(b.habit.name, 'nl');

/**
 * snapshot: { habits, checkIns, pauses, dayPlans }
 * date: de dag die getoond wordt; today: de echte "vandaag" (met dagwissel).
 *
 * mode: 'past' | 'today' | 'future'
 * canLog:  afvinken mag (vandaag en tot 14 dagen terug)
 * canPlan: stapel-items mogen aan deze dag worden toegevoegd (vandaag en later)
 */
export function buildDayView({ snapshot, date, today }) {
  const { habits, checkIns, pauses, dayPlans } = snapshot;
  const habitById = new Map(habits.map((h) => [h.id, h]));
  const bundles = habits.map((habit) => ({
    habit,
    checkIns: checkIns.filter((c) => c.habitId === habit.id),
    pauses: pauses.filter((p) => p.habitId === habit.id),
  }));

  const day = buildToday({ bundles, dayPlans, today: date });
  const attach = (entry) => ({ ...entry, habit: habitById.get(entry.habitId) });

  const entries = [...day.scheduled, ...day.planned].map(attach).sort(byHabitOrder);
  const groups = DAYPARTS.map((daypart) => ({
    daypart,
    entries: entries.filter((e) => e.habit.daypart === daypart),
  })).filter((g) => g.entries.length > 0);

  const pool = day.pool.map(attach).sort(
    (a, b) =>
      Number(a.satisfied) - Number(b.satisfied) ||
      Number(b.atRisk) - Number(a.atRisk) ||
      a.remainingDays - b.remainingDays ||
      byHabitOrder(a, b),
  );

  const counted = entries.filter((e) => e.loggedToday !== 'skipped');
  return {
    date,
    hasHabits: habits.length > 0,
    mode: date < today ? 'past' : date === today ? 'today' : 'future',
    canLog: date <= today && canBackfill(date, today),
    canPlan: date >= today,
    groups,
    pool,
    progress: { done: counted.filter((e) => e.doneToday).length, total: counted.length },
  };
}
