// Het view-model voor het Vandaag-scherm: snapshot + datum in, gegroepeerde lijsten uit. Puur.
import { endOfWeek, startOfWeek } from '../domain/dates.js';
import { lastChanceThisWeek, planSkippedIn } from '../domain/planning.js';
import { DAYPARTS } from '../domain/habit.js';
import { appointmentsOn } from '../domain/appointments.js';
import { donePartsOf, habitDayparts, hasMultipleDayparts } from '../domain/dayparts.js';
import { paceOn } from '../domain/pace.js';
import { isTight } from '../domain/tight.js';
import { isOnTrial } from '../domain/trial.js';
import { canBackfill } from '../domain/rules.js';
import { buildToday } from '../domain/today.js';

/** Een kaart die overgeslagen of opgegeven is telt niet mee in "x van y" (en niet in de ring). */
export const isSetAside = (entry) => entry.loggedToday === 'skipped' || entry.loggedToday === 'wont';

const byHabitOrder = (a, b) =>
  (a.habit.sortOrder ?? 0) - (b.habit.sortOrder ?? 0) || a.habit.name.localeCompare(b.habit.name, 'nl');

/**
 * Groepeert de gegevens per habit, één keer. Wie veel dagen achter elkaar nodig heeft (weekstrook, overzicht) maakt dit één keer
 * en geeft het aan elke buildDayView mee.
 *
 * `from` (optioneel): rekent alleen met gegevens vanaf die datum. Dat is veel sneller bij een lange geschiedenis en geeft
 * dezelfde uitkomst voor dagen die minstens een maand na `from` liggen (een week of maand is dan nooit doormidden gesneden).
 */
export function prepareSnapshot(snapshot, from = null) {
  const { habits, checkIns, pauses } = snapshot;
  const checkInsBy = new Map();
  const pausesBy = new Map();
  for (const c of checkIns) {
    if (from !== null && c.date < from) continue;
    if (!checkInsBy.has(c.habitId)) checkInsBy.set(c.habitId, []);
    checkInsBy.get(c.habitId).push(c);
  }
  for (const p of pauses) {
    if (!pausesBy.has(p.habitId)) pausesBy.set(p.habitId, []);
    pausesBy.get(p.habitId).push(p);
  }
  return {
    habitById: new Map(habits.map((h) => [h.id, h])),
    bundles: habits.map((habit) => ({
      habit: from !== null && habit.startDate < from ? { ...habit, startDate: from } : habit,
      checkIns: checkInsBy.get(habit.id) ?? [],
      pauses: pausesBy.get(habit.id) ?? [],
    })),
  };
}

/**
 * snapshot: { habits, checkIns, pauses, dayPlans, appointments? }
 * date: de dag die getoond wordt; today: de echte "vandaag" (met dagwissel).
 *
 * mode: 'past' | 'today' | 'future'
 * canLog:  afvinken mag (vandaag en tot 14 dagen terug)
 * canPlan: stapel-items mogen aan deze dag worden toegevoegd (vandaag en later)
 */
