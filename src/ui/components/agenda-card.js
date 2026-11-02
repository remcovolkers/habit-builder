import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

const t = nl.today.agenda;

/** "14:30–15:30", "14:30" of "Hele dag". */
export function agendaWhen(item) {
  if (item.allDay || !item.start) return t.allDay;
  return item.end ? `${item.start}–${item.end}` : item.start;
}

/**
 * Een afspraak uit je agenda in het dagdeel op Vandaag (docs/AGENDA.md): een kaart in de stijl van de andere, maar zonder vinkje en zonder ⋯, want hij is alleen om
 * te lezen. Wijzigen of verwijderen doe je in je agenda zelf. De tijd staat vooraan: dat is wat je zoekt.
 */
export function agendaCard(item) {
  return h('li', { class: 'habit-card agenda-card', dataset: { kind: 'agenda' } },
    h('div', { class: 'habit-card__body' },
      h('div', { class: 'habit-card__name agenda-card__title' }, item.title || t.untitled),
      h('div', { class: 'habit-card__meta' }, `${agendaWhen(item)} · ${t.badge}`)));
}
