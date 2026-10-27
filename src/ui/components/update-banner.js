import { fill, h } from '../dom.js';
import { applyUpdate, onPwaChanged, pwa } from '../../pwa.js';
import { appUpdate, downloadAppUpdate, onAppUpdateChanged } from '../app-update.js';
import { nl } from '../../content/nl.js';

/**
 * Vaste balk boven de tabbalk zodra er een nieuwe versie klaarstaat. "Later" verbergt hem tot de volgende keer opstarten.
 * In de Android-app gaat een nieuwe APK voor (die vraagt meer van je dan het vernieuwen van de webkant).
 */
export function mountUpdateBanner() {
  const region = h('div', { class: 'update-region', 'aria-live': 'polite' });
  document.body.append(region);
  let dismissed = false;
  let appDismissed = null; // de versie waarvoor "Later" is gekozen

  function render() {
    const app = appUpdate.available;
    if (app && appDismissed !== app.version) {
      fill(region, h('div', { class: 'update-banner', role: 'status', id: 'appUpdateBanner' },
        h('span', null, nl.pwa.appUpdateAvailable(app.version)),
        h('button', { type: 'button', id: 'downloadAppUpdate', class: 'update-banner__action', onclick: downloadAppUpdate }, nl.pwa.appUpdateDownload),
        h('button', { type: 'button', id: 'dismissAppUpdate', class: 'update-banner__later', onclick: () => { appDismissed = app.version; render(); } }, nl.pwa.later)));
      return;
    }
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
  onAppUpdateChanged(render);
  render();
}
