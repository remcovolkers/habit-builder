// De weekpunten voor de ranglijst (docs/SOCIAAL.md §4). Puur: een snapshot in, een samenvatting uit.
//
// Over de laatste SCORE_WINDOW_DAYS dagen, vandaag meegerekend:
//   + TASK_POINTS per afgeronde taak (één afgevinkte habit op één dag; een teller die je half haalde telt voor de helft)
//   + opbouwbonus per taak zolang de habit nog niet eigen is: meer in de eerste 21 dagen, minder tot de ingeburgerd-grens (66)
//   + startbonus voor een nieuwe habit bij de eerste afgeronde taak (hoogstens START_BONUS_MAX per venster)
//   − MISS_PENALTY per gemiste dag (vaste dagen) of per ontbrekende keer als een week/maand eindigt (flexibele habits)
// De minpunten tellen alleen voor dagen die voorbij zijn, nooit voor vandaag; overslaan, pauze en een half gehaalde teller kosten
// niets. Het totaal gaat nooit onder nul. Terugwerkend invullen (tot 14 dagen) herstelt dus ook de minpunten.
import {
  BUILD_BONUS_BUILDING, BUILD_BONUS_STARTING, DEFAULT_GRADUATION_DAYS, MISS_PENALTY, PARTIAL_FRACTION, PHASE_STARTING_UNTIL_DAY,
  SCORE_WINDOW_DAYS, START_BONUS, START_BONUS_MAX, TASK_POINTS,
} from '../domain/constants.js';
import { addDays } from '../domain/dates.js';
import { countActiveDays } from '../domain/phases.js';
import { isTracked } from '../domain/rules.js';
import { computeStreaks } from '../domain/streaks.js';
import { computeUnits } from '../domain/units.js';
import { prepareSnapshot } from './day-view.js';

const counts = (status) => status === 'done' || status === 'minimal';
const progress = (status) => counts(status) || status === 'partial';

/** De dagen van het venster, oudste eerst, eindigend op vandaag. */
export function scoreWindow(today) {
  return Array.from({ length: SCORE_WINDOW_DAYS }, (_, index) => addDays(today, index - (SCORE_WINDOW_DAYS - 1)));
}

/** Opbouwbonus voor een taak op `date`: 0 voor een habit die eigen is (of ingeburgerd verklaard), anders afhankelijk van de leeftijd. */
export function buildBonus({ habit, pauses, date }) {
  if (habit.status === 'graduated' && (!habit.graduatedAt || date >= habit.graduatedAt)) return 0;
  const age = countActiveDays({ habit, pauses, today: date });
  if (age <= PHASE_STARTING_UNTIL_DAY) return BUILD_BONUS_STARTING;
  return age <= (habit.graduationDays ?? DEFAULT_GRADUATION_DAYS) ? BUILD_BONUS_BUILDING : 0;
}

/** Punten voor één afgevinkte taak: basis + opbouwbonus, voor een half gehaalde teller de helft. */
const taskValue = (bonus, status) => (status === 'partial' ? Math.floor(((TASK_POINTS + bonus) * PARTIAL_FRACTION)) : TASK_POINTS + bonus);

/**
 * Minpunten van één habit binnen het venster. Een afgesloten eenheid die gemist is telt als één miss per ontbrekende keer.
 * Een dag met een half gehaalde teller (partial) is niet gemist.
 */
function missesIn({ units, checkIns }, first, today) {
  const partialDates = new Set(checkIns.filter((c) => c.status === 'partial').map((c) => c.date));
  let misses = 0;
  for (const unit of units) {
    if (unit.status !== 'missed' || unit.end < first || unit.end >= today) continue;
    if (unit.kind === 'day') {
      if (!partialDates.has(unit.end)) misses += 1;
    } else {
      misses += Math.max(1, (unit.target ?? 1) - (unit.count ?? 0));
    }
  }
  return misses;
}

/**
 * snapshot: { habits, checkIns, pauses }
 * Geeft de samenvatting die met vrienden gedeeld wordt: alleen getallen en datums, nooit namen of notities.
 *   points       – het totaal (nooit onder nul)
 *   done         – het aantal afgeronde taken in het venster
 *   streak       – langste lopende reeks (dagen) onder de habits met vaste dagen
 *   activeHabits – habits die vandaag meetellen
 *   lastActive   – laatste dag waarop je iets afvinkte (bepaalt of je in andermans lijst staat)
 *   breakdown    – waar de punten vandaan komen (voor je eigen scherm): { tasks, bonus, start, penalty }
 */
export function buildScoreSummary({ snapshot, today }) {
  const [first] = scoreWindow(today);
  const prepared = prepareSnapshot(snapshot);

  let done = 0;
  let tasks = 0;
  let bonus = 0;
  let penalty = 0;
  let streak = 0;
  let lastActive = null;
  const starts = [];

  for (const bundle of prepared.bundles) {
    const { habit, checkIns, pauses } = bundle;

    let firstProgress = null;
    for (const c of checkIns) {
      if (!progress(c.status) || c.date > today) continue;
      if (firstProgress === null || c.date < firstProgress) firstProgress = c.date;
      if (lastActive === null || c.date > lastActive) lastActive = c.date;
      if (c.date < first) continue;
      const extra = buildBonus({ habit, pauses, date: c.date });
      const value = taskValue(extra, c.status);
      const baseValue = taskValue(0, c.status);
      tasks += baseValue;
      bonus += value - baseValue;
      if (counts(c.status)) done += 1;
    }
    if (firstProgress !== null && firstProgress >= first) starts.push(firstProgress);

    if (isTracked(habit, today)) {
      const units = computeUnits({ habit, checkIns, pauses, today });
      penalty += missesIn({ units, checkIns }, first, today) * MISS_PENALTY;
      if (units.at(-1)?.kind === 'day') streak = Math.max(streak, computeStreaks(units).current);
    }
  }

  const start = Math.min(starts.length, START_BONUS_MAX) * START_BONUS;
  return {
    asOf: today,
    points: Math.max(0, tasks + bonus + start - penalty),
    done,
    streak,
    activeHabits: snapshot.habits.filter((habit) => isTracked(habit, today)).length,
    lastActive,
    breakdown: { tasks, bonus, start, penalty },
  };
}
