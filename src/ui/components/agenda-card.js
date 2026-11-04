import { h } from '../dom.js';
import { icon } from '../svg.js';
import { nl } from '../../content/nl.js';

const t = nl.today.agenda;

/** "14:30–15:30", "14:30" of "Hele dag". */
export function agendaWhen(item) {
  if (item.allDay || !item.start) return t.allDay;
  return item.end ? `${item.start}–${item.end}` : item.start;
}

/**
 * Een afspraak uit je agenda in het dagdeel op Vandaag (docs/AGENDA.md): een kaart in de stijl van de andere, zonder ⋯, want wijzigen of verwijderen doe je
 * in je agenda zelf. De tijd staat vooraan, en achter het woord Agenda de naam van de agenda waar hij uit komt (bijvoorbeeld die van een ander, als je een
 * agenda deelt). Afvinken kan, zoals bij een losse afspraak, maar het blijft op dit toestel en telt nergens mee.
 */
export function agendaCard(item, { canLog, onToggle }) {
  const state = item.done ? 'done' : 'open';
  const title = item.title || t.untitled;
  return h('li', { class: 'habit-card agenda-card', dataset: { kind: 'agenda', state } },
    h('div', { class: 'habit-card__body' },
      h('div', { class: 'habit-card__name agenda-card__title' }, title),
      h('div', { class: 'habit-card__meta agenda-card__meta' }, [agendaWhen(item), t.badge, item.calendar].filter(Boolean).join(' · ')),
      item.done ? h('div', { class: 'habit-card__state' }, t.states.done) : null),
    h('button', {
      type: 'button',
      class: 'check',
      dataset: { state, focusKey: `check:agenda:${item.id}` },
      'aria-pressed': item.done ? 'true' : 'false',
      'aria-label': item.done ? t.uncheck(title) : t.check(title),
      disabled: !canLog,
      onclick: () => onToggle(item),
    }, item.done ? icon('check', { strokeWidth: 3 }) : null));
}
