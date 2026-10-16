// Een zachte fade aan de boven- en onderkant van een kolom die scrolt, zodat wat uit beeld verdwijnt wegsmelt in plaats van afgesneden wordt.
// Alleen de markering gebeurt hier (data-fade-top / data-fade-bottom); de fade zelf staat in styles/layout.css (desktop).

/** Welke randen hebben nog inhoud erachter? Puur, zodat het te testen is. */
export function fadeState({ scrollTop, clientHeight, scrollHeight }, slack = 1) {
  return {
    top: scrollTop > slack,
    bottom: scrollTop + clientHeight < scrollHeight - slack,
  };
}

export const FADE_SELECTOR = '.page__pane, .page__scroll, .page__fixed, .app__main';

function mark(element) {
  const state = fadeState(element);
  element.toggleAttribute('data-fade-top', state.top);
  element.toggleAttribute('data-fade-bottom', state.bottom);
}

/**
 * Houdt de markering bij voor elke scrollende kolom in `root`: bij scrollen (het scroll-gebeurtenis bubbelt niet, dus in de vangfase),
 * bij een andere schermgrootte en als de inhoud verandert (een hertekening of een ander overzicht).
 */
export function startScrollFades(root = document.body) {
  let queued = false;
  const all = () => {
    queued = false;
    root.querySelectorAll(FADE_SELECTOR).forEach(mark);
  };
  const soon = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(all);
  };
  document.addEventListener('scroll', (event) => {
    if (event.target instanceof Element && event.target.matches(FADE_SELECTOR)) mark(event.target);
  }, { capture: true, passive: true });
  window.addEventListener('resize', soon);
  new MutationObserver(soon).observe(root, { childList: true, subtree: true });
  new ResizeObserver(soon).observe(root);
  soon();
}
