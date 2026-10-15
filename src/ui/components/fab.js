import { h } from '../dom.js';
import { icon } from '../svg.js';

/**
 * De zwevende actieknop (FAB) voor "nieuwe habit", alleen op mobiel en tablet (op desktop staat er een gewone knop in de pagina).
 * `label` is de toegankelijke naam; met `extended` staat hij ook als tekst in de knop (voor een leeg scherm, waar de knop de hoofdzaak is).
 */
export function fab({ href, label, extended = false }) {
  return h('a', { class: extended ? 'fab fab--extended' : 'fab', href, ...(extended ? {} : { 'aria-label': label }) },
    icon('plus', { strokeWidth: 2.5 }),
    extended ? h('span', { class: 'fab__label' }, label) : null);
}
