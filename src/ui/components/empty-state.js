import { h } from '../dom.js';
import { icon } from '../svg.js';
import { mascot } from './mascot.js';
import { TEMPLATES } from '../../content/templates.js';
import { habitIcon } from './habit-icon.js';
import { nl } from '../../content/nl.js';

const STARTERS = ['water', 'reading', 'running'];

/**
 * Een lege toestand: een illustratie, een titel, een korte uitleg en wat je nu kunt doen.
 *   art:       welk pictogram als het thema geen eigen illustratie heeft voor `slot`
 *   cta:       { href, label, desktopOnly } de hoofdactie; desktopOnly als op mobiel de FAB die rol heeft
 *   secondary: { href, label } een rustiger tweede stap
 *   starters:  toon enkele sjablonen om mee te beginnen
 *   compact:   een kleine regel boven bestaande inhoud (bv. de medailles), in plaats van een heel scherm
 */
export function emptyState({ art, slot = 'empty', title, text, cta = null, secondary = null, starters = false, compact = false }) {
  return h('div', { class: compact ? 'empty empty--compact' : 'empty' },
    mascot(slot, 'empty__mascot') ?? h('div', { class: 'empty__art', 'aria-hidden': 'true' }, icon(art, { strokeWidth: 1.6 })),
    h('h2', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    starters
      ? h('div', { class: 'empty__starters' },
        h('p', { class: 'empty__starters-title' }, nl.empty.startWith),
        h('div', { class: 'empty__chips' }, ...STARTERS.map((key) =>
          h('a', { class: 'chip-link', href: `#/habits/new?template=${key}` }, habitIcon(TEMPLATES[key].icon, 'theme-icon--inline'), ` ${TEMPLATES[key].name}`))))
      : null,
    cta ? h('a', { class: cta.desktopOnly ? 'button button--primary desktop-only' : 'button button--primary', href: cta.href }, cta.label) : null,
    secondary ? h('a', { class: 'button button--ghost', href: secondary.href }, secondary.label) : null);
}
