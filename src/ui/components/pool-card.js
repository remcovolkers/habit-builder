import { habitIcon } from './habit-icon.js';
import { h } from '../dom.js';
import { nl } from '../../content/nl.js';
import { relativeDayLabel } from '../../app/format.js';

function dots(count, target) {
  return h('span', { class: 'dots', 'aria-hidden': 'true' },
    ...Array.from({ length: Math.min(target, 7) }, (_, i) => h('i', { class: i < count ? 'is-on' : '' })));
}

function periodLabel(entry) {
  const base = entry.span === 'week' ? nl.today.progressWeek(entry.count, entry.target) : nl.today.progressMonth(entry.count, entry.target);
  if (entry.satisfied) return base;
  return entry.remainingDays > 0 ? `${base} · ${nl.today.pool.daysLeft(entry.remainingDays)}` : `${base} · ${nl.today.pool.lastChance}`;
}

/** Een flexibele habit in de stapel "Oningepland". */
export function poolCard(entry, { date, today, canLog, canPlan, onPlan, onPlanOther, onDoneNow }) {
  const { habit } = entry;
  const state = entry.satisfied ? 'satisfied' : entry.atRisk ? 'risk' : 'open';
  const takeLabel = date === today ? nl.today.pool.takeToday : nl.today.pool.takeDay(relativeDayLabel(date, today));
  const secondary = [
    canPlan && date === today ? h('button', { type: 'button', class: 'button button--ghost button--small', onclick: () => onPlanOther(entry) }, nl.today.pool.otherDay) : null,
    canLog ? h('button', { type: 'button', class: 'button button--ghost button--small', onclick: () => onDoneNow(entry) }, nl.today.pool.alreadyDone) : null,
  ].filter(Boolean);

  return h('li', { class: 'pool-card', dataset: { state, color: habit.color } },
    h('span', { class: 'pool-card__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
    h('div', { class: 'pool-card__body' },
      h('div', { class: 'pool-card__name' }, habit.name),
      h('div', { class: 'pool-card__meta' },
        dots(entry.count, entry.target),
        h('span', { class: 'muted' }, periodLabel(entry)),
        entry.satisfied ? h('span', { class: 'badge badge--ok' }, `✓ ${nl.today.pool.satisfied}`) : null,
        entry.atRisk ? h('span', { class: 'badge badge--risk' }, nl.today.pool.atRisk) : null)),
    entry.satisfied ? null : h('div', { class: 'pool-card__actions' },
      canPlan
        ? h('button', {
          type: 'button',
          class: `button button--small button--block ${entry.atRisk ? 'button--primary' : 'button--secondary'}`,
          dataset: { focusKey: `take:${habit.id}` },
          onclick: () => onPlan(entry),
        }, `＋ ${takeLabel}`)
        : null,
      secondary.length > 0 ? h('div', { class: 'pool-card__more' }, ...secondary) : null));
}
