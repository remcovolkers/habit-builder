// Het model voor de habit-detailpagina en het Voortgang-overzicht. Puur: data in, getoonde cijfers uit.
import { DEFAULT_GRADUATION_DAYS, PHASE_STARTING_UNTIL_DAY } from '../domain/constants.js';
import { startOfWeek } from '../domain/dates.js';
import { buildHeatmap } from '../domain/heatmap.js';
import { scheduleAt } from '../domain/schedule.js';
import { buildHabitStats } from '../domain/stats.js';
import { pickTip } from './tips.js';

/** In welke eenheid telt de reeks? 'day' | 'week' | 'month' */
export function streakSpan(habit, units, today) {
  const last = units.at(-1);
  if (last) return last.span;
  const schedule = scheduleAt(habit.schedules, today) ?? habit.schedules[0].schedule;
  if (schedule.type === 'weekdays') return 'day';
  if (schedule.type === 'times_per_period') return schedule.period;
  return 'month';
}

const isPausedOn = (pauses, today) => pauses.some((p) => today >= p.from && (p.to == null || today <= p.to));

/**
 * Stats voor één habit, inclusief het optionele automatisme-criterium: dat telt mee voor "ingeburgerd"
 * zodra de gebruiker minstens één keer een cijfer heeft gegeven (dan moet het laatste cijfer ≥ 4 zijn).
 */
export function statsForHabit({ habit, checkIns, pauses, ratings, today }) {
  const mine = ratings.filter((r) => r.habitId === habit.id).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const latest = mine.at(-1) ?? null;
  return {
    ratings: mine,
    latestRating: latest,
    stats: buildHabitStats({
      habit,
      checkIns: checkIns.filter((c) => c.habitId === habit.id),
      pauses: pauses.filter((p) => p.habitId === habit.id),
      today,
      useAutomaticity: mine.length > 0,
      automaticityScore: latest?.score ?? null,
    }),
  };
}

/** De drie fasebalken met hoe ver je erin zit, plus de plek van de marker (0–100). */
export function phaseBar({ activeDays, graduationDays, graduated }) {
  const second = Math.max(1, graduationDays - PHASE_STARTING_UNTIL_DAY);
  const third = 15; // alleen visueel: het "ingeburgerd"-deel is open einde
  const total = PHASE_STARTING_UNTIL_DAY + second + third;
  const clamp = (n) => Math.min(1, Math.max(0, n));
  return {
    sizes: [PHASE_STARTING_UNTIL_DAY, second, third],
    fills: [clamp(activeDays / PHASE_STARTING_UNTIL_DAY), clamp((activeDays - PHASE_STARTING_UNTIL_DAY) / second), graduated ? 1 : 0],
    markerPercent: Math.round((Math.min(activeDays, graduationDays + (graduated ? third : 0)) / total) * 100),
  };
}

/**
 * Alles voor de detailpagina van één habit.
 * snapshot: { checkIns, pauses, ratings }; today: de echte "vandaag".
 */
export function buildHabitDetail({ habit, snapshot, today }) {
  const { checkIns, pauses, ratings } = snapshot;
  const mine = { checkIns: checkIns.filter((c) => c.habitId === habit.id), pauses: pauses.filter((p) => p.habitId === habit.id) };
  const { stats, ratings: habitRatings, latestRating } = statsForHabit({ habit, checkIns, pauses, ratings, today });
  const graduationDays = habit.graduationDays ?? DEFAULT_GRADUATION_DAYS;
  const pausedNow = isPausedOn(mine.pauses, today);
  const thisWeek = startOfWeek(today);

  return {
    habit,
    stats,
    graduationDays,
    heatmap: buildHeatmap({ habit, checkIns: mine.checkIns, pauses: mine.pauses, today }),
    streakSpan: streakSpan(habit, stats.units, today),
    remainingDays: Math.max(0, graduationDays - stats.activeDays),
    phaseBar: phaseBar({ activeDays: stats.activeDays, graduationDays, graduated: stats.graduated }),
    pausedNow,
    useAutomaticity: habitRatings.length > 0,
    latestRating,
    ratingThisWeek: habitRatings.find((r) => r.weekStart === thisWeek) ?? null,
    canGraduate: habit.status === 'active' && stats.graduation.eligible,
    tipKey: pickTip({ phase: stats.phase.phase, activeDays: stats.activeDays, graduationDays, units: stats.units, pausedNow }),
  };
}
