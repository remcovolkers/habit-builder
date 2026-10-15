import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

let counters = 0;

/**
 * Zet een tekenlimiet op een invoerveld en toont hoeveel er nog kan ("12 / 200"). Het veld stopt zelf bij de limiet.
 * Geeft het element met de teller terug: zet het onder het veld. De teller wordt aan het veld gekoppeld voor schermlezers.
 * Past de waarde zich van buitenaf aan (veld leegmaken), roep dan `.update()` op de teller aan.
 */
export function charCounter(control, max) {
  const id = `count-${(counters += 1)}`;
  control.maxLength = max;
  control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));

  const numbers = h('span', { 'aria-hidden': 'true' });
  const spoken = h('span', { class: 'visually-hidden' });
  const counter = h('p', { id, class: 'field__counter' }, numbers, spoken);

  const update = () => {
    const used = control.value.length;
    numbers.textContent = `${used} / ${max}`;
    spoken.textContent = nl.app.charsUsed(used, max);
    counter.dataset.level = used >= max ? 'full' : used >= max * 0.9 ? 'near' : 'ok';
  };
  control.addEventListener('input', update);
  counter.update = update;
  update();
  return counter;
}
