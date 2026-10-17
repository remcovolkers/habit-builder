// Achievements (PLAN §4.7). Deterministisch en puur: de functie geeft terug wat er NIEUW te ontgrendelen
// valt; het opslaan en tonen is aan de data- en UI-laag. Wat eenmaal ontgrendeld is, wordt nooit afgenomen.
import { addDays, diffDays, endOfWeek, startOfWeek } from './dates.js';
import {
  ACHIEVEMENT_DAYPARTS,
  ACTIVE_HABITS_ACHIEVEMENT,
  ALL_DONE_DAYS,
  ALL_DONE_MIN_UNITS,
  AUTOMATICITY_WEEKS,
  COMEBACK_GAP_DAYS,
  COUNTER_FULL_DAYS,
  DONE_MILESTONES,
  FIVE_ACTIVE_ACHIEVEMENT,
  FRIENDS_ACHIEVEMENT,
  GRADUATED_MILESTONES,
  MILESTONE_DAYS,
  MILESTONE_MIN_CONSISTENCY,
  MINIMAL_ACHIEVEMENT,
  PERFECT_WEEK_MIN_UNITS,
  PERFECT_WEEKS_RUN,
  RECOVERIES_ACHIEVEMENT,
  REVIEW_STREAK_WEEKS,
  STREAK_MILESTONES,
  STRONG_RETURN,
  WHY_HABITS_ACHIEVEMENT,
} from './constants.js';
import { computeStreaks } from './streaks.js';
import { isClosed, isPositive } from './units.js';

/**
 * Prestaties die een getal halen: de meting (zie achievementMeasures) en het doel. Uit deze lijst komen de ontgrendelingen én
 * de voortgang op de pagina ("37 van 50"), zodat die nooit uit de pas lopen.
 */
export const COUNT_ACHIEVEMENTS = Object.freeze([
  ...DONE_MILESTONES.map((n) => ({ key: `done_${n}`, measure: 'totalDone', target: n })),
  ...STREAK_MILESTONES.map((n) => ({ key: `streak_${n}`, measure: 'bestDayStreak', target: n })),
  { key: 'perfect_weeks_4', measure: 'perfectWeekRun', target: PERFECT_WEEKS_RUN },
  { key: 'recover_5', measure: 'recoveries', target: RECOVERIES_ACHIEVEMENT },
  { key: 'minimal_5', measure: 'minimalUsed', target: MINIMAL_ACHIEVEMENT },
  { key: 'counter_week', measure: 'counterStreak', target: COUNTER_FULL_DAYS },
  ...GRADUATED_MILESTONES.map((n) => ({ key: `graduated_${n}`, measure: 'graduatedCount', target: n })),
  { key: 'automaticity_4', measure: 'ratedWeeks', target: AUTOMATICITY_WEEKS },
  { key: 'why_3', measure: 'habitsWithWhy', target: WHY_HABITS_ACHIEVEMENT },
  { key: 'all_dayparts', measure: 'dayparts', target: ACHIEVEMENT_DAYPARTS.length },
  { key: 'five_active', measure: 'activeHabits', target: FIVE_ACTIVE_ACHIEVEMENT },
  { key: 'all_done_10', measure: 'allDoneDays', target: ALL_DONE_DAYS },
  { key: 'first_friend', measure: 'friends', target: 1 },
  { key: 'friends_5', measure: 'friends', target: FRIENDS_ACHIEVEMENT },
].map(Object.freeze));

