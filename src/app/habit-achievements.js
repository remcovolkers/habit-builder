// Prestaties per habit: wat je bij deze ene habit hebt behaald en wat de eerstvolgende is, per soort, met voortgang (docs/FEEDBACKRONDE-2026-11.md, F3c).
// Het algemene scherm Prestaties houdt zijn eigen lijst; wat je bij een habit haalt staat ook daar, met de naam van de habit.
import { HABIT_DONE_MILESTONES, MILESTONE_DAYS } from '../domain/constants.js';
import { isGrowing } from '../domain/growth.js';
import { milestoneRepetitions } from '../domain/pace.js';

/**
 * habit, stats: de habit en zijn statistieken (buildHabitStats); records: wat er bij deze habit is ontgrendeld, [{ key, date }].
 * Geeft { reached: [{ key, date }] (oudste eerst), next: [{ key, value, target, repsNeeded? }] }.
 * `next` heeft per soort de eerstvolgende die nog niet is behaald: dagen, keren gedaan, en voor een habit die uitbouwt "Uitgebouwd".
 */
export function habitAchievements({ habit, stats, records = [] }) {
  const have = new Set(records.map((record) => record.key));
  const reached = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(({ key, date }) => ({ key, date }));
  const next = [];

  const days = MILESTONE_DAYS.find((n) => !have.has(`days_${n}`));
  if (days !== undefined) {
    const repsNeeded = Math.max(0, milestoneRepetitions(days, stats.pace?.timesPerWeek) - (stats.totalDone ?? 0));
    next.push({ key: `days_${days}`, value: Math.min(stats.activeDays ?? 0, days), target: days, repsNeeded });
  }
  const done = HABIT_DONE_MILESTONES.find((n) => !have.has(`habit_done_${n}`));
  if (done !== undefined) next.push({ key: `habit_done_${done}`, value: Math.min(stats.totalDone ?? 0, done), target: done });
  if (isGrowing(habit) && !have.has('built_goal')) next.push({ key: 'built_goal', value: null, target: null });
  return { reached, next };
}
