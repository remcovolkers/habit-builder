// "Plan je week": per flexibele taak (N× per week of maand) de komende zeven dagen, en een voorstel dat de nog ontbrekende keren verdeelt. Puur.
// Het plannen zelf gaat met de bestaande dagplanning (actions.js: planHabit en unplanHabit), dus ook maximaal PLAN_AHEAD_DAYS vooruit.
import { PLAN_AHEAD_DAYS } from '../domain/constants.js';
import { addDays, diffDays, eachDay, endOfWeek, startOfWeek } from '../domain/dates.js';
import { isTracked } from '../domain/rules.js';
import { lastChanceThisWeek, neededInWindow, planSkippedIn } from '../domain/planning.js';
import { isTight } from '../domain/tight.js';
import { isOnTrial } from '../domain/trial.js';
import { computeUnits } from '../domain/units.js';

const counts = (status) => status === 'done' || status === 'minimal';
const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'nl');

/**
 * Eén rij per taak die in een week of maand gehaald moet worden en nu loopt:
 *   unit        { span, count, target, end, days }  de week of maand van vandaag
 *   days        [{ date, state, inUnit }]  maandag van de week die je plant t/m over zeven dagen; state: 'done' | 'planned' | 'free' | 'blocked' (gepauzeerd, overgeslagen of
 *               buiten de looptijd) | 'past' (een dag die al geweest is en waarop de taak niet is gedaan; een geweest-en-gedaan dag is 'done')
 *   anchors     de dagen waarop de taak in deze periode al is gedaan of gepland (voor het verdelen)
 *   planned     hoeveel dagen er in deze periode al gepland zijn
 *   free        hoeveel vrije dagen er in deze periode nog zijn om te plannen
 *   missing     hoeveel keren er nu nog een dag moeten krijgen: wat nog moet min wat gepland is. Bij een taak per maand alleen je deel van dit venster
 *               (domain/planning.js): de rest plan je later in de maand
 *   urgent      dreigt te falen (atRisk of krap, zie domain/tight.js)
 *   lastChance  deze week is de laatste kans: slaat de gebruiker de taak (per maand) deze week over, dan haalt hij zijn doel niet meer
 *               (domain/planning.js); daysAfter zegt hoeveel dagen er na deze week nog in de maand zitten
 *   startsOn    de startdatum als de taak pas later in het venster begint (anders null); de dagen ervoor zijn 'blocked'.
 *               Begint hij pas in de volgende week of maand, dan is dat ook de `unit` (unit.start > vandaag)
 *   skipped     de gebruiker koos "Niet in deze week" (habit.noPlanWeeks bevat de maandag van deze week): geen herinnering en geen voorstel voor deze taak.
 *               Dat verandert niets aan de afspraak zelf: de taak blijft staan en kan later in de maand nog gedaan of ingepland worden.
 *               Kijk je in Vandaag naar een dag in de volgende week (`date`), dan plan je die week en staat de keuze voor die week er los van.
 */
