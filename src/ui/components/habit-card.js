import { habitIcon } from './habit-icon.js';
import { h } from '../dom.js';
import { icon } from '../svg.js';
import { nl } from '../../content/nl.js';

export function entryState(entry) {
  // een habit met meerdere dagdelen: de kaart van een dagdeel is gedaan als dat dagdeel gedaan is, ook als de dag nog deels open staat
  if (entry.part && entry.loggedToday === 'partial') return entry.partDone ? 'done' : 'open';
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
  if (entry.partsTotal > 1) parts.push(nl.today.partsProgress(entry.partsDone, entry.partsTotal));
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
export function habitCard(entry, { canLog, onToggle, onMore, onAdjust, onRate, onLate }) {
  const { habit } = entry;
  // dezelfde habit staat bij meerdere dagdelen op de pagina: de sleutel voor de focus (live.js) moet per kaart verschillen
  const key = (name) => `${name}:${habit.id}${entry.part ? `:${entry.part}` : ''}`;
  const partLabel = entry.part ? ` (${nl.dayparts[entry.part].toLowerCase()})` : '';
  const state = entryState(entry);
  const meta = metaLine(entry);
  const isCounter = Boolean(habit.counter);
  return h('li', {
    class: 'habit-card',
    dataset: { state, color: habit.color, overdue: entry.overdue ? 'true' : null, counter: isCounter ? 'true' : null },
  },
  h('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
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
      dataset: { state, focusKey: key('check') },
      'aria-pressed': state === 'done' || state === 'minimal' ? 'true' : 'false',
      'aria-label': (state === 'open' ? nl.today.check(habit.name) : nl.today.uncheck(habit.name)) + partLabel,
      disabled: !canLog,
      onclick: () => onToggle(entry),
    }, checkFace(state)),
  h('button', {
    type: 'button',
    class: 'habit-card__more',
    dataset: { focusKey: key('more') },
    'aria-label': nl.today.more(habit.name) + partLabel,
    onclick: () => onMore(entry),
  }, '⋯'),
  isCounter ? counterControl(entry, { canLog, onAdjust }) : null,
  extras(entry, state, { canLog, onRate, onLate }));
}

/** Onder de kaart over de volle breedte: het herstelmoment (alleen als de habit nog open staat), "te laat", het automatisme-cijfer en de notitie van vandaag. */
function extras(entry, state, { canLog, onRate, onLate }) {
  const { habit } = entry;
  const blocks = [];
  if (entry.recovery === true && state === 'open') {
    blocks.push(h('div', { class: 'habit-card__recovery' },
      h('span', { class: 'badge badge--recovery' }, nl.today.recovery.badge),
      h('p', null, nl.today.recovery.text),
      habit.minimalVersion && !habit.counter ? h('p', null, nl.today.recovery.minimal(habit.minimalVersion)) : null,
      habit.why ? h('p', { class: 'habit-card__why' }, nl.today.recovery.why(habit.why)) : null));
  }
  if (entry.overdue === true && state === 'open' && canLog) {
    blocks.push(h('div', { class: 'habit-card__late' },
      h('p', null, nl.today.late.text(Number(entry.unit.due.slice(8)))),
      h('button', {
        type: 'button',
        class: 'button button--secondary button--small',
        dataset: { focusKey: `late:${habit.id}` },
        onclick: () => onLate(entry),
      }, nl.today.late.button)));
  }
  if (entry.automaticity && canLog) blocks.push(automaticityAsk(entry, onRate));
  if (entry.noteToday) blocks.push(h('p', { class: 'habit-card__note' }, `“${entry.noteToday}”`));
  return blocks.length > 0 ? h('div', { class: 'habit-card__extra' }, ...blocks) : null;
}

/** Het cijfer voor "hoe automatisch voelde dit?": een vraag zolang er nog geen cijfer is, daarna het cijfer (en aanpasbaar). */
function automaticityAsk(entry, onRate) {
  const a = nl.today.automaticity;
  const { score } = entry.automaticity;
  const label = nl.detail.automaticity.scoreLabel;
  return h('div', { class: 'habit-card__ask', role: 'group', 'aria-label': a.question },
    h('p', { class: 'habit-card__ask-title' }, score === null ? a.question : a.saved(score)),
    score === null ? h('p', { class: 'xs muted' }, a.hint) : null,
    h('div', { class: 'rating' },
      ...[1, 2, 3, 4, 5].map((value) => h('button', {
        type: 'button',
        'aria-pressed': score === value ? 'true' : 'false',
        'aria-label': label(value),
        dataset: { focusKey: `rate:${entry.habitId}:${value}` },
        onclick: () => onRate(entry, value),
      }, String(value)))));
}
