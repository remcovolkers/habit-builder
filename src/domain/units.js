// Eenheden (PLAN §4.3): per habit de rij "dingen die gehaald moeten worden", elk met een status.
//
//   kind 'day'    – één geplande dag (schema 'weekdays')
//   kind 'period' – een week of maand: 'times_per_period' (N×) of 'day_of_month' (dag X, uiterlijk einde maand)
//
// Status: 'done' | 'minimal' (telt als gedaan) | 'skipped' | 'paused' | 'missed' | 'open'.
//
// Welk schema geldt, en wie "claimt" welke dagen (deterministisch, ook bij cadence-wijzigingen):
//   1. Per kalendermaand: is het schema op de LAATSTE dag van de maand 'day_of_month' of 'N× per maand',
//      dan claimt die maand al haar dagen.
//   2. Per kalenderweek (ma–zo): is het schema op de laatste dag van de week 'N× per week', dan claimt de
//      week de dagen die niet al door een maand geclaimd zijn.
//   3. Overgebleven dagen: één eenheid per dag als het schema die dag een weekdag-schema is.
// Gevolg: een wijziging geldt voor de héle periode waarin ze ingaat, eerdere periodes veranderen nooit.
import { addDays, addMonths, diffDays, eachDay, endOfMonth, startOfMonth, startOfWeek, weekday } from './dates.js';
import { dueDateInMonth, scheduleAt } from './schedule.js';

const counts = (status) => status === 'done' || status === 'minimal';

export const isPositive = (unit) => counts(unit.status);
/** Eenheden die meetellen voor consistentie, sterkte en reeks-breuk. */
export const isClosed = (unit) => counts(unit.status) || unit.status === 'missed';

/**
 * habit: { startDate, endDate?, schedules: [{ effectiveFrom, schedule }] }
 * checkIns: [{ date, status: 'done'|'minimal'|'skipped' }]  (per datum telt de laatste)
 * pauses: [{ from, to|null }]
 */
export function computeUnits({ habit, checkIns = [], pauses = [], today }) {
  const { startDate, endDate = null, schedules } = habit;
  const last = endDate !== null && endDate < today ? endDate : today;
  if (startDate > last) return [];

  const byDate = new Map();
  for (const c of checkIns) byDate.set(c.date, c.status);
  const statusOn = (d) => byDate.get(d);
  const isPaused = (d) => pauses.some((p) => d >= p.from && (p.to == null || d <= p.to));
  const isActive = (d) => d >= startDate && (endDate === null || d <= endDate);

  const claimedMonths = new Set();
  const claimedWeeks = new Set();
  const units = [];

  function periodUnit(span, start, end, schedule, dates) {
    if (dates.length === 0) return null;
    const doneCount = dates.filter((d) => counts(statusOn(d))).length;
    const minimalCount = dates.filter((d) => statusOn(d) === 'minimal').length;
    const pausedCount = dates.filter((d) => isPaused(d) && !counts(statusOn(d))).length;
    const availableDays = dates.filter(
      (d) => counts(statusOn(d)) || (statusOn(d) !== 'skipped' && !isPaused(d)),
    ).length;
    const target = Math.min(schedule.count, availableDays);
    const effectiveEnd = endDate !== null && endDate < end ? endDate : end;

    let status;
    if (doneCount > 0 && doneCount >= target) status = 'done';
    else if (endDate !== null && endDate < end) return null; // gearchiveerd voordat de periode klaar was
    else if (target === 0) status = pausedCount > 0 ? 'paused' : 'skipped';
    else status = effectiveEnd < today ? 'missed' : 'open';

    const remainingDays =
      status === 'open'
        ? dates.filter((d) => d >= today && !counts(statusOn(d)) && statusOn(d) !== 'skipped' && !isPaused(d)).length
        : 0;

    return {
      kind: 'period',
      span,
      type: 'times_per_period',
      start,
      end,
      days: diffDays(end, start) + 1,
      activeDays: diffDays(end, dates[0]) + 1, // de eerste periode van een taak die halverwege begint telt vanaf de start (voor domain/tight.js)
      status,
      target,
      count: doneCount,
      minimalCount,
      availableDays,
      remainingDays,
      atRisk: status === 'open' && target - doneCount > remainingDays,
    };
  }

  function dayOfMonthUnit(monthStart, monthEnd, schedule) {
    const due = dueDateInMonth(schedule.day, monthStart);
    if (due < startDate || due > last) return null;
    const dueWindow = eachDay(due, monthEnd).filter(isActive);
    const hit = dueWindow.some((d) => counts(statusOn(d)));
    let status;
    if (hit) status = 'done';
    else if (endDate !== null && endDate < monthEnd) return null;
    else if (dueWindow.some((d) => statusOn(d) === 'skipped')) status = 'skipped';
    else if (dueWindow.length > 0 && dueWindow.every(isPaused)) status = 'paused';
    else status = monthEnd < today ? 'missed' : 'open';
    return {
      kind: 'period',
      span: 'month',
      type: 'day_of_month',
      start: due,
      end: monthEnd,
      due,
      days: diffDays(monthEnd, monthStart) + 1,
      status,
      target: 1,
      count: hit ? 1 : 0,
      minimalCount: dueWindow.filter((d) => statusOn(d) === 'minimal').length,
      overdue: status === 'open' && today > due,
    };
  }

  // 1. maanden
  for (let m = startOfMonth(startDate); m <= last; m = addMonths(m, 1)) {
    const monthEnd = endOfMonth(m);
    const schedule = scheduleAt(schedules, monthEnd);
    if (schedule?.type === 'day_of_month') {
      claimedMonths.add(m.slice(0, 7));
      const unit = dayOfMonthUnit(m, monthEnd, schedule);
      if (unit) units.push(unit);
    } else if (schedule?.type === 'times_per_period' && schedule.period === 'month') {
      claimedMonths.add(m.slice(0, 7));
      const unit = periodUnit('month', m, monthEnd, schedule, eachDay(m, monthEnd).filter(isActive));
      if (unit) units.push(unit);
    }
  }

  // 2. weken
  for (let w = startOfWeek(startDate); w <= last; w = addDays(w, 7)) {
    const weekEnd = addDays(w, 6);
    const schedule = scheduleAt(schedules, weekEnd);
    if (schedule?.type === 'times_per_period' && schedule.period === 'week') {
      claimedWeeks.add(w);
      const dates = eachDay(w, weekEnd).filter((d) => isActive(d) && !claimedMonths.has(d.slice(0, 7)));
      const unit = periodUnit('week', w, weekEnd, schedule, dates);
      if (unit) units.push(unit);
    }
  }

  // 3. losse dagen
  for (const d of eachDay(startDate, last)) {
    if (claimedMonths.has(d.slice(0, 7)) || claimedWeeks.has(startOfWeek(d))) continue;
    const schedule = scheduleAt(schedules, d);
    if (schedule?.type !== 'weekdays' || !schedule.weekdays.includes(weekday(d))) continue;
    const logged = statusOn(d);
    let status;
    if (counts(logged)) status = logged;
    else if (logged === 'skipped') status = 'skipped';
    else if (isPaused(d)) status = 'paused';
    else status = d < today ? 'missed' : 'open';
    units.push({
      kind: 'day',
      span: 'day',
      type: 'weekdays',
      start: d,
      end: d,
      days: 1,
      status,
      target: 1,
      count: counts(logged) ? 1 : 0,
      minimalCount: logged === 'minimal' ? 1 : 0,
    });
  }

  return units.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}
