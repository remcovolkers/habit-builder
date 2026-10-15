// Handelingen van de gebruiker: domeinregels toepassen en daarna opslaan via de repository.
// Elke handeling die je ongedaan wilt kunnen maken geeft { undo } terug.
import { addDays, diffDays } from '../domain/dates.js';
import { DEFAULT_GRADUATION_DAYS, PLAN_AHEAD_DAYS } from '../domain/constants.js';
import { canBackfill } from '../domain/rules.js';
import { scheduleAt } from '../domain/schedule.js';

export class RuleError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RuleError';
    this.code = code;
  }
}

// --- check-ins ------------------------------------------------------------------------------

async function restoreCheckIn(repo, habitId, date, previous) {
  if (previous) await repo.setCheckIn({ habitId, date, status: previous.status, note: previous.note });
  else await repo.clearCheckIn(habitId, date);
}

export async function logCheckIn(repo, { habitId, date, status, note = null }, today) {
  if (!canBackfill(date, today)) throw new RuleError('backfill_window');
  const previous = await repo.getCheckIn(habitId, date);
  await repo.setCheckIn({ habitId, date, status, note });
  return { undo: () => restoreCheckIn(repo, habitId, date, previous) };
}

export async function clearCheckIn(repo, { habitId, date }, today) {
  if (!canBackfill(date, today)) throw new RuleError('backfill_window');
  const previous = await repo.getCheckIn(habitId, date);
  await repo.clearCheckIn(habitId, date);
  return { undo: () => restoreCheckIn(repo, habitId, date, previous) };
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
  const common = {
    name: String(values.name ?? '').trim(),
    icon: values.icon,
    color: values.color,
    daypart: values.daypart,
    cue: clean(values.cue),
    why: clean(values.why),
    minimalVersion: clean(values.minimalVersion),
  };

  if (!existing) {
    return {
      ...common,
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
