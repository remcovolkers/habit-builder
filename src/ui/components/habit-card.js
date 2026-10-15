import { h } from '../dom.js';
import { icon } from '../svg.js';
import { nl } from '../../content/nl.js';

export function entryState(entry) {
  if (entry.loggedToday === 'done') return 'done';
  if (entry.loggedToday === 'minimal') return 'minimal';
  if (entry.loggedToday === 'skipped') return 'skipped';
  if (entry.loggedToday === 'partial') return 'partial';
  return 'open';
}

/** Wat er binnen de afvinkknop staat: een vinkje, ½ voor de minimale versie of een streepje. */
function checkFace(state) {
  if (state === 'done') return icon('check', { strokeWidth: 3 });
  if (state === 'minimal') return h('span', { class: 'check__label' }, '½');
  if (state === 'skipped') return h('span', { class: 'check__label' }, '–');
  return null;
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

/** +/−-bediening voor een teller (bv. glazen water) met een meter naar het dagdoel. */
function counterControl(entry, { canLog, onAdjust }) {
  const { habit } = entry;
  const { counter } = habit;
  const value = entry.valueToday ?? 0;
  const meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('div', { class: 'meter__fill' }));
  meter.firstChild.style.setProperty('--p', String(counter.target ? Math.min(100, Math.round((value / counter.target) * 100)) : (value > 0 ? 100 : 0)));
  return h('div', { class: 'counter', role: 'group', 'aria-label': habit.name },
    h('button', {
      type: 'button',
      class: 'counter__button',
      dataset: { focusKey: `minus:${habit.id}` },
      'aria-label': nl.today.counterMinus(habit.name),
      disabled: !canLog || value <= 0,
      onclick: () => onAdjust(entry, -1),
    }, '−'),
    h('div', { class: 'counter__middle' },
      h('div', { class: 'counter__reading' },
        h('output', { class: 'counter__value', 'aria-live': 'polite' }, String(value)),
        h('span', { class: 'counter__goal' }, counter.target ? `/ ${counter.target} ${counter.unit}` : counter.unit)),
      meter),
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
  const isCounter = Boolean(habit.counter);
  return h('li', {
    class: 'habit-card',
    dataset: { state, color: habit.color, overdue: entry.overdue ? 'true' : null, counter: isCounter ? 'true' : null },
  },
  h('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, habit.icon),
  h('div', { class: 'habit-card__body' },
    h('div', { class: 'habit-card__name' }, habit.name),
    meta ? h('div', { class: 'habit-card__meta' }, meta) : null,
    !isCounter && state !== 'open' ? h('div', { class: 'habit-card__state' }, nl.today.states[state]) : null,
  ),
  isCounter
    ? null
    : h('button', {
      type: 'button',
      class: 'check',
      dataset: { state, focusKey: `check:${habit.id}` },
      'aria-pressed': state === 'done' || state === 'minimal' ? 'true' : 'false',
      'aria-label': state === 'open' ? nl.today.check(habit.name) : nl.today.uncheck(habit.name),
      disabled: !canLog,
      onclick: () => onToggle(entry),
    }, checkFace(state)),
  h('button', {
    type: 'button',
    class: 'habit-card__more',
    dataset: { focusKey: `more:${habit.id}` },
    'aria-label': nl.today.more(habit.name),
    onclick: () => onMore(entry),
  }, '⋯'),
  isCounter ? counterControl(entry, { canLog, onAdjust }) : null,
  extras(entry, state));
}

/** Onder de kaart over de volle breedte: het herstelmoment (alleen als de habit nog open staat) en de notitie van vandaag. */
function extras(entry, state) {
  const { habit } = entry;
  const blocks = [];
  if (entry.recovery === true && state === 'open') {
    blocks.push(h('div', { class: 'habit-card__recovery' },
      h('span', { class: 'badge badge--recovery' }, nl.today.recovery.badge),
      h('p', null, nl.today.recovery.text),
      habit.minimalVersion && !habit.counter ? h('p', null, nl.today.recovery.minimal(habit.minimalVersion)) : null,
      habit.why ? h('p', { class: 'habit-card__why' }, nl.today.recovery.why(habit.why)) : null));
  }
  if (entry.noteToday) blocks.push(h('p', { class: 'habit-card__note' }, `“${entry.noteToday}”`));
  return blocks.length > 0 ? h('div', { class: 'habit-card__extra' }, ...blocks) : null;
}
