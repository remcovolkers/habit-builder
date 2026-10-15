import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

/** Tijdelijke view voor schermen die in een latere mijlpaal gebouwd worden. */
export function placeholderView({ title, description }, extra = []) {
  return h('section', { class: 'placeholder' },
    h('h1', { class: 'placeholder__title' }, title),
    h('p', { class: 'placeholder__text' }, description),
    h('p', { class: 'placeholder__badge' }, nl.app.soon),
    ...extra,
  );
}
