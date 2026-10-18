// De gegevens voor de review-kaarten op Voortgang: per week en per maand wat er is ingevuld en of invullen kan. Puur.
// `now` is de lokale muurtijd, 'YYYY-MM-DDTHH:MM' (localNow); een review staat open van vrijdag 00:00 tot maandag 12:00 (week) of van de 25e
// tot de 2e om 12:00 (maand), zie domain/reviews.js.
import { addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '../domain/dates.js';
import {
  monthReviewClosesOn,
  monthReviewFor,
  monthReviewOpensOn,
  monthReviewState,
  weekReviewClosesOn,
  weekReviewFor,
  weekReviewHasContent,
  weekReviewOpensOn,
  weekReviewState,
  weeksOfMonth,
} from '../domain/reviews.js';

/** De weekreview van de week waarin `date` valt: wat er is ingevuld (of null) en in welke fase hij is ('before' | 'open' | 'closed'). */
export function buildWeekReviewCard({ snapshot, now, date }) {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  const today = now.slice(0, 10);
  const record = weekReviewFor(snapshot.reviews, start);
  return {
    period: 'week',
    start,
    end,
    state: weekReviewState(start, now),
    isCurrent: start <= today && today <= end,
    review: weekReviewHasContent(record) ? record : null,
    opensOn: weekReviewOpensOn(start),
    closesOn: weekReviewClosesOn(start),
  };
}

/**
 * De maandreview van de maand waarin `date` valt: de ingevulde weekreviews van die maand (oudste eerst), de afspraak voor de maand,
 * de fase, en wanneer de taak op Vandaag komt.
 */
export function buildMonthReviewCard({ snapshot, now, date }) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const today = now.slice(0, 10);
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
    state: monthReviewState(start, now),
    isCurrent: start <= today && today <= end,
    isFuture: start > today,
    weeks: weeks.filter((week) => week.review),
    weekCount: weeks.filter((week) => !week.future).length,
    review,
    opensOn: monthReviewOpensOn(start),
    closesOn: monthReviewClosesOn(start),
    taskFrom,
    taskState: !review ? null : review.appliedAt ? 'done' : today >= taskFrom ? 'open' : 'coming',
  };
}
