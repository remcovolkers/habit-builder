// De weekscore voor de ranglijst (docs/SOCIAAL.md §4). Puur: een snapshot in, een samenvatting uit.
//
// Punten per dag: per dag telt gedaan ÷ gepland, zoals de weekstrook dat al toont (buildDayView). Een flexibele habit
// levert dus punten op de dag dat je hem afvinkt. Vandaag telt alleen mee voor wat je gedaan hebt: afvinken is meteen
// zichtbaar en je score daalt niet omdat het ochtend is. Pas als de dag voorbij is, telt wat je liet liggen als gemist.
import { SCORE_MIN_PLANNED, SCORE_WINDOW_DAYS } from '../domain/constants.js';
import { addDays } from '../domain/dates.js';
import { isTracked } from '../domain/rules.js';
import { computeStreaks } from '../domain/streaks.js';
import { computeUnits } from '../domain/units.js';
import { buildDayView, prepareSnapshot } from './day-view.js';
import { horizonFor } from './overview.js';

const counts = (status) => status === 'done' || status === 'minimal';

/** De dagen van het venster, oudste eerst, eindigend op vandaag. */
export function scoreWindow(today) {
  return Array.from({ length: SCORE_WINDOW_DAYS }, (_, index) => addDays(today, index - (SCORE_WINDOW_DAYS - 1)));
}

/**
 * Per dag van het venster: { date, done, planned }. `prepared` is optioneel; zonder wordt de geschiedenis gekort tot wat
 * voor deze dagen nodig is (dezelfde uitkomst, veel sneller; zie tests/app/score.test.js).
 */
export function computeWindowPoints({ snapshot, today, prepared = null }) {
  const days = scoreWindow(today);
  const use = prepared ?? prepareSnapshot(snapshot, horizonFor(days[0]));
  return days.map((date) => {
    const { done, total } = buildDayView({ snapshot, date, today, prepared: use }).progress;
    return { date, done, planned: date === today ? done : total };
  });
}

/**
 * De langste lopende reeks onder de habits met vaste dagen (een flexibele habit heeft weken als eenheid, dat zijn geen dagen).
 * Een open eenheid (vandaag nog niet gedaan) onderbreekt de reeks niet.
 */
function currentDayStreak({ prepared, today }) {
  let best = 0;
  for (const { habit, checkIns, pauses } of prepared.bundles) {
    if (!isTracked(habit, today)) continue;
    const units = computeUnits({ habit, checkIns, pauses, today });
    if (units.at(-1)?.kind !== 'day') continue;
    best = Math.max(best, computeStreaks(units).current);
  }
  return best;
}

/** De laatste dag waarop iets is afgevinkt, of null. */
function lastActiveDate({ checkIns }, today) {
  let last = null;
  for (const c of checkIns) {
    if (counts(c.status) && c.date <= today && (last === null || c.date > last)) last = c.date;
  }
  return last;
}

/**
 * snapshot: { habits, checkIns, pauses, dayPlans }
 * Geeft de samenvatting die met vrienden gedeeld wordt: alleen getallen en datums, nooit namen of notities.
 *   score        – 0–100, of null als er te weinig gepland stond om iets eerlijks te zeggen
 *   planned/done – de optelling waar de score uit volgt
 *   streak       – langste lopende reeks (dagen) onder de habits met vaste dagen
 *   activeHabits – habits die vandaag meetellen
 *   lastActive   – laatste dag waarop je iets afvinkte (bepaalt of je in andermans lijst staat)
 */
export function buildScoreSummary({ snapshot, today }) {
  const points = computeWindowPoints({ snapshot, today });
  const planned = points.reduce((sum, p) => sum + p.planned, 0);
  const done = points.reduce((sum, p) => sum + p.done, 0);
  return {
    asOf: today,
    score: planned >= SCORE_MIN_PLANNED ? Math.round((done / planned) * 100) : null,
    planned,
    done,
    streak: currentDayStreak({ prepared: prepareSnapshot(snapshot), today }),
    activeHabits: snapshot.habits.filter((habit) => isTracked(habit, today)).length,
    lastActive: lastActiveDate(snapshot, today),
  };
}
