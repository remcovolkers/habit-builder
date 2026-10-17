// De uitleg over de ritmes (elke dag, vaste dagen, X keer per week of maand, dag van de maand, en de teller) met een voorbeeld bij elk.
// Staat in Zo werkt het (#/uitleg) en opent vanuit het habit-formulier als een blad: zo blijft wat je aan het invullen bent gewoon staan.
import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { nl } from '../../content/nl.js';
import { GUIDE_COUNTER, GUIDE_TYPES } from '../../content/guide.js';

const g = nl.guide;

/** De lijst met de vijf ritmes en de teller. */
export function rhythmList() {
  const item = (title, { text, example }) => h('li', { class: 'guide__type' },
    h('span', { class: 'guide__type-title' }, title),
    h('span', { class: 'guide__type-text' }, text),
    h('span', { class: 'guide__type-example' }, g.example(example)));
  return h('ul', { class: 'guide__types' },
    ...GUIDE_TYPES.map((type) => item(nl.form.scheduleTypes[type.key], type)),
    item(g.counter, GUIDE_COUNTER));
}

/**
 * De uitleg als blad boven de huidige pagina. Sluiten brengt je precies terug waar je was: de focus gaat naar `opener` (de knop die het blad opende;
 * niet elke browser geeft een knop bij een tik focus, dus we vertrouwen daar niet op).
 */
export function openRhythmGuide(opener = null) {
  openDialog({
    title: nl.form.scheduleMore,
    description: nl.guide.rhythmsIntro,
    className: 'dialog--guide',
    content: rhythmList(),
    actions: [{ label: nl.app.close, variant: 'primary' }],
    cancelLabel: null,
    onClose: () => opener?.focus(),
  });
}
