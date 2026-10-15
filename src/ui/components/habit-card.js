import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

const SYMBOL = { done: '✓', minimal: '◐', skipped: '–', partial: '', open: '' };

export function entryState(entry) {
  if (entry.loggedToday === 'done') return 'done';
  if (entry.loggedToday === 'minimal') return 'minimal';
  if (entry.loggedToday === 'skipped') return 'skipped';
  if (entry.loggedToday === 'partial') return 'partial';
  return 'open';
}

function counterText(entry) {
  const { counter } = entry.habit;
  const value = entry.valueToday ?? 0;
  return counter.target ? `${value}/${counter.target} ${counter.unit}` : `${value} ${counter.unit}`;
}

function metaLine(entry) {
  const parts = [];
  if (entry.habit.counter) {
    parts.push(counterText(entry));
  } else if (entry.kind === 'period') {
    parts.push(entry.span === 'week' ? nl.today.progressWeek(entry.count, entry.target) : nl.today.progressMonth(entry.count, entry.target));
  } else if (entry.kind === 'day_of_month') {
    parts.push(entry.overdue ? nl.today.overdue : nl.today.dueOn(entry.unit.due.slice(8)));
  }
  if (entry.habit.cue) parts.push(entry.habit.cue);
  return parts.join(' · ');
}

/** +/−-bediening voor een teller (bv. glazen water). De waarde hoort bij de getoonde dag. */
function counterControl(entry, { canLog, onAdjust }) {
  const { habit } = entry;
  const value = entry.valueToday ?? 0;
  return h('div', { class: 'counter', role: 'group', 'aria-label': habit.name },
    h('button', {
      type: 'button',
      class: 'counter__button',
      dataset: { focusKey: `minus:${habit.id}` },
      'aria-label': nl.today.counterMinus(habit.name),
      disabled: !canLog || value <= 0,
      onclick: () => onAdjust(entry, -1),
    }, '−'),
    h('output', { class: 'counter__value', 'aria-live': 'polite' }, String(value)),
    h('button', {
      type: 'button',
      class: 'counter__button counter__button--plus',
      dataset: { focusKey: `plus:${habit.id}` },
      'aria-label': nl.today.counterPlus(habit.name),
      disabled: !canLog,
      onclick: () => onAdjust(entry, 1),
    }, '+'));
}

/** Eén habit in de lijst van vandaag: icoon, naam, afvinkknop (of teller) en een menu voor meer acties. */
export function habitCard(entry, { canLog, onToggle, onMore, onAdjust }) {
  const { habit } = entry;
  const state = entryState(entry);
  const meta = metaLine(entry);
  return h('li', {
    class: 'habit-card',
    dataset: { state, color: habit.color, overdue: entry.overdue ? 'true' : null, counter: habit.counter ? 'true' : null },
  },
  h('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, habit.icon),
  h('div', { class: 'habit-card__body' },
    h('div', { class: 'habit-card__name' }, habit.name),
    meta ? h('div', { class: 'habit-card__meta' }, meta) : null,
    state !== 'open' && state !== 'partial' ? h('div', { class: 'habit-card__state' }, nl.today.states[state]) : null,
  ),
  habit.counter
    ? counterControl(entry, { canLog, onAdjust })
    : h('button', {
      type: 'button',
      class: 'check',
      dataset: { state, focusKey: `check:${habit.id}` },
      'aria-pressed': state === 'done' || state === 'minimal' ? 'true' : 'false',
      'aria-label': state === 'open' ? nl.today.check(habit.name) : nl.today.uncheck(habit.name),
      disabled: !canLog,
      onclick: () => onToggle(entry),
    }, SYMBOL[state]),
  h('button', {
    type: 'button',
    class: 'habit-card__more',
    dataset: { focusKey: `more:${habit.id}` },
    'aria-label': nl.today.more(habit.name),
    onclick: () => onMore(entry),
  }, '⋯'));
}
