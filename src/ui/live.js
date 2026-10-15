// Een scherm dat zichzelf opnieuw tekent als de data verandert.
import { fill, h } from './dom.js';
import { onChanged } from './state.js';
import { nl } from '../content/nl.js';

/**
 * load():           async, haalt de data op
 * render(data, refresh): geeft een Node terug
 * Elementen met data-focus-key behouden de focus over een hertekening heen (handig na een tik op een knop).
 */
export function liveView({ load, render, className = '' }) {
  const root = h('div', { class: className }, h('p', { class: 'muted' }, nl.app.loading));
  let latest = 0;

  async function refresh() {
    const mine = ++latest;
    let node;
    try {
      node = render(await load(), refresh);
    } catch (error) {
      console.error(error);
      node = h('p', { class: 'error-text', role: 'alert' }, nl.app.loadError);
    }
    if (mine !== latest) return; // er is al een nieuwere hertekening onderweg

    const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
    fill(root, node);
    if (focusKey) root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  const stop = onChanged(() => (root.isConnected ? refresh() : stop()));
  refresh();
  return root;
}
