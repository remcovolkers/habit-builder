import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

const SYMBOL = { done: '✓', minimal: '◐', skipped: '–', open: '' };

export function entryState(entry) {
  if (entry.loggedToday === 'done') return 'done';
  if (entry.loggedToday === 'minimal') return 'minimal';
  if (entry.loggedToday === 'skipped') return 'skipped';
  return 'open';
}

function metaLine(entry) {
  const parts = [];
  if (entry.kind === 'period') {
    parts.push(entry.span === 'week' ? nl.today.progressWeek(entry.count, entry.target) : nl.today.progressMonth(entry.count, entry.target));
  } else if (entry.kind === 'day_of_month') {
    parts.push(entry.overdue ? nl.today.overdue : nl.today.dueOn(entry.unit.due.slice(8)));
  }
  if (entry.habit.cue) parts.push(entry.habit.cue);
  return parts.join(' · ');
}

/** Eén habit in de lijst van vandaag: icoon, naam, afvinkknop en een menu voor meer acties. */
export function habitCard(entry, { canLog, onToggle, onMore }) {
  const { habit } = entry;
  const state = entryState(entry);
  const meta = metaLine(entry);
  return h('li', {
    class: 'habit-card',
    dataset: { state, color: habit.color, overdue: entry.overdue ? 'true' : null },
  },
  h('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, habit.icon),
  h('div', { class: 'habit-card__body' },
    h('div', { class: 'habit-card__name' }, habit.name),
    meta ? h('div', { class: 'habit-card__meta' }, meta) : null,
    state !== 'open' ? h('div', { class: 'habit-card__state' }, nl.today.states[state]) : null,
  ),
  h('button', {
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
