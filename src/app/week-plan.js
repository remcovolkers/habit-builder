// "Plan je week": per flexibele taak (N× per week of maand) de komende zeven dagen, en een voorstel dat de nog ontbrekende keren verdeelt. Puur.
// Het plannen zelf gaat met de bestaande dagplanning (actions.js: planHabit en unplanHabit), dus ook maximaal PLAN_AHEAD_DAYS vooruit.
import { PLAN_AHEAD_DAYS } from '../domain/constants.js';
import { addDays, diffDays, eachDay, startOfWeek } from '../domain/dates.js';
import { isTracked } from '../domain/rules.js';
import { isTight } from '../domain/tight.js';
import { computeUnits } from '../domain/units.js';

const counts = (status) => status === 'done' || status === 'minimal';
const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'nl');

/**
 * Eén rij per taak die in een week of maand gehaald moet worden en nu loopt:
 *   unit        { span, count, target, end, days }  de week of maand van vandaag
 *   days        [{ date, state, inUnit }]  vandaag t/m over zeven dagen; state: 'done' | 'planned' | 'free' | 'blocked' (gepauzeerd, overgeslagen of buiten de looptijd)
 *   anchors     de dagen waarop de taak in deze periode al is gedaan of gepland (voor het verdelen)
 *   planned     hoeveel dagen er in deze periode al gepland zijn
 *   free        hoeveel vrije dagen er in deze periode nog zijn om te plannen
 *   missing     hoeveel keren er nog bij moeten voordat de afspraak gehaald is (nog te doen min gepland)
 *   urgent      dreigt te falen (atRisk of krap, zie domain/tight.js)
 *   skipped     de gebruiker koos "Niet in deze week" (habit.noPlanWeek is de maandag van deze week): geen herinnering en geen voorstel voor deze taak.
 *               Dat verandert niets aan de afspraak zelf: de taak blijft staan en kan later in de maand nog gedaan of ingepland worden.
 */
export function buildWeekPlan({ snapshot, today }) {
  const dates = eachDay(today, addDays(today, PLAN_AHEAD_DAYS));
  const rows = [];
  for (const habit of [...snapshot.habits].sort(byOrder)) {
    if (!isTracked(habit, today)) continue;
    const mine = snapshot.checkIns.filter((c) => c.habitId === habit.id);
    const pauses = snapshot.pauses.filter((p) => p.habitId === habit.id);
    const paused = (date) => pauses.some((p) => date >= p.from && (p.to == null || date <= p.to));
    // een gepauzeerde taak is nu niet aan de beurt: geen rij en dus ook niet meegeteld (op Vandaag staat hij ook niet in de stapel)
    if (paused(today)) continue;
    const unit = computeUnits({ habit, checkIns: mine, pauses, today }).find((u) => u.type === 'times_per_period' && u.start <= today && today <= u.end);
    if (!unit) continue;

    const statusOn = new Map(mine.map((c) => [c.date, c.status]));
    const planned = new Set(snapshot.dayPlans.filter((p) => p.habitId === habit.id).map((p) => p.date));
    const days = dates.map((date) => {
      const status = statusOn.get(date);
      let state = 'free';
      if (date < habit.startDate || (habit.endDate != null && date > habit.endDate) || paused(date) || status === 'skipped') state = 'blocked';
      else if (counts(status)) state = 'done';
      else if (planned.has(date)) state = 'planned';
      return { date, state, inUnit: date <= unit.end };
    });
    const doneBefore = mine.filter((c) => counts(c.status) && c.date >= unit.start && c.date <= today).map((c) => c.date);
    const plannedHere = days.filter((d) => d.state === 'planned' && d.inUnit).map((d) => d.date);
    rows.push({
      habit,
      unit: { span: unit.span, count: unit.count, target: unit.target, end: unit.end, days: unit.days, remainingDays: unit.remainingDays },
      days,
      anchors: [...new Set([...doneBefore, ...plannedHere])],
      planned: plannedHere.length,
      free: days.filter((d) => d.state === 'free' && d.inUnit).length,
      missing: Math.max(0, unit.target - unit.count - plannedHere.length),
      urgent: unit.count < unit.target && (unit.atRisk || isTight(unit)),
      skipped: habit.noPlanWeek === startOfWeek(today),
    });
  }
  return rows;
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
