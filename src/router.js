// Hash-router: GitHub Pages heeft geen SPA-fallback, dus routes leven achter '#'.
import { fill } from './ui/dom.js';

export const DEFAULT_PATH = '/today';

/** '#/habits/abc?x=1' -> { path: '/habits/abc', query: { x: '1' } } */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  let path = '/' + pathPart.replace(/^\/+/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path === '/') path = DEFAULT_PATH;
  return { path, query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

/** Zoekt de eerste route waarvan het patroon past ('/habits/:id'); geeft params terug. */
export function matchRoute(routes, path) {
  const segments = path.split('/').filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== segments.length) continue;
    const params = {};
    const ok = pattern.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segments[i]);
        return true;
      }
      return part === segments[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

/**
 * Koppelt routes aan een container.
 * routes: [{ path, render(ctx) -> Node }]; ctx = { path, params, query }
 */
export function startRouter({ routes, outlet, notFound, onChange }) {
  let firstRender = true;

  function resolve() {
    const { path, query } = parseHash(location.hash);
    const match = matchRoute(routes, path);
    const ctx = { path, params: match?.params ?? {}, query };
    let view;
    try {
      view = match ? match.route.render(ctx) : notFound(ctx);
    } catch (error) {
      console.error(error);
      view = document.createTextNode('Er ging iets mis bij het openen van deze pagina.');
    }
    fill(outlet, view);
    window.scrollTo(0, 0); // een nieuwe pagina begint bovenaan, niet waar de vorige stond
    outlet.scrollTop = 0; // op desktop is het werkvlak de scroller (kolommen zijn nieuw en beginnen vanzelf bovenaan)
    // focus naar de pagina bij een routewissel (schermlezers lezen de nieuwe pagina voor); niet bij het eerste laden,
    // anders begint de eerste Tab al in de inhoud en komt het toetsenbord nooit bij "Naar de inhoud" of de navigatie
    if (!firstRender) outlet.focus({ preventScroll: true });
    firstRender = false;
    onChange?.(ctx);
  }
  window.addEventListener('hashchange', resolve);
  resolve();
}
