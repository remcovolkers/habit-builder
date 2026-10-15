// De weekpunten voor de ranglijst (docs/SOCIAAL.md §4). Puur: een snapshot in, een samenvatting uit.
//
// Een vast aantal punten per afgeronde taak (TASK_POINTS), over de laatste SCORE_WINDOW_DAYS dagen, vandaag meegerekend.
// Een taak is één afgevinkte habit op één dag (gedaan of minimale versie). Daarmee is er geen noemer: je krijgt punten voor wat
// je doet, flexibele habits doen precies hetzelfde mee als vaste, en je punten dalen alleen doordat een oude dag uit het venster schuift.
import { SCORE_WINDOW_DAYS, TASK_POINTS } from '../domain/constants.js';
import { addDays } from '../domain/dates.js';
import { isTracked } from '../domain/rules.js';
import { computeStreaks } from '../domain/streaks.js';
import { computeUnits } from '../domain/units.js';
import { prepareSnapshot } from './day-view.js';

const counts = (status) => status === 'done' || status === 'minimal';

/** De dagen van het venster, oudste eerst, eindigend op vandaag. */
export function scoreWindow(today) {
  return Array.from({ length: SCORE_WINDOW_DAYS }, (_, index) => addDays(today, index - (SCORE_WINDOW_DAYS - 1)));
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
 * snapshot: { habits, checkIns, pauses }
 * Geeft de samenvatting die met vrienden gedeeld wordt: alleen getallen en datums, nooit namen of notities.
 *   points       – afgeronde taken in het venster × TASK_POINTS
 *   done         – het aantal afgeronde taken zelf
 *   streak       – langste lopende reeks (dagen) onder de habits met vaste dagen
 *   activeHabits – habits die vandaag meetellen
 *   lastActive   – laatste dag waarop je iets afvinkte (bepaalt of je in andermans lijst staat)
 */
export function buildScoreSummary({ snapshot, today }) {
  const [first] = scoreWindow(today);
  const known = new Set(snapshot.habits.map((habit) => habit.id));
  const done = snapshot.checkIns.filter((c) => counts(c.status) && c.date >= first && c.date <= today && known.has(c.habitId)).length;
  return {
    asOf: today,
    points: done * TASK_POINTS,
    done,
    streak: currentDayStreak({ prepared: prepareSnapshot(snapshot), today }),
    activeHabits: snapshot.habits.filter((habit) => isTracked(habit, today)).length,
    lastActive: lastActiveDate(snapshot, today),
  };
}