export function buildDayView({ snapshot, date, today, prepared = null }) {
  const { habits, dayPlans } = snapshot;
  const { habitById, bundles } = prepared ?? prepareSnapshot(snapshot);

  const day = buildToday({ bundles, dayPlans, today: date, now: today });
  const attach = (entry) => ({ ...entry, habit: habitById.get(entry.habitId) });

  // Een zeldzame taak (pace.js) vraagt na het afvinken hoe automatisch het ging: één cijfer per week waarin hij is gedaan.
  const weekStart = startOfWeek(date);
  const ratings = snapshot.ratings ?? [];
  const withAutomaticity = (entry) => {
    const { habit } = entry;
    if (!entry.doneToday || habit.status !== 'active' || !paceOn(habit, date).sparse) return entry;
    const rating = ratings.find((r) => r.habitId === habit.id && r.weekStart === weekStart);
    return { ...entry, automaticity: { score: rating?.score ?? null, cues: rating?.cues ?? [] } };
  };

  // een taak in een proef "zonder app" (domain/trial.js) staat nergens op Vandaag: geen kaartje, ook niet als hij nog ingepland stond
  // "Ga ik niet doen" (docs/WONT-DO.md): de reden en het plan die bij die dag horen, voor onder de kaart
  const reasons = snapshot.reasons ?? [];
  const withWont = (entry) => {
    if (entry.loggedToday !== 'wont') return entry;
    const found = reasons.find((r) => r.habitId === entry.habitId && r.date === date);
    return { ...entry, wontToday: found ? { reason: found.reason, note: found.note ?? null, plan: found.plan ?? null } : null };
  };

  const entries = [...day.scheduled, ...day.planned].map(attach).filter((e) => !isOnTrial(e.habit, date)).map(withAutomaticity).map(withWont).sort(byHabitOrder);

  // Een habit met meerdere dagdelen staat in elk dagdeel, met een eigen vinkje: `part` is het dagdeel van deze kaart, `partDone` of dat gedaan is,
  // en `doneToday` volgt dat dagdeel (zodat de teller per dagdeel klopt). `partsDone` en `partsTotal` zijn de stand van de hele dag.
  const forPart = (entry, part) => {
    if (!hasMultipleDayparts(entry.habit)) return entry;
    const done = donePartsOf(entry.habit, { status: entry.loggedToday, parts: entry.partsToday });
    return { ...entry, part, partDone: done.includes(part), partsDone: done.length, partsTotal: habitDayparts(entry.habit).length, doneToday: done.includes(part) };
  };
  // Losse afspraken staan in hun dagdeel onder de habits. Ze tellen nergens mee (niet in `progress`, het feest of de punten); een dagdeel met alleen
  // afspraken bestaat wel (docs/LOSSE-AFSPRAKEN.md).
  const allAppointments = snapshot.appointments ?? [];
  const appointments = appointmentsOn({ appointments: allAppointments, date, today });
  const groups = DAYPARTS.map((daypart) => ({
    daypart,
    entries: entries.filter((e) => habitDayparts(e.habit).includes(daypart)).map((e) => forPart(e, daypart)),
    appointments: appointments.filter((a) => a.daypart === daypart),
  })).filter((g) => g.entries.length > 0 || g.appointments.length > 0);

  // een taak in de stapel dreigt te falen als het echt niet meer kan (atRisk) of al krap wordt (domain/tight.js); die komen bovenaan
  // Een taak waarvan alle keren die nog moeten al een dag hebben (covered) is niet meer te plannen: hij dreigt niet te falen en zakt naar beneden
  const withUrgency = (entry) => {
    const covered = !entry.satisfied && entry.plannedDates.length > 0 && entry.missingToPlan === 0;
    const tight = !entry.satisfied && !covered && isTight({ count: entry.count, target: entry.target, remainingDays: entry.remainingDays, days: entry.unit.days, activeDays: entry.unit.activeDays });
    const atRisk = entry.atRisk && !covered;
    return { ...entry, covered, tight, atRisk, urgent: !entry.satisfied && !covered && (atRisk || tight) };
  };
  // "Niet in deze week" (Plan je week): zo'n taak staat die week niet in de stapel. Inplannen kan nog via Plan je week; heeft hij al een dag of is hij gedaan, dan staat hij gewoon bij de dag
  const inPool = day.pool.map(attach);
  const hidden = inPool.filter((entry) => planSkippedIn(entry.habit, weekStart));
  const pool = inPool.filter((entry) => !planSkippedIn(entry.habit, weekStart) && !isOnTrial(entry.habit, date)).map(withUrgency).sort(
    (a, b) =>
      Number(a.satisfied) - Number(b.satisfied) ||
      Number(a.covered) - Number(b.covered) ||
      Number(b.urgent) - Number(a.urgent) ||
      Number(b.atRisk) - Number(a.atRisk) ||
      a.remainingDays - b.remainingDays ||
      byHabitOrder(a, b),
  );

  // wat je hebt overgeslagen of opgegeven ("ga ik niet doen") staat niet meer open: de teller en "alles gedaan" gaan over wat nog kan
  const counted = entries.filter((e) => !isSetAside(e));
  return {
    date,
    hasHabits: habits.length > 0,
    hasAppointments: allAppointments.length > 0, // ook als er op deze dag niets staat: dan blijft "Afspraak toevoegen" bereikbaar
    mode: date < today ? 'past' : date === today ? 'today' : 'future',
    canLog: date <= today && canBackfill(date, today),
    canPlan: date >= today,
    groups,
    pool,
    poolSkipped: hidden.length, // hoeveel taken er door "Niet in deze week" uit de stapel zijn gehaald
    // en bij hoeveel daarvan is dat de laatste kans (een taak per maand die zo zijn doel niet meer haalt)
    poolSkippedLast: hidden.filter((entry) => !entry.satisfied && lastChanceThisWeek({ span: entry.span, open: entry.target - entry.count, planned: entry.plannedDates.length, unitEnd: entry.unit.end, weekEnd: endOfWeek(date) }).lastChance).length,
    progress: { done: counted.filter((e) => e.doneToday).length, total: counted.length },
  };
}
