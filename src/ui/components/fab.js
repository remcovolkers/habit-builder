import { h } from '../dom.js';
import { icon } from '../svg.js';

/**
 * De zwevende actieknop (FAB) voor "nieuwe habit": een plusje, alleen op mobiel en tablet
 * (op desktop staat er een gewone knop in de pagina). `label` is de toegankelijke naam.
 */
export function fab({ href, label }) {
  return h('a', { class: 'fab', href, 'aria-label': label }, icon('plus', { strokeWidth: 2.5 }));
}
