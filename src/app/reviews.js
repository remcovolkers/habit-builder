// De gegevens voor de review-kaarten op Voortgang: per week en per maand wat er is ingevuld en wat nog kan. Puur.
import { addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '../domain/dates.js';
import {
  monthReviewFor,
  monthReviewOpensOn,
  monthReviewUnlocked,
  weekReviewFor,
  weekReviewHasContent,
  weeksOfMonth,
} from '../domain/reviews.js';

/** 'future' (nog niet begonnen) | 'current' | 'past' */
const phaseOf = (start, end, today) => (start > today ? 'future' : end >= today ? 'current' : 'past');

/** De weekreview van de week waarin `date` valt: wat er is ingevuld (of null) en of invullen kan. */
export function buildWeekReviewCard({ snapshot, today, date }) {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  const record = weekReviewFor(snapshot.reviews, start);
  const phase = phaseOf(start, end, today);
  return { period: 'week', start, end, phase, review: weekReviewHasContent(record) ? record : null, canFill: phase !== 'future' };
}

/**
 * De maandreview van de maand waarin `date` valt: de ingevulde weekreviews van die maand (oudste eerst), de afspraak voor de maand
 * en of die al open is (de laatste week van de maand) en wanneer de taak op Vandaag komt.
 */
export function buildMonthReviewCard({ snapshot, today, date }) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const phase = phaseOf(start, end, today);
  const weeks = weeksOfMonth(start).map((weekStart) => {
    const record = weekReviewFor(snapshot.reviews, weekStart);
    return { start: weekStart, end: endOfWeek(weekStart), review: weekReviewHasContent(record) ? record : null, future: weekStart > today };
  });
  const record = monthReviewFor(snapshot.reviews, start);
  const review = record && String(record.adjust ?? '').trim() !== '' ? record : null;
  const taskFrom = addMonths(start, 1);
  return {
    period: 'month',
    start,
    end,
    phase,
    weeks: weeks.filter((week) => week.review),
    weekCount: weeks.filter((week) => !week.future).length,
    review,
    unlocked: monthReviewUnlocked(start, today),
    opensOn: monthReviewOpensOn(start),
    taskFrom,
    taskState: !review ? null : review.appliedAt ? 'done' : today >= taskFrom ? 'open' : 'coming',
  };
}
