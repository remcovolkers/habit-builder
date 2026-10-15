import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

/** Voortgangsring "3/5 gedaan". --p wordt via CSSOM gezet (een style-attribuut zou door de CSP geblokkeerd worden). */
export function ring(done, total) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const el = h('div', { class: 'ring', role: 'img', 'aria-label': nl.today.progress(done, total) },
    h('div', { class: 'ring__head' }),
    h('div', { class: 'ring__label' },
      h('b', { class: 'ring__value' }, String(done), h('span', { class: 'muted' }, `/${total}`)),
      h('span', { class: 'ring__caption' }, nl.today.ringCaption)));
  el.style.setProperty('--p', String(percent));
  return el;
}
