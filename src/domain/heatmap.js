// Heatmap van de laatste weken voor één habit: een raster van weken (ma–zo) met per dag een staat.
//
// state: 'done' | 'minimal' | 'skipped' | 'paused' | 'missed' | 'open' | 'none' (niet gepland) | 'future'
import { addDays, eachDay, startOfWeek } from './dates.js';
import { computeUnits } from './units.js';

export const HEATMAP_WEEKS = 6;

/**
 * Geeft { weeks: [[{ date, state, today }]] } met `weeks` rijen van 7 dagen, de laatste week is de huidige.
 * Een logging op een dag wint altijd van het schema (je mag ook op een niet-geplande dag iets doen).
 * Zonder logging volgt de staat uit de dag-eenheid; flexibele habits ("N× per week") hebben geen
 * dagstaat en blijven 'none', want "gemist" bestaat daar alleen per week of maand.
 */
export function buildHeatmap({ habit, checkIns = [], pauses = [], today, weeks = HEATMAP_WEEKS }) {
  const first = addDays(startOfWeek(today), -7 * (weeks - 1));
  const units = computeUnits({ habit, checkIns, pauses, today });
  const dayUnits = new Map(units.filter((u) => u.kind === 'day').map((u) => [u.start, u.status]));
  const logged = new Map(checkIns.map((c) => [c.date, c.status]));
  const isPaused = (d) => pauses.some((p) => d >= p.from && (p.to == null || d <= p.to));
  const lastDate = habit.endDate != null && habit.endDate < today ? habit.endDate : today;

  const stateOf = (date) => {
    if (date > today) return 'future';
    if (date < habit.startDate || date > lastDate) return 'none';
    const status = logged.get(date);
    if (status === 'done') return 'done';
    if (status === 'minimal') return 'minimal';
    if (status === 'skipped') return 'skipped';
    if (status === 'wont') return 'missed';
    const unit = dayUnits.get(date);
    if (unit === 'missed' || unit === 'open') return unit;
    if (unit === 'paused' || unit === 'skipped') return unit;
    return isPaused(date) ? 'paused' : 'none';
  };

  const days = eachDay(first, addDays(first, weeks * 7 - 1));
  const rows = [];
  for (let i = 0; i < weeks; i += 1) {
    rows.push(days.slice(i * 7, i * 7 + 7).map((date) => ({ date, state: stateOf(date), today: date === today })));
  }
  return { weeks: rows };
}
