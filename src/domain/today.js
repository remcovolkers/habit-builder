// Het Vandaag-scherm en de stapel (PLAN §4.6, F10–F12), afgeleid uit check-ins en dagplannen.
// Niets wordt gemuteerd: een plan van gisteren zonder check-in valt vanzelf terug in de stapel.
import { computeUnits } from './units.js';
import { neededInWindow } from './planning.js';
import { isTracked } from './rules.js';

const counts = (status) => status === 'done' || status === 'minimal';

/**
 * bundles:  [{ habit, checkIns, pauses }]
 * dayPlans: [{ habitId, date }]  — flexibele habits die de gebruiker voor een dag heeft meegenomen
 *
 * Geeft:
 *   scheduled – vaste weekdagen van vandaag en dag-van-de-maand-eenheden die open staan (of vandaag zijn gelogd)
 *   planned   – flexibele habits die vandaag zijn meegenomen of vandaag al zijn gelogd
 *   pool      – de stapel: flexibele habits van de lopende week/maand die niet vandaag zijn ingepland. Elke kaart weet ook op welke andere dagen hij al
 *               is ingepland (plannedDates: vanaf de echte vandaag, in dezelfde week of maand, zonder gelogde dag) en hoeveel keren er dan nog
 *               zonder dag zijn (missingToPlan); alles gedekt = covered (dag-view.js)
 * Volgorde = volgorde van `bundles`; sorteren is aan de UI.
 */
export function buildToday({ bundles, dayPlans = [], today, now = today }) {
  const scheduled = [];
  const planned = [];
  const pool = [];

  for (const { habit, checkIns = [], pauses = [] } of bundles) {
    if (!isTracked(habit, today)) continue;

    let loggedToday;
    let valueToday = null;
    let partsToday = null;
    let noteToday = null;
    for (const c of checkIns) {
      if (c.date === today) {
        loggedToday = c.status;
        valueToday = c.value ?? null;
        partsToday = c.parts ?? null;
        noteToday = c.note ?? null;
      }
    }
    const pausedToday = pauses.some((p) => today >= p.from && (p.to == null || today <= p.to));
    if (pausedToday && loggedToday === undefined) continue;

    const units = computeUnits({ habit, checkIns, pauses, today });
    const base = { habitId: habit.id, loggedToday: loggedToday ?? null, valueToday, partsToday, noteToday, doneToday: counts(loggedToday) };

    const dayUnit = units.find((u) => u.kind === 'day' && u.start === today);
    if (dayUnit) {
      // herstelmoment (PLAN §2): de vorige geplande dag is gemist, dit is de eerstvolgende gelegenheid.
      // Gemist is een dag pas als hij voorbij is: kijk je vooruit en is vandaag nog niet afgevinkt, dan is er niets gemist (`now` = de echte vandaag).
      const previous = units.filter((u) => u.kind === 'day' && u.end < today).at(-1);
      scheduled.push({ ...base, kind: 'day', unit: dayUnit, overdue: false, recovery: loggedToday === undefined && previous?.status === 'missed' && previous.end < now });
    }

    const monthDayUnit = units.find(
      (u) =>
        u.type === 'day_of_month' &&
        u.start <= today &&
        today <= u.end &&
        (u.status === 'open' || loggedToday !== undefined),
    );
    if (monthDayUnit) {
      scheduled.push({ ...base, kind: 'day_of_month', unit: monthDayUnit, overdue: monthDayUnit.overdue === true });
    }

    const periodUnit = units.find((u) => u.type === 'times_per_period' && u.start <= today && today <= u.end);
    if (periodUnit && (loggedToday !== undefined || (periodUnit.status !== 'paused' && periodUnit.status !== 'skipped'))) {
      const plannedToday = dayPlans.some((p) => p.habitId === habit.id && p.date === today);
      // de andere dagen waarop hij al is ingepland: vanaf de echte vandaag (een plan van gisteren zonder check-in telt niet), in deze week of maand en niet op een dag die al is gelogd
      const logged = new Set(checkIns.map((c) => c.date));
      const plannedDates = [...new Set(dayPlans
        .filter((p) => p.habitId === habit.id && p.date !== today && p.date >= now && p.date >= periodUnit.start && p.date <= periodUnit.end && !logged.has(p.date))
        .map((p) => p.date))].sort();
      const entry = {
        ...base,
        kind: 'period',
        span: periodUnit.span,
        unit: periodUnit,
        count: periodUnit.count,
        target: periodUnit.target,
        remainingDays: periodUnit.remainingDays,
        atRisk: periodUnit.atRisk,
        satisfied: periodUnit.status === 'done',
        plannedToday,
        plannedDates,
        missingToPlan: Math.max(0, neededInWindow({ span: periodUnit.span, open: periodUnit.target - periodUnit.count, remainingDays: periodUnit.remainingDays }) - plannedDates.length),
      };
      if (plannedToday || loggedToday !== undefined) planned.push(entry);
      else pool.push(entry);
    }
  }

  return { scheduled, planned, pool };
}
