// Het view-model voor het Vandaag-scherm: snapshot + datum in, gegroepeerde lijsten uit. Puur.
import { startOfWeek } from '../domain/dates.js';
import { DAYPARTS } from '../domain/habit.js';
import { paceOn } from '../domain/pace.js';
import { canBackfill } from '../domain/rules.js';
import { buildToday } from '../domain/today.js';

const byHabitOrder = (a, b) =>
  (a.habit.sortOrder ?? 0) - (b.habit.sortOrder ?? 0) || a.habit.name.localeCompare(b.habit.name, 'nl');

/**
 * Groepeert de gegevens per habit, één keer. Wie veel dagen achter elkaar nodig heeft (weekstrook, overzicht) maakt dit één keer
 * en geeft het aan elke buildDayView mee.
 *
 * `from` (optioneel): rekent alleen met gegevens vanaf die datum. Dat is veel sneller bij een lange geschiedenis en geeft
 * dezelfde uitkomst voor dagen die minstens een maand na `from` liggen (een week of maand is dan nooit doormidden gesneden).
 */
export function prepareSnapshot(snapshot, from = null) {
  const { habits, checkIns, pauses } = snapshot;
  const checkInsBy = new Map();
  const pausesBy = new Map();
  for (const c of checkIns) {
    if (from !== null && c.date < from) continue;
    if (!checkInsBy.has(c.habitId)) checkInsBy.set(c.habitId, []);
    checkInsBy.get(c.habitId).push(c);
  }
  for (const p of pauses) {
    if (!pausesBy.has(p.habitId)) pausesBy.set(p.habitId, []);
    pausesBy.get(p.habitId).push(p);
  }
  return {
    habitById: new Map(habits.map((h) => [h.id, h])),
    bundles: habits.map((habit) => ({
      habit: from !== null && habit.startDate < from ? { ...habit, startDate: from } : habit,
      checkIns: checkInsBy.get(habit.id) ?? [],
      pauses: pausesBy.get(habit.id) ?? [],
    })),
  };
}

/**
 * snapshot: { habits, checkIns, pauses, dayPlans }
 * date: de dag die getoond wordt; today: de echte "vandaag" (met dagwissel).
 *
 * mode: 'past' | 'today' | 'future'
 * canLog:  afvinken mag (vandaag en tot 14 dagen terug)
 * canPlan: stapel-items mogen aan deze dag worden toegevoegd (vandaag en later)
 */
export function buildDayView({ snapshot, date, today, prepared = null }) {
  const { habits, dayPlans } = snapshot;
  const { habitById, bundles } = prepared ?? prepareSnapshot(snapshot);

  const day = buildToday({ bundles, dayPlans, today: date, now: today });
  const attach = (entry) => ({ ...entry, habit: habitById.get(entry.habitId) });

  // Een zeldzame taak (pace.js) vraagt na het afvinken hoe automatisch het ging: één cijfer per week waarin hij is gedaan.
  const weekStart = startOfWeek(date);
  const ratings = snapshot.ratings ?? [];
  const withAutomaticity = (entry) => {
    const { habit } = entry;
    if (!entry.doneToday || habit.status !== 'active' || !paceOn(habit, date).sparse) return entry;
    const rating = ratings.find((r) => r.habitId === habit.id && r.weekStart === weekStart);
    return { ...entry, automaticity: { score: rating?.score ?? null } };
  };

  const entries = [...day.scheduled, ...day.planned].map(attach).map(withAutomaticity).sort(byHabitOrder);
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
