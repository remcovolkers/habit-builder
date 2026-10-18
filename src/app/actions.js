// Handelingen van de gebruiker: domeinregels toepassen en daarna opslaan via de repository.
// Elke handeling die je ongedaan wilt kunnen maken geeft { undo } terug.
import { addDays, diffDays, startOfMonth, startOfWeek } from '../domain/dates.js';
import { monthReviewUnlocked } from '../domain/reviews.js';
import { DEFAULT_GRADUATION_DAYS, PLAN_AHEAD_DAYS } from '../domain/constants.js';
import { clampCounter, counterDoneValue, counterStatus } from '../domain/counter.js';
import { donePartsOf, habitDayparts, hasMultipleDayparts, partsStatus } from '../domain/dayparts.js';
import { sortDayparts } from '../domain/habit.js';
import { canBackfill } from '../domain/rules.js';
import { scheduleAt } from '../domain/schedule.js';
import { moveHabit } from './ordering.js';

export class RuleError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RuleError';
    this.code = code;
  }
}

// --- check-ins ------------------------------------------------------------------------------

async function restoreCheckIn(repo, habitId, date, previous) {
  if (previous) await repo.setCheckIn({ habitId, date, status: previous.status, note: previous.note, value: previous.value ?? null, parts: previous.parts ?? null });
  else await repo.clearCheckIn(habitId, date);
}

export async function logCheckIn(repo, { habitId, date, status, note = null, value = null, parts = null }, today) {
  if (!canBackfill(date, today)) throw new RuleError('backfill_window');
  const previous = await repo.getCheckIn(habitId, date);
  await repo.setCheckIn({ habitId, date, status, note, value, parts });
  return { undo: () => restoreCheckIn(repo, habitId, date, previous) };
}

/**
 * Teller omhoog of omlaag (bv. +1 glas water). De waarde hoort bij de datum, dus elke dag begint op 0.
 * Op 0 komen we terug bij "niets gelogd"; de status volgt uit het doel (zie domain/counter.js).
 * Geeft { undo, value, status } terug.
 */
export async function adjustCounter(repo, { habit, date, delta }, today) {
  if (!habit.counter) throw new RuleError('not_a_counter');
  if (!canBackfill(date, today)) throw new RuleError('backfill_window');
  const previous = await repo.getCheckIn(habit.id, date);
  const current = previous?.status === 'skipped' ? 0 : (previous?.value ?? (previous ? counterDoneValue(habit.counter) : 0));
  const value = clampCounter(current + delta);
  const status = counterStatus(value, habit.counter);
  if (status === null) await repo.clearCheckIn(habit.id, date);
  else await repo.setCheckIn({ habitId: habit.id, date, status, note: previous?.note ?? null, value });
  return { undo: () => restoreCheckIn(repo, habit.id, date, previous), value, status };
}

/**
 * Eén dagdeel van een habit met meerdere dagdelen afvinken of weer wissen ("tandenpoetsen: ochtend"). De dag is gedaan als alle dagdelen gedaan zijn,
 * daaronder staat hij op 'partial' (zie domain/dayparts.js); op 0 komen we terug bij "niets gelogd".
 * Geeft { undo, parts, status } terug.
 */
export async function togglePart(repo, { habit, date, part }, today) {
  if (!hasMultipleDayparts(habit) || !habitDayparts(habit).includes(part)) throw new RuleError('not_a_part');
  if (!canBackfill(date, today)) throw new RuleError('backfill_window');
  const previous = await repo.getCheckIn(habit.id, date);
  const done = donePartsOf(habit, previous);
  const parts = done.includes(part) ? done.filter((p) => p !== part) : sortDayparts([...done, part]);
  const status = partsStatus(parts.length, habitDayparts(habit).length);
  if (status === null) await repo.clearCheckIn(habit.id, date);
  else await repo.setCheckIn({ habitId: habit.id, date, status, note: previous?.note ?? null, value: parts.length, parts });
  return { undo: () => restoreCheckIn(repo, habit.id, date, previous), parts, status };
}

