import { fill, h } from '../dom.js';
import { onPwaChanged, promptInstall, pwa } from '../../pwa.js';
import { nl } from '../../content/nl.js';

/**
 * "App installeren" voor Instellingen. Op Android/Chrome met een knop (als de browser dat toestaat),
 * op iOS met een korte uitleg (daar bestaat geen installatieknop), en nergens als de app al geïnstalleerd is.
 */
export function installCard() {
  const root = h('section', { class: 'section install-card' });

  function render() {
    if (pwa.installed) {
      fill(root);
      root.hidden = true;
      return;
    }
    root.hidden = !(pwa.canInstall || pwa.ios);
    if (root.hidden) {
      fill(root);
      return;
    }
    fill(root,
      h('h2', { class: 'section__title' }, nl.pwa.installTitle),
      h('p', { class: 'section__hint' }, pwa.canInstall ? nl.pwa.installText : nl.pwa.iosText),
      pwa.canInstall
        ? h('button', { type: 'button', id: 'installApp', class: 'button button--primary button--block', onclick: () => promptInstall() }, nl.pwa.install)
        : null);
  }

  const stop = onPwaChanged(() => (root.isConnected ? render() : stop()));
  render();
  return root;
}
