// Aandacht voor de schermen: per taak het belangrijkste signaal, met de reden als je al hebt gereageerd. Puur.
// De regels zelf (wat is "stil", "mislukt", "te laat") staan in domain/attention.js.
import { diffDays } from '../domain/dates.js';
import { ATTENTION_KINDS, attentionFor } from '../domain/attention.js';
import { buildPeriodOverview } from './overview.js';
import { prepareSnapshot } from './day-view.js';

const habitOrder = (a, b) => (a.habit.sortOrder ?? 0) - (b.habit.sortOrder ?? 0) || a.habit.name.localeCompare(b.habit.name, 'nl');

/** De laatste reactie die dit signaal dekt (gegeven op of na de dag waarop het begon), of null. */
function coveringReason(signal, reasons) {
  let found = null;
  for (const reason of reasons) {
    if (reason.habitId === signal.habitId && reason.date >= signal.since && (found === null || reason.date > found.date)) found = reason;
  }
  return found;
}

/**
 * Per taak met een signaal één regel: { habit, signal, reason, handled }.
 * `signal` is het belangrijkste signaal dat nog geen reactie heeft; is er niets open, dan het belangrijkste dat wel een reactie heeft
 * (zodat de weekreview ook toont wat je al hebt beantwoord).
 */
export function buildAttention({ snapshot, today, prepared = null }) {
  const reasons = snapshot.reasons ?? [];
  const { bundles } = prepared ?? prepareSnapshot(snapshot);
  const items = [];
  for (const { habit, checkIns, pauses } of bundles) {
    const signals = attentionFor({ habit, checkIns, pauses, today });
    if (signals.length === 0) continue;
    const open = signals.find((signal) => coveringReason(signal, reasons) === null);
    const signal = open ?? signals[0];
    const reason = open ? null : coveringReason(signal, reasons);
    items.push({ habit, signal, reason, handled: reason !== null });
  }
  return items.sort((a, b) => ATTENTION_KINDS.indexOf(a.signal.kind) - ATTENTION_KINDS.indexOf(b.signal.kind) || habitOrder(a, b));
}

/** Op Vandaag alleen wat nog open staat en niet al op de kaart zelf staat: stil of mislukt (niet per dag). "Te laat" heeft zijn eigen blokje. */
export const forToday = (items) => items.filter((item) => !item.handled
  && (item.signal.kind === 'silent' || (item.signal.kind === 'failed' && item.signal.detail.span !== 'day')));

/** Hoe vaak een taak waar niet op is gereageerd opnieuw in de ochtendmelding komt: op de dag dat het signaal begon en dan elke week. */
export const NUDGE_EVERY_DAYS = 7;

/**
 * Voor de ochtendmelding (zonder namen, zie reminder.js): hoeveel taken zonder reactie hebben op `date` hun meldmoment?
 * Dat is de dag waarop het probleem begon (`episode`) en daarna elke NUDGE_EVERY_DAYS dagen, tot je reageert of de taak is gedaan.
 */
export function nudgesOn({ snapshot, date, prepared = null }) {
  return buildAttention({ snapshot, today: date, prepared }).filter((item) => {
    if (item.handled || !['late', 'silent', 'failed'].includes(item.signal.kind)) return false;
    const age = diffDays(date, item.signal.episode);
    return age >= 0 && age % NUDGE_EVERY_DAYS === 0;
  }).length;
}

/**
 * De terugblik op de week voor de review: de uitkomst van de week in één regel en de taken die aandacht vragen.
 * week: { done, total, percent } van het weekoverzicht; items: buildAttention.
 */
export function buildWeekReview({ snapshot, today }) {
  const prepared = prepareSnapshot(snapshot);
  const overview = buildPeriodOverview({ snapshot, today, period: 'week', anchor: today });
  const items = buildAttention({ snapshot, today, prepared });
  return {
    week: overview.totals,
    start: overview.start,
    items,
    open: items.filter((item) => !item.handled).length,
    handled: items.filter((item) => item.handled).length,
  };
}