export async function clearCheckIn(repo, { habitId, date }, today) {
  if (!canBackfill(date, today)) throw new RuleError('backfill_window');
  const previous = await repo.getCheckIn(habitId, date);
  await repo.clearCheckIn(habitId, date);
  return { undo: () => restoreCheckIn(repo, habitId, date, previous) };
}

// --- volgorde van habits -----------------------------------------------------------------------

/** Verplaatst een habit een plek omhoog (-1) of omlaag (+1) binnen de getoonde lijst. */
export async function reorderHabit(repo, { habitId, visibleIds, direction }) {
  const habits = await repo.listHabits();
  const changes = moveHabit({ habits, visibleIds, id: habitId, direction });
  for (const { id, sortOrder } of changes) {
    const habit = habits.find((item) => item.id === id);
    await repo.saveHabit({ ...habit, sortOrder });
  }
  return changes.length;
}

// --- dagplannen -------------------------------------------------------------------------------

export async function planHabit(repo, { habitId, date }, today) {
  const ahead = diffDays(date, today);
  if (ahead < 0 || ahead > PLAN_AHEAD_DAYS) throw new RuleError('plan_window');
  await repo.setDayPlan({ habitId, date });
  return { undo: () => repo.clearDayPlan(habitId, date) };
}

export async function unplanHabit(repo, { habitId, date }) {
  await repo.clearDayPlan(habitId, date);
  return { undo: () => repo.setDayPlan({ habitId, date }) };
}

// --- habit aanmaken en bewerken ---------------------------------------------------------------

const clean = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
};

function normalizeSchedule(schedule) {
  return schedule?.type === 'weekdays' ? { ...schedule, weekdays: [...schedule.weekdays].sort((a, b) => a - b) } : schedule;
}

export const sameSchedule = (a, b) => JSON.stringify(normalizeSchedule(a)) === JSON.stringify(normalizeSchedule(b));

/**
 * Zet formulierwaarden om in een habit-record (nog niet gevalideerd of opgeslagen).
 *
 * Nieuwe habit: één schema met ingangsdatum = startdatum.
 * Bestaande habit die nog niet gestart is: startdatum en schema mogen vrij veranderen.
 * Bestaande habit die loopt: een ander schema wordt een NIEUWE versie met ingangsdatum vandaag
 * (domein: geldt voor de hele periode waarin je het wijzigt); de geschiedenis blijft ongemoeid.
 */
export function applyHabitForm({ existing = null, values, today, sortOrder = 0 }) {
  // meerdere dagdelen: alleen bij twee of meer, in de volgorde van de dag; het eerste is ook `daypart`
  const dayparts = Array.isArray(values.dayparts) && new Set(values.dayparts).size > 1 ? sortDayparts([...new Set(values.dayparts)]) : null;
  const common = {
    name: String(values.name ?? '').trim(),
    icon: values.icon,
    color: values.color,
    daypart: dayparts ? dayparts[0] : values.daypart,
    cue: clean(values.cue),
    why: clean(values.why),
    minimalVersion: clean(values.minimalVersion),
    counter: values.counter ? { unit: String(values.counter.unit ?? '').trim(), target: values.counter.target ?? null } : null,
  };

  if (!existing) {
    return {
      ...common,
      ...(dayparts ? { dayparts } : {}),
      status: 'active',
      startDate: values.startDate,
      endDate: null,
      graduationDays: DEFAULT_GRADUATION_DAYS,
      maintenance: false,
      sortOrder,
      schedules: [{ effectiveFrom: values.startDate, schedule: values.schedule }],
    };
  }

  const next = { ...existing, ...common };
  if (dayparts) next.dayparts = dayparts;
  else delete next.dayparts;
  if (existing.startDate > today) {
    next.startDate = values.startDate;
    next.schedules = [{ effectiveFrom: values.startDate, schedule: values.schedule }];
    return next;
  }
  const kept = existing.schedules.filter((v) => v.effectiveFrom !== today);
  const inForce = scheduleAt(kept, today);
  next.schedules = sameSchedule(inForce, values.schedule) ? kept : [...kept, { effectiveFrom: today, schedule: values.schedule }];
  return next;
}

