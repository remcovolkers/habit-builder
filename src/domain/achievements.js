// Achievements (PLAN §4.7). Deterministisch en puur: de functie geeft terug wat er NIEUW te ontgrendelen
// valt; het opslaan en tonen is aan de data- en UI-laag. Wat eenmaal ontgrendeld is, wordt nooit afgenomen.
import { diffDays, endOfWeek, startOfWeek } from './dates.js';
import {
  ACTIVE_HABITS_ACHIEVEMENT,
  COMEBACK_GAP_DAYS,
  MILESTONE_DAYS,
  MILESTONE_MIN_CONSISTENCY,
  PERFECT_WEEK_MIN_UNITS,
  REVIEW_STREAK_WEEKS,
} from './constants.js';
import { isClosed, isPositive } from './units.js';

export const ACHIEVEMENT_KEYS = Object.freeze([
  'first_checkin',
  ...MILESTONE_DAYS.map((n) => `days_${n}`),
  'perfect_week',
  'comeback',
  'first_graduated',
  'three_active',
  'review_streak_4',
]);

/** Heeft de habit een gemiste periode van ≥ 7 dagen gehad waarna hij weer is opgepakt? */
export function hasComeback(units) {
  let gapStart = null;
  for (const unit of units) {
    if (unit.status === 'missed') {
      gapStart ??= unit.start;
    } else if (isPositive(unit)) {
      if (gapStart !== null && diffDays(unit.start, gapStart) >= COMEBACK_GAP_DAYS) return true;
      gapStart = null;
    }
  }
  return false;
}

/** Is er een afgesloten week (ma–zo) waarin alle eenheden van alle habits gehaald zijn (minstens 3)? */
export function hasPerfectWeek(allUnits, today) {
  const weeks = new Map();
  for (const unit of allUnits) {
    if (!isClosed(unit)) continue;
    const key = unit.kind === 'day' ? startOfWeek(unit.start) : unit.span === 'week' ? unit.start : null;
    if (key === null) continue;
    const w = weeks.get(key) ?? { total: 0, missed: 0 };
    w.total += 1;
    if (unit.status === 'missed') w.missed += 1;
    weeks.set(key, w);
  }
  return [...weeks].some(([start, w]) => endOfWeek(start) < today && w.total >= PERFECT_WEEK_MIN_UNITS && w.missed === 0);
}

/** Zijn er `n` opeenvolgende weken met een review? */
export function hasReviewStreak(reviews, n = REVIEW_STREAK_WEEKS) {
  const weeks = [...new Set(reviews.map((r) => startOfWeek(r.weekStart)))].sort();
  let run = 0;
  for (let i = 0; i < weeks.length; i += 1) {
    run = i > 0 && diffDays(weeks[i], weeks[i - 1]) === 7 ? run + 1 : 1;
    if (run >= n) return true;
  }
  return false;
}

/**
 * stats:    uitvoer van buildHabitStats voor elke habit
 * reviews:  [{ weekStart }]
 * unlocked: [{ key, habitId|null }] — wat al eerder is ontgrendeld
 * Geeft [{ key, habitId|null }] van de nieuwe ontgrendelingen, in vaste volgorde.
 */
export function evaluateAchievements({ today, stats, reviews = [], unlocked = [] }) {
  const have = new Set(unlocked.map((u) => `${u.key}|${u.habitId ?? ''}`));
  const fresh = [];
  const grant = (key, habitId = null) => {
    const id = `${key}|${habitId ?? ''}`;
    if (!have.has(id)) {
      have.add(id);
      fresh.push({ key, habitId });
    }
  };

  if (stats.some((s) => s.totalDone > 0)) grant('first_checkin');

  for (const s of stats) {
    for (const n of MILESTONE_DAYS) {
      if (s.activeDays >= n && (s.consistency.rate ?? 0) >= MILESTONE_MIN_CONSISTENCY) grant(`days_${n}`, s.habitId);
    }
  }

  if (hasPerfectWeek(stats.flatMap((s) => s.units), today)) grant('perfect_week');
  for (const s of stats) if (hasComeback(s.units)) grant('comeback', s.habitId);
  if (stats.some((s) => s.graduated)) grant('first_graduated');
  if (stats.filter((s) => s.habitStatus === 'active').length >= ACTIVE_HABITS_ACHIEVEMENT) grant('three_active');
  if (hasReviewStreak(reviews)) grant('review_streak_4');

  return fresh;
}
