// Reviews: een terugblik per week en een afspraak met jezelf per maand. Puur.
//
// Beide soorten staan in de collectie `reviews`:
//   week   { id: weekStart, weekStart, wentWell, wentBad }
//   maand  { id: 'month:YYYY-MM', period: 'month', monthStart, adjust, appliedAt }
// `appliedAt` (datum of null) is het afvinken van de eenmalige maandtaak die uit `adjust` volgt.
import { addDays, addMonths, diffDays, endOfMonth, startOfMonth, startOfWeek } from './dates.js';

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
// Een weekreview gaat zondag om 18:00 open en sluit de maandag erna om 23:59: de hele maandag kun je hem nog invullen. Een maandreview opent op de
// 25e (00:00) en sluit op de 2e van de volgende maand om 12:00. Daarbuiten kun je niets invullen of wijzigen. Alle momenten zijn lokale muurtijd,
// 'YYYY-MM-DDTHH:MM' (zie localNow).
export const WEEK_REVIEW_OPENS_AFTER_DAYS = 6; // zondag: zes dagen na de maandag
export const WEEK_REVIEW_CLOSES_AFTER_DAYS = 7; // de maandag erna
export const WEEK_REVIEW_OPENING_TIME = '18:00';
export const WEEK_REVIEW_CLOSING_TIME = '23:59'; // de laatste minuut dat het nog kan
export const MONTH_REVIEW_OPENS_DAY = '25';
export const MONTH_REVIEW_CLOSES_DAY = '02';
export const MONTH_REVIEW_CLOSING_TIME = '12:00';

/** De dag waarop de weekreview opent (zondag, om 18:00) en sluit (maandag, om 23:59). */
export const weekReviewOpensOn = (weekStart) => addDays(weekStart, WEEK_REVIEW_OPENS_AFTER_DAYS);
export const weekReviewClosesOn = (weekStart) => addDays(weekStart, WEEK_REVIEW_CLOSES_AFTER_DAYS);
/** De dag waarop de maandreview opent (de 25e) en sluit (de 2e van de volgende maand, om 12:00). */
export const monthReviewOpensOn = (monthStart) => `${startOfMonth(monthStart).slice(0, 8)}${MONTH_REVIEW_OPENS_DAY}`;
export const monthReviewClosesOn = (monthStart) => `${addMonths(startOfMonth(monthStart), 1).slice(0, 8)}${MONTH_REVIEW_CLOSES_DAY}`;

// Een review staat pas klaar als je de app minstens zo lang gebruikt: een terugblik na een dag of twee zegt nog niets. De eerste dag telt mee.
export const REVIEW_MIN_USE_DAYS = 3;

/** Heb je de app op `date` lang genoeg gebruikt voor een review? `firstUse` is de eerste dag van gebruik; null (onbekend) houdt niets tegen. */
export const usedLongEnough = (firstUse, date) => firstUse == null || diffDays(date, firstUse) + 1 >= REVIEW_MIN_USE_DAYS;

/** 'before' (nog niet open) | 'open' | 'closed' (gesloten) voor `now` ('YYYY-MM-DDTHH:MM'): open vanaf het openingsmoment tot het sluitmoment. */
function windowState(opensOn, openingTime, closesOn, closingTime, now) {
  if (now < `${opensOn}T${openingTime}`) return 'before';
  return now < `${closesOn}T${closingTime}` ? 'open' : 'closed';
}
// De week sluit na de laatste minuut van de maandag (23:59): de eerste minuut erbuiten is dinsdag 00:00.
const weekClosingMoment = (weekStart) => ({ day: addDays(weekReviewClosesOn(weekStart), 1), time: '00:00' });
export const weekReviewState = (weekStart, now) => {
  const closing = weekClosingMoment(weekStart);
  return windowState(weekReviewOpensOn(weekStart), WEEK_REVIEW_OPENING_TIME, closing.day, closing.time, now);
};
export const monthReviewState = (monthStart, now) => windowState(monthReviewOpensOn(monthStart), '00:00', monthReviewClosesOn(monthStart), MONTH_REVIEW_CLOSING_TIME, now);

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
 * De meldingen op Vandaag dat een review open staat en nog niet is ingevuld. Dat geldt voor de week van nu (vanaf zondag 18:00) en voor de week ervoor
 * (tot maandag 23:59), en op dezelfde manier voor de maand van nu (vanaf de 25e) en de maand ervoor (tot de 2e om 12:00).
 * Geeft [{ kind, start, closesOn }]: eerst de weken, dan de maanden, telkens de oudste eerst.
 * `firstUse` (de eerste dag van gebruik, of null): zolang de app nog geen REVIEW_MIN_USE_DAYS dagen is gebruikt, staat er niets klaar.
 */
export function reviewNudges({ reviews, now, firstUse = null }) {
  const today = now.slice(0, 10);
  const nudges = [];
  if (!usedLongEnough(firstUse, today)) return nudges;
  for (const start of [addDays(startOfWeek(today), -7), startOfWeek(today)]) {
    if (weekReviewState(start, now) === 'open' && !weekReviewHasContent(weekReviewFor(reviews, start))) nudges.push({ kind: 'week', start, closesOn: weekReviewClosesOn(start) });
  }
  for (const start of [addMonths(today, -1), startOfMonth(today)]) {
    if (monthReviewState(start, now) === 'open' && String(monthReviewFor(reviews, start)?.adjust ?? '').trim() === '') nudges.push({ kind: 'month', start, closesOn: monthReviewClosesOn(start) });
  }
  return nudges;
}
