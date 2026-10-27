// De widget voor het startscherm van Android (docs/ANDROID-WIDGET.md): wat de app aan de widget geeft (de momentopname van vandaag), en hoe de acties
// uit de widget (vinkjes en tellertikken) in de app terechtkomen. Geen DOM en geen Android: de plugin zit in src/ui/widget.js.
import { isValidDate, todayFor } from '../domain/dates.js';
import { counterDoneValue } from '../domain/counter.js';
import { donePartsOf } from '../domain/dayparts.js';
import { nl } from '../content/nl.js';
import { adjustCounter, clearCheckIn, logCheckIn, RuleError, setAppointmentDone, togglePart } from './actions.js';
import { buildDayView, isSetAside } from './day-view.js';

// --- sleutels: wat een rij in de widget is, als tekst die in beide richtingen reist -------------------------------------------------------
// h|<habitId>|<dagdeel of leeg>   een gewone habit, of één dagdeel van een habit met meerdere dagdelen
// c|<habitId>                     een teller
// a|<afspraakId>                  een losse afspraak
export const habitKey = (habitId, part = null) => `h|${habitId}|${part ?? ''}`;
export const counterKey = (habitId) => `c|${habitId}`;
export const appointmentKey = (id) => `a|${id}`;

/** { kind: 'habit', habitId, part } | { kind: 'counter', habitId } | { kind: 'appointment', id } | null */
export function parseWidgetKey(key) {
  if (typeof key !== 'string') return null;
  const [kind, id, part] = key.split('|');
  if (!id) return null;
  if (kind === 'h') return { kind: 'habit', habitId: id, part: part || null };
  if (kind === 'c') return { kind: 'counter', habitId: id };
  if (kind === 'a') return { kind: 'appointment', id };
  return null;
}

// --- einde van de dag ---------------------------------------------------------------------------------------------------------------------

const MINUTE = 60_000;
const SEARCH_SPAN = 26 * 60 * MINUTE; // een dag is nooit langer dan 25 uur (zomer- en wintertijd)

/**
 * Het moment (ms) waarop "vandaag" voor de gebruiker eindigt: de eerstvolgende keer dat hij op zijn begin van de dag komt (zie todayFor).
 * Daarna is de lijst in de widget verouderd.
 */
export function endOfToday({ now, timeZone, dayStartHour }) {
  const start = now.getTime();
  const today = todayFor(now, timeZone, dayStartHour);
  let low = start;
  let high = start + SEARCH_SPAN;
  while (high - low > MINUTE) {
    const mid = Math.floor((low + high) / 2);
    if (todayFor(new Date(mid), timeZone, dayStartHour) === today) low = mid;
    else high = mid;
  }
  // het begin van een dag valt op een hele minuut; `high` ligt er hoogstens een minuut voorbij (low ligt er nog voor)
  return Math.floor(high / MINUTE) * MINUTE;
}

// --- de momentopname ----------------------------------------------------------------------------------------------------------------------

/**
 * De lijst van vandaag voor de widget (JSON-vriendelijk). `group` is de naam van het dagdeel; opeenvolgende rijen met dezelfde naam horen bij één streepje.
 * Wat is overgeslagen of opgegeven telt niet meer mee, net als in de teller op Vandaag.
 */
export function buildWidgetSnapshot({ snapshot, today, settings, now = new Date() }) {
  const view = buildDayView({ snapshot, date: today, today });
  const items = [];
  for (const group of view.groups) {
    const label = nl.dayparts[group.daypart] ?? '';
    for (const entry of group.entries) {
      if (isSetAside(entry)) continue;
      const { habit } = entry;
      if (habit.counter) {
        // dezelfde waarde als adjustCounter: een oude check-in zonder waarde telt als het doel
        const value = entry.valueToday ?? (entry.loggedToday ? counterDoneValue(habit.counter) : 0);
        items.push({ key: counterKey(habit.id), kind: 'counter', group: label, title: habit.name, value, target: habit.counter.target ?? null, unit: habit.counter.unit ?? '', done: Boolean(entry.doneToday) });
      } else {
        items.push({ key: habitKey(habit.id, entry.part ?? null), kind: 'habit', group: label, title: habit.name, done: Boolean(entry.doneToday) });
      }
    }
    for (const appointment of group.appointments) {
      items.push({ key: appointmentKey(appointment.id), kind: 'appointment', group: label, title: appointment.title, done: Boolean(appointment.done) });
    }
  }
  return {
    date: today,
    expiresAt: endOfToday({ now, timeZone: settings.timezone, dayStartHour: settings.dayStartHour }),
    done: view.progress.done,
    total: view.progress.total,
    labels: { ...nl.widget },
    items,
  };
}

// --- acties uit de widget -----------------------------------------------------------------------------------------------------------------

const isDone = (checkIn) => checkIn?.status === 'done' || checkIn?.status === 'minimal';

/** Voert één actie uit. Geeft true als er iets veranderde, false als er niets te doen viel (al zo, of de gegevens bestaan niet meer). */
async function applyOne(repo, action, today) {
  const key = parseWidgetKey(action?.key);
  if (!key || !isValidDate(action.date)) return false;

  if (key.kind === 'appointment') {
    if (typeof action.done !== 'boolean') return false;
    await setAppointmentDone(repo, { id: key.id, date: action.date, done: action.done }, today);
    return true;
  }

  const habit = await repo.getHabit(key.habitId);
  if (!habit) return false;

  if (key.kind === 'counter') {
    const delta = Number(action.delta);
    if (!habit.counter || !Number.isInteger(delta) || delta === 0) return false;
    await adjustCounter(repo, { habit, date: action.date, delta }, today);
    return true;
  }

  if (typeof action.done !== 'boolean') return false;
  const checkIn = await repo.getCheckIn(habit.id, action.date);
  if (key.part) {
    if (donePartsOf(habit, checkIn).includes(key.part) === action.done) return false;
    await togglePart(repo, { habit, date: action.date, part: key.part }, today);
    return true;
  }
  if (action.done) {
    if (isDone(checkIn)) return false;
    await logCheckIn(repo, { habitId: habit.id, date: action.date, status: 'done' }, today);
  } else {
    if (!checkIn) return false;
    await clearCheckIn(repo, { habitId: habit.id, date: action.date }, today);
  }
  return true;
}

/**
 * Verwerkt de wachtrij uit de widget, in volgorde. Een actie die de regels niet toelaten (een dag die te ver terug ligt) of waarvan de habit of
 * afspraak is verdwenen, wordt overgeslagen; de rest gaat gewoon door.
 * Geeft { applied, skipped }.
 */
export async function applyWidgetActions({ repo, actions, today }) {
  const result = { applied: 0, skipped: 0 };
  for (const action of Array.isArray(actions) ? actions : []) {
    try {
      if (await applyOne(repo, action, today)) result.applied += 1;
      else result.skipped += 1;
    } catch (error) {
      if (!(error instanceof RuleError)) result.failed = (result.failed ?? 0) + 1; // iets onverwachts: de rest gaat door, de aanroeper kan het melden
      result.skipped += 1;
    }
  }
  return result;
}
