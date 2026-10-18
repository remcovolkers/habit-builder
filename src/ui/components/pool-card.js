import { habitIcon } from './habit-icon.js';
import { h } from '../dom.js';
import { nl } from '../../content/nl.js';
import { relativeDayLabel } from '../../app/format.js';
import { diffDays, weekday } from '../../domain/dates.js';

function dots(count, target) {
  return h('span', { class: 'dots', 'aria-hidden': 'true' },
    ...Array.from({ length: Math.min(target, 7) }, (_, i) => h('i', { class: i < count ? 'is-on' : '' })));
}

/** 'vandaag', 'morgen' of de naam van de dag ("vrijdag"). */
const dayName = (date, today) => {
  const offset = diffDays(date, today);
  return offset === 0 ? nl.days.today.toLowerCase() : offset === 1 ? nl.days.tomorrow.toLowerCase() : nl.weekdays.long[weekday(date)];
};

/** 'vrijdag', 'vrijdag en zondag', 'vrijdag, zaterdag en zondag'; bij meer dan drie 'n dagen'. */
export function plannedList(dates, today) {
  const names = dates.map((date) => dayName(date, today));
  if (names.length > 3) return nl.today.pool.plannedDays(names.length);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} en ${names.at(-1)}`;
}

/** Waar de taak al op staat: "Ingepland op vrijdag en zondag" als alles een dag heeft, anders "Eerste keer ingepland op vrijdag". Leeg als er niets is ingepland. */
export function plannedText(entry, today) {
  if (!entry.plannedDates?.length) return null;
  return entry.covered ? nl.today.pool.plannedOn(plannedList(entry.plannedDates, today)) : nl.today.pool.firstPlanned(dayName(entry.plannedDates[0], today));
}

export function periodLabel(entry) {
  const base = entry.span === 'week' ? nl.today.progressWeek(entry.count, entry.target) : nl.today.progressMonth(entry.count, entry.target);
  if (entry.satisfied) return base;
  return entry.remainingDays > 0 ? `${base} · ${nl.today.pool.daysLeft(entry.remainingDays)}` : `${base} · ${nl.today.pool.lastChance}`;
}

/**
 * Een flexibele habit in de stapel "Oningepland", compact: één regel met de voortgang en één knop. De rest (een andere dag, al gedaan) zit achter "⋯".
 * Wat dreigt te falen (entry.urgent, zie domain/tight.js) valt op: een andere rand en de hoofdknop.
 */
export function poolCard(entry, { date, today, canPlan, canMore, onPlan, onMore, onChange }) {
  const { habit } = entry;
  const state = entry.satisfied ? 'satisfied' : entry.covered ? 'planned' : entry.urgent ? 'risk' : 'open';
  const planned = plannedText(entry, today);
  const takeLabel = date === today ? nl.today.pool.takeToday : nl.today.pool.takeDay(relativeDayLabel(date, today));

  return h('li', { class: 'pool-card pool-card--compact', dataset: { state, color: habit.color } },
    h('span', { class: 'pool-card__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
    h('div', { class: 'pool-card__body' },
      h('div', { class: 'pool-card__name' }, habit.name),
      h('div', { class: 'pool-card__meta' },
        dots(entry.count, entry.target),
        h('span', { class: 'muted' }, periodLabel(entry)),
        entry.satisfied ? h('span', { class: 'badge badge--ok' }, `✓ ${nl.today.pool.satisfied}`) : null,
        entry.atRisk ? h('span', { class: 'badge badge--risk' }, nl.today.pool.atRisk) : null),
      planned ? h('div', { class: 'pool-card__planned' }, planned) : null),
    entry.satisfied ? null : h('div', { class: 'pool-card__actions' },
      // alles al ingepland: geen "＋ Vandaag" (de taak staat al op een andere dag), wel "Wijzig" om dat aan te passen
      canPlan && entry.covered && onChange
        ? h('button', {
          type: 'button',
          class: 'button button--ghost button--small',
          dataset: { focusKey: `change:${habit.id}` },
          'aria-label': nl.today.pool.changeLabel(habit.name),
          onclick: () => onChange(entry),
        }, nl.today.pool.change)
        : null,
      canPlan && !entry.covered
        ? h('button', {
          type: 'button',
          class: `button button--small ${entry.urgent ? 'button--primary' : 'button--secondary'}`,
          dataset: { focusKey: `take:${habit.id}` },
          'aria-label': `${takeLabel}: ${habit.name}`,
          onclick: () => onPlan(entry),
        }, `＋ ${date === today ? nl.today.pool.takeShort : relativeDayLabel(date, today)}`)
        : null,
      canMore
        ? h('button', {
          type: 'button',
          class: 'habit-card__more',
          dataset: { focusKey: `poolmore:${habit.id}` },
          'aria-label': nl.today.more(habit.name),
          onclick: () => onMore(entry),
        }, '⋯')
        : null));
}
