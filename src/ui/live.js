// Een scherm dat zichzelf opnieuw tekent als de data verandert.
import { fill, h } from './dom.js';
import { onChanged } from './state.js';
import { nl } from '../content/nl.js';

/**
 * load():           async, haalt de data op
 * render(data, refresh): geeft een Node terug
 * Elementen met data-focus-key behouden de focus over een hertekening heen (handig na een tik op een knop).
 * Is dat element daarna uitgeschakeld (bv. de "omhoog"-knop van de bovenste), dan gaat de focus naar data-focus-fallback.
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

    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset?.focusKey ?? null;
    const fallbackKey = active?.dataset?.focusFallback ?? null;
    // een kolom die zelf scrolt (desktop) blijft bij een hertekening op dezelfde plek staan, zoals de pagina dat op de telefoon vanzelf doet
    const SCROLLERS = '.page__pane, .page__scroll, .page__fixed';
    const scrolled = [...root.querySelectorAll(SCROLLERS)].map((el) => el.scrollTop);
    const opened = [...root.querySelectorAll('details')].map((el) => el.open); // een uitgeklapt blok (eerdere weken, gearchiveerd) blijft open
    fill(root, node);
    root.querySelectorAll(SCROLLERS).forEach((el, i) => { if (scrolled[i]) el.scrollTop = scrolled[i]; });
    const details = [...root.querySelectorAll('details')];
    if (details.length === opened.length) details.forEach((el, i) => { if (opened[i]) el.open = true; });
    const find = (key) => (key ? root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null);
    let target = find(focusKey);
    if (!target || target.disabled) target = find(fallbackKey);
    target?.focus({ preventScroll: true });
  }

  const stop = onChanged(() => (root.isConnected ? refresh() : stop()));
  refresh();
  return root;
}