// --- ingeburgerd, automatisme, review ------------------------------------------------------------

/** De gebruiker bevestigt: deze habit is van mij. Alleen voor lopende habits. */
export async function graduateHabit(repo, habit, today) {
  if (habit.status !== 'active') throw new RuleError('not_active');
  return repo.saveHabit({ ...habit, status: 'graduated', graduatedAt: today, maintenance: false });
}

/** Ingeburgerd maar toch blijven volgen ("onderhoud"). */
export async function setMaintenance(repo, habit, maintenance) {
  if (habit.status !== 'graduated') throw new RuleError('not_graduated');
  return repo.saveHabit({ ...habit, maintenance: Boolean(maintenance) });
}

/** Automatisme-cijfer (1–5) voor de huidige week; opnieuw geven overschrijft. */
export async function rateAutomaticity(repo, { habitId, score }, today) {
  return repo.setRating({ habitId, weekStart: startOfWeek(today), score });
}

/**
 * Waarom een taak bleef liggen (domain/attention.js): één reactie per taak per dag. De reactie dekt de signalen die tot en met
 * vandaag begonnen, dus het signaal verdwijnt uit Vandaag en de melding tot er een nieuw komt.
 */
export async function recordReason(repo, { habitId, reason, note = null }, today) {
  return repo.setReason({ habitId, date: today, reason, note });
}

/** Review van de week waarin `date` valt (opnieuw opslaan overschrijft). Een week die nog niet begonnen is kan nog niet. */
export async function saveWeeklyReview(repo, { wentWell, wentBad }, date, today = date) {
  const weekStart = startOfWeek(date);
  if (weekStart > today) throw new RuleError('review_future');
  return repo.saveReview({ weekStart, wentWell, wentBad });
}

/** Review van de maand waarin `date` valt, vanaf de laatste week van die maand (domain/reviews.js). */
export async function saveMonthlyReview(repo, { adjust }, date, today) {
  const monthStart = startOfMonth(date);
  if (!monthReviewUnlocked(monthStart, today)) throw new RuleError('review_locked');
  return repo.saveMonthReview({ monthStart, adjust });
}

/** De eenmalige maandtaak afvinken. Geeft { undo } terug. */
export async function completeMonthTask(repo, { monthStart }, today) {
  await repo.setMonthTaskApplied({ monthStart, date: today });
  return { undo: () => repo.setMonthTaskApplied({ monthStart, date: null }) };
}

// --- pauzeren, archiveren -----------------------------------------------------------------------

const openPause = async (repo, habitId) => (await repo.listPauses(habitId)).find((p) => p.to == null);

export async function pauseHabit(repo, habitId, today) {
  return (await openPause(repo, habitId)) ?? repo.addPause({ habitId, from: today });
}

export async function resumeHabit(repo, habitId, today) {
  const pause = await openPause(repo, habitId);
  if (!pause) return;
  const to = addDays(today, -1);
  if (to < pause.from) await repo.removePause(pause.id);
  else await repo.updatePause(pause.id, { to });
}

const isActive = (habit) => habit.status === 'active';

export async function pauseAll(repo, today) {
  for (const habit of (await repo.listHabits()).filter(isActive)) await pauseHabit(repo, habit.id, today);
}

export async function resumeAll(repo, today) {
  for (const habit of (await repo.listHabits()).filter(isActive)) await resumeHabit(repo, habit.id, today);
}

export async function archiveHabit(repo, habit, today) {
  return repo.saveHabit({ ...habit, status: 'archived', endDate: today });
}

/** Terug uit het archief: de archieftijd telt als gepauzeerd, niet als gemist. */
export async function unarchiveHabit(repo, habit, today) {
  if (habit.endDate) {
    const from = addDays(habit.endDate, 1);
    const to = addDays(today, -1);
    if (from <= to) await repo.addPause({ habitId: habit.id, from, to });
  }
  return repo.saveHabit({ ...habit, status: 'active', endDate: null });
}
