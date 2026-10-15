// Week- en maandoverzichten (F16, F21): per dag hoeveel van wat gepland stond is gedaan. Puur.
import { BACKFILL_DAYS, PLAN_AHEAD_DAYS } from '../domain/constants.js';
import { addDays, addMonths, diffDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '../domain/dates.js';
import { buildDayView, prepareSnapshot } from './day-view.js';

/** 'empty' (niets gepland) | 'future' | 'all' | 'some' | 'open' (vandaag, nog niets gedaan) | 'none' (voorbij en niets gedaan) */
function dayState({ done, total, date, today }) {
  if (total === 0) return 'empty';
  if (date > today) return 'future';
  if (done === total) return 'all';
  if (done > 0) return 'some';
  return date === today ? 'open' : 'none'; // vandaag is nog niet voorbij: niet als gemist tonen
}

/** 0 (niets gedaan) t/m 4 (alles gedaan); -1 als er niets gepland of nog niets te zeggen was. */
export function levelFor({ done, total }) {
  if (total === 0) return -1;
  const ratio = done / total;
  if (ratio === 0) return 0;
  if (ratio < 0.5) return 1;
  if (ratio < 0.8) return 2;
  return ratio < 1 ? 3 : 4;
}

// Voor een dag in een week of maand is de geschiedenis van de maand daarvoor genoeg (zie prepareSnapshot): dat scheelt veel rekenwerk.
export const horizonFor = (date) => startOfMonth(addMonths(startOfWeek(date), -1));

const progressOn = (snapshot, prepared, date, today) => buildDayView({ snapshot, date, today, prepared }).progress;

/** De week van `date` (ma t/m zo) als strook voor het Vandaag-scherm. */
export function buildWeekStrip({ snapshot, date, today }) {
  const start = startOfWeek(date);
  const prepared = prepareSnapshot(snapshot, horizonFor(date));
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(start, index);
    const { done, total } = progressOn(snapshot, prepared, day, today);
    const offset = diffDays(day, today);
    return {
      date: day,
      weekdayIndex: index,
      done,
      total,
      state: dayState({ done, total, date: day, today }),
      isToday: day === today,
      isSelected: day === date,
      selectable: offset >= -BACKFILL_DAYS && offset <= PLAN_AHEAD_DAYS,
    };
  });
}

/**
 * Wat er op één dag gepland stond en hoe het ging, voor het detail onder het overzicht.
 * state per habit: 'done' | 'minimal' | 'partial' | 'skipped' | 'missed' (voorbij, niets gedaan) | 'open' (vandaag) | 'planned' (toekomst)
 */
export function buildDayDetail({ snapshot, date, today }) {
  const view = buildDayView({ snapshot, date, today, prepared: prepareSnapshot(snapshot, horizonFor(date)) });
  const pending = date > today ? 'planned' : date === today ? 'open' : 'missed';
  const items = view.groups.flatMap((group) => group.entries).map((entry) => ({
    habitId: entry.habitId,
    name: entry.habit.name,
    icon: entry.habit.icon,
    color: entry.habit.color,
    state: entry.loggedToday ?? pending,
  }));
  const offset = diffDays(date, today);
  return { date, ...view.progress, items, editable: items.length > 0 && offset >= -BACKFILL_DAYS && offset <= PLAN_AHEAD_DAYS };
}

/**
 * Overzicht van een week of maand rond `anchor`, als raster (een maand is altijd hele weken).
 * Geeft ook de totalen (alleen tot en met vandaag) en of je een periode terug of vooruit kunt.
 */
export function buildPeriodOverview({ snapshot, today, period, anchor }) {
  const start = period === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const end = period === 'week' ? endOfWeek(anchor) : endOfMonth(anchor);
  const gridStart = startOfWeek(start);
  const gridEnd = endOfWeek(end);
  const prepared = prepareSnapshot(snapshot, horizonFor(start));

  const days = [];
  let done = 0;
  let total = 0;
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    const inPeriod = day >= start && day <= end;
    const progress = inPeriod ? progressOn(snapshot, prepared, day, today) : { done: 0, total: 0 };
    if (inPeriod && day <= today) {
      done += progress.done;
      total += progress.total;
    }
    days.push({
      date: day,
      inPeriod,
      done: progress.done,
      total: progress.total,
      state: inPeriod ? dayState({ done: progress.done, total: progress.total, date: day, today }) : 'outside',
      level: inPeriod && day <= today && !(day === today && progress.done === 0) ? levelFor(progress) : -1,
      isToday: day === today,
    });
  }

  const earliest = snapshot.habits.map((habit) => habit.startDate).sort()[0] ?? today;
  const previous = period === 'week' ? addDays(start, -7) : addMonths(start, -1);
  const next = period === 'week' ? addDays(start, 7) : addMonths(start, 1);
  return {
    period,
    start,
    end,
    days,
    totals: { done, total, percent: total === 0 ? null : Math.round((done / total) * 100) },
    previous: { anchor: previous, enabled: (period === 'week' ? addDays(previous, 6) : endOfMonth(previous)) >= earliest },
    next: { anchor: next, enabled: next <= today },
  };
}
