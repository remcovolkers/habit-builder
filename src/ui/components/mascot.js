import { h } from '../dom.js';
import { mascotFor } from '../../app/themes.js';
import { state } from '../state.js';

/**
 * De illustratie van het huidige thema voor een plek in de app, of null als dit thema er geen heeft
 * (dan blijft de aanroeper bij zijn standaard: een emoji of niets). Decoratief: verborgen voor schermlezers.
 */
export function mascot(slot, className = '') {
  const src = mascotFor(state.settings?.theme, slot);
  if (!src) return null;
  return h('img', {
    class: `mascot mascot--${slot.replace('.', '-')} ${className}`.trim(),
    src,
    alt: '',
    'aria-hidden': 'true',
    decoding: 'async',
  });
}