export function buildWeekPlan({ snapshot, today, date = today }) {
  const lastDay = addDays(today, PLAN_AHEAD_DAYS);
  // De week die je plant: die van `date` (de dag die Vandaag toont). Kijk je naar een dag in de volgende week, dan is dat die week vanaf maandag,
  // met een eigen "Niet in deze week"; op zondag zelf geldt nog die van de lopende week.
  const from = planningStart({ today, date });
  const dates = eachDay(startOfWeek(from), lastDay);
  const rows = [];
  for (const habit of [...snapshot.habits].sort(byOrder)) {
    // Een taak die binnen het venster start (morgen, overmorgen, ...) staat er ook in, alleen te plannen vanaf zijn startdatum: de rekening gaat dan
    // vanaf die dag (`asOf`), zodat de eerste week of maand maar telt vanaf de start.
    const startsLater = habit.startDate > from && habit.startDate <= lastDay;
    const asOf = startsLater ? habit.startDate : from;
    if (!isTracked(habit, asOf)) continue;
    // een taak in een proef "zonder app" is niet aan de beurt: geen rij, dus ook niet meegeteld en niet in "Verdeel voor mij"
    if (isOnTrial(habit, today)) continue;
    const mine = snapshot.checkIns.filter((c) => c.habitId === habit.id);
    const pauses = snapshot.pauses.filter((p) => p.habitId === habit.id);
    const paused = (date) => pauses.some((p) => date >= p.from && (p.to == null || date <= p.to));
    // een gepauzeerde taak is nu niet aan de beurt: geen rij en dus ook niet meegeteld (op Vandaag staat hij ook niet in de stapel)
    if (paused(asOf)) continue;
    const unit = computeUnits({ habit, checkIns: mine, pauses, today: asOf }).find((u) => u.type === 'times_per_period' && u.start <= asOf && asOf <= u.end);
    if (!unit) continue;

    const statusOn = new Map(mine.map((c) => [c.date, c.status]));
    const planned = new Set(snapshot.dayPlans.filter((p) => p.habitId === habit.id).map((p) => p.date));
    const days = dates.map((date) => {
      const status = statusOn.get(date);
      let state = 'free';
      if (date < today) state = counts(status) ? 'done' : 'past';
      else if (date < habit.startDate || (habit.endDate != null && date > habit.endDate) || paused(date) || status === 'skipped') state = 'blocked';
      else if (counts(status)) state = 'done';
      else if (planned.has(date)) state = 'planned';
      return { date, state, inUnit: date <= unit.end };
    });
    const doneBefore = mine.filter((c) => counts(c.status) && c.date >= unit.start && c.date <= asOf).map((c) => c.date);
    const plannedHere = days.filter((d) => d.state === 'planned' && d.inUnit).map((d) => d.date);
    rows.push({
      habit,
      unit: { span: unit.span, count: unit.count, target: unit.target, start: unit.start, end: unit.end, days: unit.days, remainingDays: unit.remainingDays },
      days,
      anchors: [...new Set([...doneBefore, ...plannedHere])],
      planned: plannedHere.length,
      free: days.filter((d) => d.state === 'free' && d.inUnit).length,
      missing: Math.max(0, neededInWindow({ span: unit.span, open: unit.target - unit.count, remainingDays: unit.remainingDays }) - plannedHere.length),
      urgent: unit.count < unit.target && (unit.atRisk || isTight(unit)),
      skipped: planSkippedIn(habit, startOfWeek(from)),
      startsOn: startsLater ? habit.startDate : null,
      ...lastChanceThisWeek({ span: unit.span, open: unit.target - unit.count, planned: plannedHere.length, unitEnd: unit.end, weekEnd: endOfWeek(from) }),
    });
  }
  return rows;
}

/**
 * Vanaf welke dag reken je met het plannen: vandaag, of de maandag van de week van `date` als je naar een dag in een latere week kijkt.
 * Ook de dag voor "Niet in deze week" (setPlanSkip): die hoort bij de week van deze dag.
 */
export function planningStart({ today, date = today }) {
  const weekStart = startOfWeek(date);
  return weekStart > today ? weekStart : today;
}

/**
 * Een voorstel voor de ontbrekende keren: [{ habitId, date }]. Per taak komen de dagen zo ver mogelijk uit elkaar (tot de afstand die bij het
 * ritme past: periode gedeeld door het aantal keren), zo vroeg mogelijk, en op de dag met de minste andere taken. De taak met de minste ruimte gaat eerst.
 */
export function suggestPlan(rows) {
  const load = new Map();
  for (const row of rows) for (const day of row.days) if (day.state === 'planned') load.set(day.date, (load.get(day.date) ?? 0) + 1);
  const order = rows.filter((row) => row.missing > 0 && !row.skipped).sort((a, b) => a.free / a.missing - b.free / b.missing);

  const picks = [];
  for (const row of order) {
    const spacing = Math.max(1, Math.floor(row.unit.days / row.unit.target));
    const candidates = row.days.filter((d) => d.state === 'free' && d.inUnit).map((d) => d.date);
    const anchors = [...row.anchors];
    for (let need = row.missing; need > 0 && candidates.length > 0; need -= 1) {
      const scored = candidates.map((date) => ({
        date,
        distance: Math.min(spacing, anchors.length === 0 ? spacing : Math.min(...anchors.map((a) => Math.abs(diffDays(date, a))))),
        load: load.get(date) ?? 0,
      }));
      scored.sort((a, b) => b.distance - a.distance || a.load - b.load || (a.date < b.date ? -1 : 1));
      const best = scored[0].date;
      picks.push({ habitId: row.habit.id, date: best });
      anchors.push(best);
      load.set(best, (load.get(best) ?? 0) + 1);
      candidates.splice(candidates.indexOf(best), 1);
    }
  }
  return picks;
}
