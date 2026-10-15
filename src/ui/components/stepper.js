import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

/**
 * Aantal kiezen met − en +. De waarde staat in een <output> (ook bruikbaar voor tests en schermlezers).
 * onChange(value) krijgt het nieuwe getal.
 */
export function stepper({ id, value, min = 1, max = 31, label, onChange }) {
  let current = Math.min(max, Math.max(min, Number(value) || min));
  const output = h('output', { id, 'aria-live': 'polite', 'aria-label': label }, String(current));
  const set = (next) => {
    current = Math.min(max, Math.max(min, next));
    output.textContent = String(current);
    onChange(current);
  };
  onChange(current);
  return h('div', { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', 'aria-label': nl.form.lessLabel, onclick: () => set(current - 1) }, '−'),
    output,
    h('button', { type: 'button', 'aria-label': nl.form.moreLabel, onclick: () => set(current + 1) }, '+'));
}
