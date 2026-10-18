// Reviews: een terugblik per week en een afspraak met jezelf per maand. Puur.
//
// Beide soorten staan in de collectie `reviews`:
//   week   { id: weekStart, weekStart, wentWell, wentBad }
//   maand  { id: 'month:YYYY-MM', period: 'month', monthStart, adjust, appliedAt }
// `appliedAt` (datum of null) is het afvinken van de eenmalige maandtaak die uit `adjust` volgt.
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from './dates.js';

export const isMonthReview = (review) => review?.period === 'month';
export const isWeekReview = (review) => review != null && !isMonthReview(review) && typeof review.weekStart === 'string';

export const weekReviews = (reviews = []) => reviews.filter(isWeekReview);
export const monthReviews = (reviews = []) => reviews.filter(isMonthReview);

export const monthReviewId = (monthStart) => `month:${monthStart.slice(0, 7)}`;

/** Heeft de weekreview iets ingevuld? (Oude reviews met alleen "wat pas ik aan" tellen niet: dat veld bestaat niet meer.) */
export const weekReviewHasContent = (review) => Boolean(review && (String(review.wentWell ?? '').trim() || String(review.wentBad ?? '').trim()));

export const weekReviewFor = (reviews, weekStart) => weekReviews(reviews).find((r) => r.weekStart === weekStart) ?? null;
export const monthReviewFor = (reviews, monthStart) => monthReviews(reviews).find((r) => r.monthStart === startOfMonth(monthStart)) ?? null;

// --- wanneer een review open staat ----------------------------------------------------------------------------------------------------
// Een weekreview gaat vrijdag 00:00 open en sluit de maandag erna om 12:00. Een maandreview opent op de 25e (00:00) en sluit op de 2e van de
// volgende maand om 12:00. Daarbuiten kun je niets invullen of wijzigen. Alle momenten zijn lokale muurtijd, 'YYYY-MM-DDTHH:MM' (zie localNow).
export const WEEK_REVIEW_OPENS_AFTER_DAYS = 4; // vrijdag: vier dagen na de maandag
export const WEEK_REVIEW_CLOSES_AFTER_DAYS = 7; // de maandag erna
export const MONTH_REVIEW_OPENS_DAY = '25';
export const MONTH_REVIEW_CLOSES_DAY = '02';
export const REVIEW_CLOSING_TIME = '12:00';

/** De dag waarop de weekreview opent (vrijdag) en sluit (maandag, om 12:00). */
export const weekReviewOpensOn = (weekStart) => addDays(weekStart, WEEK_REVIEW_OPENS_AFTER_DAYS);
export const weekReviewClosesOn = (weekStart) => addDays(weekStart, WEEK_REVIEW_CLOSES_AFTER_DAYS);
/** De dag waarop de maandreview opent (de 25e) en sluit (de 2e van de volgende maand, om 12:00). */
export const monthReviewOpensOn = (monthStart) => `${startOfMonth(monthStart).slice(0, 8)}${MONTH_REVIEW_OPENS_DAY}`;
export const monthReviewClosesOn = (monthStart) => `${addMonths(startOfMonth(monthStart), 1).slice(0, 8)}${MONTH_REVIEW_CLOSES_DAY}`;

/** 'before' (nog niet open) | 'open' | 'closed' (gesloten) voor `now` ('YYYY-MM-DDTHH:MM'). */
function windowState(opensOn, closesOn, now) {
  if (now < `${opensOn}T00:00`) return 'before';
  return now < `${closesOn}T${REVIEW_CLOSING_TIME}` ? 'open' : 'closed';
}
export const weekReviewState = (weekStart, now) => windowState(weekReviewOpensOn(weekStart), weekReviewClosesOn(weekStart), now);
export const monthReviewState = (monthStart, now) => windowState(monthReviewOpensOn(monthStart), monthReviewClosesOn(monthStart), now);

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

/**
 * De meldingen op Vandaag dat een review open staat en nog niet is ingevuld. Dat geldt voor de week van nu (vanaf vrijdag) en voor de week ervoor
 * (tot maandag 12:00), en op dezelfde manier voor de maand van nu (vanaf de 25e) en de maand ervoor (tot de 2e om 12:00).
 * Geeft [{ kind, start, closesOn }]: eerst de weken, dan de maanden, telkens de oudste eerst.
 */
export function reviewNudges({ reviews, now }) {
  const today = now.slice(0, 10);
  const nudges = [];
  for (const start of [addDays(startOfWeek(today), -7), startOfWeek(today)]) {
    if (weekReviewState(start, now) === 'open' && !weekReviewHasContent(weekReviewFor(reviews, start))) nudges.push({ kind: 'week', start, closesOn: weekReviewClosesOn(start) });
  }
  for (const start of [addMonths(today, -1), startOfMonth(today)]) {
    if (monthReviewState(start, now) === 'open' && String(monthReviewFor(reviews, start)?.adjust ?? '').trim() === '') nudges.push({ kind: 'month', start, closesOn: monthReviewClosesOn(start) });
  }
  return nudges;
}
