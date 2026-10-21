import { h } from '../dom.js';
import { icon } from '../svg.js';
import { nl } from '../../content/nl.js';
import { relativeDayLabel } from '../../app/format.js';

const t = nl.today.appointments;

/**
 * Een losse afspraak in het dagdeel op Vandaag: een kaart in de stijl van een habit, maar zonder icoon, sterkte of reeks, en met het woord "Afspraak"
 * erop zodat je het verschil ziet. Een afspraak van een eerdere dag die nog openstaat zegt "Van gisteren", rustig en zonder waarschuwing.
 * Tikken op ⋯ opent het blad om hem te wijzigen of te verwijderen.
 */
export function appointmentCard(item, { canLog, today, onToggle, onEdit }) {
  const state = item.done ? 'done' : 'open';
  const meta = [t.badge, item.carried ? t.from(relativeDayLabel(item.date, today).toLowerCase()) : null].filter(Boolean).join(' · ');
  return h('li', { class: 'habit-card appointment-card', dataset: { state, kind: 'appointment' } },
    h('div', { class: 'habit-card__body' },
      h('div', { class: 'habit-card__name appointment-card__title' }, item.title),
      h('div', { class: 'habit-card__meta' }, meta),
      item.done ? h('div', { class: 'habit-card__state' }, t.states.done) : null),
    h('button', {
      type: 'button',
      class: 'check',
      dataset: { state, focusKey: `check:appointment:${item.id}` },
      'aria-pressed': item.done ? 'true' : 'false',
      'aria-label': item.done ? t.uncheck(item.title) : t.check(item.title),
      disabled: !canLog,
      onclick: () => onToggle(item),
    }, item.done ? icon('check', { strokeWidth: 3 }) : null),
    h('button', {
      type: 'button',
      class: 'habit-card__more',
      dataset: { focusKey: `more:appointment:${item.id}` },
      'aria-label': t.edit(item.title),
      onclick: () => onEdit(item),
    }, '⋯'));
}
