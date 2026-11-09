// De gegevens voor de review-kaarten op Voortgang: per week en per maand wat er is ingevuld en of invullen kan. Puur.
// `now` is de lokale muurtijd, 'YYYY-MM-DDTHH:MM' (localNow); een review staat open van vrijdag 00:00 tot maandag 12:00 (week) of van de 25e
// tot de 2e om 12:00 (maand), zie domain/reviews.js. `today` is de dag van de app (met de dagwissel); die bepaalt welke periode "nu" is.
// Tussen middernacht en de dagwissel is `today` dus nog gisteren, terwijl `now` al de nieuwe dag is: de review van de vorige week staat dan nog open.
import { addMonths, endOfMonth, endOfWeek, localNow, startOfMonth, startOfWeek } from '../domain/dates.js';
import { averageScore, reflectionsBetween } from '../domain/reflections.js';
import {
  monthReviewClosesOn,
  monthReviewFor,
  monthReviewOpensOn,
  monthReviewState,
  usedLongEnough,
  weekReviewClosesOn,
  weekReviewFor,
  weekReviewHasContent,
  weekReviewOpensOn,
  weekReviewState,
  weeksOfMonth,
} from '../domain/reviews.js';

/**
 * De eerste dag waarop de gebruiker iets heeft vastgelegd: de vroegste aanmaakdatum van een habit of check-in, als lokale dag.
 * null als dat niet te zeggen is (geen gegevens, of records zonder aanmaakdatum): dan houdt de wachttijd van een review niets tegen.
 */
export function firstUseDate(snapshot) {
  const stamps = [...(snapshot.habits ?? []), ...(snapshot.checkIns ?? [])].map((record) => record.createdAt).filter((stamp) => typeof stamp === 'string' && stamp !== '').sort();
  const first = stamps.length > 0 ? new Date(stamps[0]) : null;
  if (first === null || Number.isNaN(first.getTime())) return null;
  return localNow(first, snapshot.settings?.timezone).slice(0, 10);
}

/** De weekreview van de week waarin `date` valt: wat er is ingevuld (of null) en in welke fase hij is ('before' | 'open' | 'closed'). */
export function buildWeekReviewCard({ snapshot, now, date, today = now.slice(0, 10) }) {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  const record = weekReviewFor(snapshot.reviews, start);
  return {
    period: 'week',
    start,
    end,
    state: weekReviewState(start, now),
    tooEarly: weekReviewState(start, now) === 'open' && !usedLongEnough(firstUseDate(snapshot), today),
    isCurrent: start <= today && today <= end,
    review: weekReviewHasContent(record) ? record : null,
    opensOn: weekReviewOpensOn(start),
    closesOn: weekReviewClosesOn(start),
  };
}

/** Hoe de dagen van de week gingen (de dagreflecties, oudste eerst) en het gemiddelde cijfer; `days` is leeg als er niets is ingevuld. */
export function buildWeekDays({ snapshot, start, end }) {
  const days = reflectionsBetween(snapshot.dayReflections ?? [], start, end);
  return { days, average: averageScore(days) };
}

/**
 * De maandreview van de maand waarin `date` valt: de ingevulde weekreviews van die maand (oudste eerst), de afspraak voor de maand,
 * de fase, en wanneer de taak op Vandaag komt.
 */
export function buildMonthReviewCard({ snapshot, now, date, today = now.slice(0, 10) }) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
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
    tooEarly: monthReviewState(start, now) === 'open' && !usedLongEnough(firstUseDate(snapshot), today),
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