export const ACHIEVEMENT_KEYS = Object.freeze([
  'first_checkin',
  ...MILESTONE_DAYS.map((n) => `days_${n}`),
  'perfect_week',
  'comeback',
  'first_graduated',
  'three_active',
  'review_streak_4',
  // ronde 1 van §5; nieuwe sleutels zijn voor een oudere appversie onbekend en worden daar genegeerd
  ...DONE_MILESTONES.map((n) => `done_${n}`),
  ...STREAK_MILESTONES.map((n) => `streak_${n}`),
  'perfect_weeks_4',
  'recover_5',
  'strong_return',
  'minimal_first',
  'minimal_5',
  'counter_week',
  'pause_resume',
  ...GRADUATED_MILESTONES.map((n) => `graduated_${n}`),
  // ronde 2 van §5
  'first_review',
  'automaticity_4',
  'why_3',
  'all_dayparts',
  'five_active',
  'all_done_10',
  'first_friend',
  'friends_5',
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

/** Begin (maandag) van elke afgesloten week (ma–zo) waarin alle eenheden van alle habits gehaald zijn (minstens 3), oplopend. */
export function perfectWeekStarts(allUnits, today) {
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
  return [...weeks].filter(([start, w]) => endOfWeek(start) < today && w.total >= PERFECT_WEEK_MIN_UNITS && w.missed === 0).map(([start]) => start).sort();
}

/** Is er een afgesloten week (ma–zo) waarin alle eenheden van alle habits gehaald zijn (minstens 3)? */
export const hasPerfectWeek = (allUnits, today) => perfectWeekStarts(allUnits, today).length > 0;

/** De langste reeks opeenvolgende weken in een oplopende lijst weekbeginnen. */
export function longestWeekRun(weekStarts) {
  let run = 0;
  let best = 0;
  weekStarts.forEach((week, i) => {
    run = i > 0 && diffDays(week, weekStarts[i - 1]) === 7 ? run + 1 : 1;
    if (run > best) best = run;
  });
  return best;
}

/** Hoe vaak na een gemiste eenheid de eerstvolgende gehaald is. Overgeslagen en gepauzeerde eenheden ertussen doen niets. */
export function countRecoveries(units) {
  let count = 0;
  let afterMiss = false;
  for (const unit of units) {
    if (unit.status === 'missed') afterMiss = true;
    else if (isPositive(unit)) {
      if (afterMiss) count += 1;
      afterMiss = false;
    }
  }
  return count;
}

/**
 * "Sterk terug": ergens een venster van twee weken onder de dip-grens, en later weer een venster op of boven de terugkeer-grens.
 * Een venster telt pas mee met minstens STRONG_RETURN.minUnits afgesloten eenheden (een maandhabit haalt dit dus niet).
 */
export function hasStrongReturn(units) {
  const { windowDays, dipBelow, backAt, minUnits } = STRONG_RETURN;
  const closed = units.filter(isClosed);
  let left = 0;
  let positive = 0;
  let dipped = false;
  for (let i = 0; i < closed.length; i += 1) {
    const edge = addDays(closed[i].end, -(windowDays - 1));
    while (closed[left].end < edge) {
      if (isPositive(closed[left])) positive -= 1;
      left += 1;
    }
    if (isPositive(closed[i])) positive += 1;
    const n = i - left + 1;
    if (n < minUnits || diffDays(closed[i].end, closed[0].end) < windowDays - 1) continue; // een dip beslaat een heel venster, niet de eerste paar dagen
    const rate = positive / n;
    if (rate < dipBelow) dipped = true;
    else if (dipped && rate >= backAt) return true;
  }
  return false;
}

/** De langste reeks dagen waarop het volle doel van een teller gehaald is (een minimale versie of een half doel onderbreekt). */
export function counterFullStreak(units) {
  let run = 0;
  let best = 0;
  for (const unit of units) {
    if (unit.kind !== 'day') continue;
    if (unit.status === 'done' && !unit.minimalCount) {
      run += 1;
      if (run > best) best = run;
    } else if (unit.status === 'missed' || unit.status === 'minimal') run = 0;
  }
  return best;
}

/** Op hoeveel dagen is alles van die dag gedaan? Minstens ALL_DONE_MIN_UNITS dingen, niets gemist of nog open; overgeslagen en gepauzeerd telt niet mee. */
export function countAllDoneDays(allUnits) {
  const days = new Map();
  for (const unit of allUnits) {
    if (unit.kind !== 'day') continue;
    const day = days.get(unit.start) ?? { positive: 0, loose: 0 };
    if (isPositive(unit)) day.positive += 1;
    else if (unit.status === 'missed' || unit.status === 'open') day.loose += 1;
    days.set(unit.start, day);
  }
  return [...days.values()].filter((day) => day.positive >= ALL_DONE_MIN_UNITS && day.loose === 0).length;
}

/** Is er een pauze afgelopen, en is die habit daarna weer gedaan? */
export function hasResumedPause(pauses, checkIns, today) {
  return pauses.some((pause) => pause.to != null && pause.to < today
    && checkIns.some((c) => c.habitId === pause.habitId && (c.status === 'done' || c.status === 'minimal') && c.date > pause.to));
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

/** De metingen achter de COUNT_ACHIEVEMENTS. habits, checkIns, ratings en friends mogen ontbreken: wat ze nodig hebben blijft dan 0. */
export function achievementMeasures({ today, stats, habits = [], checkIns = [], ratings = [], friends = 0 }) {
  const counterIds = new Set(habits.filter((habit) => habit.counter != null).map((habit) => habit.id));
  const known = new Set(stats.map((s) => s.habitId));
  const kept = habits.filter((habit) => habit.status !== 'archived');
  return {
    ratedWeeks: new Set(ratings.filter((r) => known.has(r.habitId)).map((r) => r.weekStart)).size,
    habitsWithWhy: habits.filter((habit) => String(habit.why ?? '').trim() !== '').length,
    dayparts: new Set(kept.map((habit) => habit.daypart).filter((part) => ACHIEVEMENT_DAYPARTS.includes(part))).size,
    activeHabits: stats.filter((s) => s.habitStatus === 'active').length,
    allDoneDays: countAllDoneDays(stats.flatMap((s) => s.units ?? [])),
    friends,
    totalDone: stats.reduce((sum, s) => sum + (s.totalDone ?? 0), 0),
    bestDayStreak: Math.max(0, ...stats.map((s) => computeStreaks((s.units ?? []).filter((u) => u.kind === 'day')).best)),
    perfectWeekRun: longestWeekRun(perfectWeekStarts(stats.flatMap((s) => s.units ?? []), today)),
    recoveries: stats.reduce((sum, s) => sum + countRecoveries(s.units ?? []), 0),
    minimalUsed: checkIns.filter((c) => c.status === 'minimal' && known.has(c.habitId)).length,
    counterStreak: Math.max(0, ...stats.filter((s) => counterIds.has(s.habitId)).map((s) => counterFullStreak(s.units ?? []))),
    graduatedCount: stats.filter((s) => s.graduated).length,
  };
}

/** Voortgang naar elke telprestatie: { [key]: { value, target } } met value hoogstens target. */
export function achievementProgress(input) {
  const measures = achievementMeasures(input);
  return Object.fromEntries(COUNT_ACHIEVEMENTS.map(({ key, measure, target }) => [key, { value: Math.min(measures[measure], target), target }]));
}

/**
 * stats:    uitvoer van buildHabitStats voor elke habit
 * reviews:  [{ weekStart }]
 * unlocked: [{ key, habitId|null }] — wat al eerder is ontgrendeld
 * habits, checkIns, pauses, ratings: de gegevens zelf, voor wat de stats niet weten (teller, minimale versie, pauzes, automatisme)
 * friends: het aantal vrienden (komt niet uit de lokale gegevens maar uit de sociale cache; zonder sociaal 0)
 * Geeft [{ key, habitId|null }] van de nieuwe ontgrendelingen, in vaste volgorde.
 */
export function evaluateAchievements({ today, stats, reviews = [], unlocked = [], habits = [], checkIns = [], pauses = [], ratings = [], friends = 0 }) {
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

  if (reviews.length > 0) grant('first_review');
  const measures = achievementMeasures({ today, stats, habits, checkIns, ratings, friends });
  for (const { key, measure, target } of COUNT_ACHIEVEMENTS) if (measures[measure] >= target) grant(key);
  for (const s of stats) if (hasStrongReturn(s.units ?? [])) grant('strong_return', s.habitId);
  if (habits.some((habit) => String(habit.minimalVersion ?? '').trim() !== '')) grant('minimal_first');
  if (hasResumedPause(pauses, checkIns, today)) grant('pause_resume');

  return fresh;
}
