import { fill, h } from '../dom.js';
import { applyUpdate, onPwaChanged, pwa } from '../../pwa.js';
import { nl } from '../../content/nl.js';

/** Vaste balk boven de tabbalk zodra er een nieuwe versie klaarstaat. "Later" verbergt hem tot de volgende keer opstarten. */
export function mountUpdateBanner() {
  const region = h('div', { class: 'update-region', 'aria-live': 'polite' });
  document.body.append(region);
  let dismissed = false;

  function render() {
    if (!pwa.updateReady || dismissed) {
      fill(region);
      return;
    }
    fill(region, h('div', { class: 'update-banner', role: 'status' },
      h('span', null, nl.pwa.updateAvailable),
      h('button', { type: 'button', id: 'applyUpdate', class: 'update-banner__action', onclick: applyUpdate }, nl.pwa.update),
      h('button', { type: 'button', id: 'dismissUpdate', class: 'update-banner__later', onclick: () => { dismissed = true; render(); } }, nl.pwa.later)));
  }

  onPwaChanged(render);
  render();
}
