// Opmaak van datums en schema's voor de UI (pure functies).
import { addDays, diffDays } from '../domain/dates.js';
import { ALL_WEEKDAYS, WORKDAYS } from '../domain/schedule.js';
import { nl } from '../content/nl.js';

const utcDate = (date) => new Date(`${date}T00:00:00Z`);

/** '2026-10-15' -> 'donderdag 15 oktober' */
export function formatDateLong(date) {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utcDate(date));
}

/** '2026-10-15' -> 'do 15 okt' */
export function formatDateShort(date) {
  return `${nl.weekdays.short[(utcDate(date).getUTCDay() + 6) % 7]} ${utcDate(date).getUTCDate()} ${nl.months.short[utcDate(date).getUTCMonth()]}`;
}

/** Het lokale uur (0–23) in `timeZone`; voor de begroeting, niet voor de dagwissel. */
export function localHour(now, timeZone) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit' })
    .formatToParts(now)
    .find((p) => p.type === 'hour');
  return Number(part.value);
}

/** 'Goedemorgen' (vóór 12 uur), 'Goedemiddag' (vóór 18 uur) of 'Goedenavond'. */
export function greetingFor(hour) {
  if (hour < 12) return nl.greeting.morning;
  return hour < 18 ? nl.greeting.afternoon : nl.greeting.evening;
}

/** 'Vandaag', 'Gisteren', 'Morgen' of de korte datum. */
export function relativeDayLabel(date, today) {
  const offset = diffDays(date, today);
  if (offset === 0) return nl.days.today;
  if (offset === -1) return nl.days.yesterday;
  if (offset === 1) return nl.days.tomorrow;
  return formatDateShort(date);
}

const sameSet = (a, b) => a.length === b.length && a.every((n) => b.includes(n));

export function formatSchedule(schedule) {
  switch (schedule?.type) {
    case 'weekdays': {
      if (sameSet(schedule.weekdays, ALL_WEEKDAYS)) return nl.schedule.daily;
      if (sameSet(schedule.weekdays, WORKDAYS)) return nl.schedule.workdays;
      const names = [...schedule.weekdays].sort((a, b) => a - b).map((d) => nl.weekdays.short[d]);
      return names.join(', ').replace(/^./, (c) => c.toUpperCase());
    }
    case 'times_per_period':
      return `${schedule.count}× ${schedule.period === 'week' ? nl.schedule.perWeek : nl.schedule.perMonth}`;
    case 'day_of_month':
      return nl.schedule.dayOfMonth(schedule.day);
    default:
      return '';
  }
}

/** Dagen vanaf `from` t/m `to` (inclusief) als lijst datums. */
export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
