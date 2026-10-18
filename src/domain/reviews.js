// Reviews: een terugblik per week en een afspraak met jezelf per maand. Puur.
//
// Beide soorten staan in de collectie `reviews`:
//   week   { id: weekStart, weekStart, wentWell, wentBad }
//   maand  { id: 'month:YYYY-MM', period: 'month', monthStart, adjust, appliedAt }
// `appliedAt` (datum of null) is het afvinken van de eenmalige maandtaak die uit `adjust` volgt.
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from './dates.js';

export const MONTH_REVIEW_LAST_DAYS = 7;

export const isMonthReview = (review) => review?.period === 'month';
export const isWeekReview = (review) => review != null && !isMonthReview(review) && typeof review.weekStart === 'string';

export const weekReviews = (reviews = []) => reviews.filter(isWeekReview);
export const monthReviews = (reviews = []) => reviews.filter(isMonthReview);

export const monthReviewId = (monthStart) => `month:${monthStart.slice(0, 7)}`;

/** Heeft de weekreview iets ingevuld? (Oude reviews met alleen "wat pas ik aan" tellen niet: dat veld bestaat niet meer.) */
export const weekReviewHasContent = (review) => Boolean(review && (String(review.wentWell ?? '').trim() || String(review.wentBad ?? '').trim()));

export const weekReviewFor = (reviews, weekStart) => weekReviews(reviews).find((r) => r.weekStart === weekStart) ?? null;
export const monthReviewFor = (reviews, monthStart) => monthReviews(reviews).find((r) => r.monthStart === startOfMonth(monthStart)) ?? null;

/** De eerste dag waarop de maandreview open gaat: de laatste week van de maand. */
export const monthReviewOpensOn = (monthStart) => addDays(endOfMonth(monthStart), -(MONTH_REVIEW_LAST_DAYS - 1));

export const monthReviewUnlocked = (monthStart, today) => today >= monthReviewOpensOn(monthStart);

/**
 * De weken die bij een maand horen: de week hoort bij de maand waarin zijn donderdag valt (zoals bij ISO-weken),
 * zodat elke week bij precies één maand hoort. Geeft de maandagen, oplopend.
 */
export function weeksOfMonth(monthStart) {
  const first = startOfMonth(monthStart);
  const last = endOfMonth(first);
  const weeks = [];
  for (let monday = startOfWeek(first); monday <= last; monday = addDays(monday, 7)) {
    const thursday = addDays(monday, 3);
    if (thursday >= first && thursday <= last) weeks.push(monday);
  }
  return weeks;
}

/**
 * De eenmalige taken die uit maandreviews volgen: de afspraak ("Wat pas ik aan?") van maand X staat klaar vanaf de eerste dag van
 * maand X+1 en blijft staan tot je hem afvinkt. Oudste eerst.
 * Geeft [{ monthStart, text, availableFrom }].
 */
export function monthTasks({ reviews, today }) {
  return monthReviews(reviews)
    .filter((review) => String(review.adjust ?? '').trim() !== '' && !review.appliedAt && today >= addMonths(review.monthStart, 1))
    .map((review) => ({ monthStart: review.monthStart, text: review.adjust.trim(), availableFrom: addMonths(review.monthStart, 1) }))
    .sort((a, b) => (a.monthStart < b.monthStart ? -1 : 1));
}
