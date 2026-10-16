// De weekpunten voor de ranglijst (docs/SOCIAAL.md §4). Puur: een snapshot in, een samenvatting uit.
//
// Over de laatste SCORE_WINDOW_DAYS dagen, vandaag meegerekend:
//   + TASK_POINTS per afgeronde taak (één afgevinkte habit op één dag; een teller die je half haalde telt voor de helft)
//   + opbouwbonus per taak zolang de habit nog niet eigen is: meer in de eerste 21 dagen, minder tot de ingeburgerd-grens (66);
//     bij een zeldzame taak (minder dan 1× per week) rekent hij in keren in plaats van dagen (pace.js)
//   + startbonus voor een nieuwe habit bij de eerste afgeronde taak (hoogstens START_BONUS_MAX per venster)
//   − MISS_PENALTY per gemiste dag (vaste dagen) of per ontbrekende keer als een week/maand eindigt (flexibele habits),
//     maar pas vanaf de tweede keer achter elkaar: een enkele misser per habit is gratis (MISS_GRACE). Nooit twee keer achter elkaar.
// De minpunten tellen alleen voor dagen die voorbij zijn, nooit voor vandaag; overslaan, pauze en een half gehaalde teller kosten
// niets en onderbreken een rij missers niet (net als bij de reeks); een afgeronde dag of een half gehaalde teller wel.
// Het totaal gaat nooit onder nul. Terugwerkend invullen (tot 14 dagen) herstelt dus ook de minpunten.
import {
  BUILD_BONUS_BUILDING, BUILD_BONUS_STARTING, DEFAULT_GRADUATION_DAYS, MISS_GRACE, MISS_PENALTY, PARTIAL_FRACTION, PHASE_STARTING_UNTIL_DAY,
  SCORE_WINDOW_DAYS, START_BONUS, START_BONUS_MAX, TASK_POINTS,
} from '../domain/constants.js';
import { addDays } from '../domain/dates.js';
import { paceOn } from '../domain/pace.js';
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

/**
 * Opbouwbonus voor een taak op `date`: 0 voor een habit die eigen is (of ingeburgerd verklaard), anders afhankelijk van de leeftijd.
 * Bij een zeldzame taak (minder dan 1× per week, zie pace.js) telt het hoeveelste keer het is (`repetition`) in plaats van de leeftijd,
 * want in de eerste 21 dagen komt zo'n taak maar één of twee keer voor.
 */
export function buildBonus({ habit, pauses, date, repetition = null }) {
  if (habit.status === 'graduated' && (!habit.graduatedAt || date >= habit.graduatedAt)) return 0;
  const pace = paceOn(habit, date);
  if (pace.sparse && repetition !== null) {
    if (repetition <= pace.startingRepetitions) return BUILD_BONUS_STARTING;
    return repetition <= pace.requiredRepetitions ? BUILD_BONUS_BUILDING : 0;
  }
  const age = countActiveDays({ habit, pauses, today: date });
  if (age <= PHASE_STARTING_UNTIL_DAY) return BUILD_BONUS_STARTING;
  return age <= (habit.graduationDays ?? DEFAULT_GRADUATION_DAYS) ? BUILD_BONUS_BUILDING : 0;
}

/** Punten voor één afgevinkte taak: basis + opbouwbonus, voor een half gehaalde teller de helft. */
const taskValue = (bonus, status) => (status === 'partial' ? Math.floor(((TASK_POINTS + bonus) * PARTIAL_FRACTION)) : TASK_POINTS + bonus);

/**
 * Minpunten van één habit binnen het venster, in aantallen missers. Een afgesloten eenheid die gemist is
 * telt als één misser in de rij en kost, als hij niet gratis is, een aftrek per ontbrekende keer. Per habit is de eerste misser van een
 * rij gratis (MISS_GRACE); elke misser die er direct op volgt kost.
 * Een rij loopt door zolang er niets is afgerond: overslaan, pauze en een nog lopende eenheid onderbreken hem niet, een afgeronde
 * eenheid of een dag met een half gehaalde teller (partial) wel. De rij begint niet bij het venster: een miss vlak voor de
 * eerste dag van het venster telt mee als "de vorige keer".
 */
function missesIn({ units, checkIns }, first, today) {
  const partialDates = new Set(checkIns.filter((c) => c.status === 'partial').map((c) => c.date));
  let run = 0;
  let misses = 0;
  for (const unit of units) {
    const partial = unit.kind === 'day' && partialDates.has(unit.end);
    if (unit.status === 'done' || unit.status === 'minimal' || partial) {
      run = 0;
    } else if (unit.status === 'missed' && unit.end < today) {
      // één eenheid is één misser in de rij, ook als er meer keren ontbreken; kost hij, dan per ontbrekende keer
      const missing = unit.kind === 'day' ? 1 : Math.max(1, (unit.target ?? 1) - (unit.count ?? 0));
      run += 1;
      if (unit.end >= first && run > MISS_GRACE) misses += missing;
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

    const doneDates = checkIns.filter((c) => counts(c.status) && c.date <= today).map((c) => c.date);
    let firstProgress = null;
    for (const c of checkIns) {
      if (!progress(c.status) || c.date > today) continue;
      if (firstProgress === null || c.date < firstProgress) firstProgress = c.date;
      if (lastActive === null || c.date > lastActive) lastActive = c.date;
      if (c.date < first) continue;
      const repetition = doneDates.filter((d) => d < c.date).length + 1; // het hoeveelste afgeronde keer deze taak is
      const extra = buildBonus({ habit, pauses, date: c.date, repetition });
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
