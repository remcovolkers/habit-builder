import { h } from '../dom.js';
import { icon } from '../svg.js';

/**
 * De zwevende actieknop (FAB) voor "nieuwe habit": een plusje, alleen op mobiel en tablet
 * (op desktop staat er een gewone knop in de pagina). `label` is de toegankelijke naam.
 *
 * Aan het einde van de pagina zou de knop over de laatste kaart vallen. In plaats van daar vaste ruimte voor vrij te houden
 * (die je als lege scrollruimte onder de laatste kaart ziet) schuift hij weg zodra hij iets zou afdekken, en komt terug
 * zodra je een stukje omhoog scrolt. Met het toetsenbord blijft hij bereikbaar: focus haalt hem terug.
 */
export function fab({ href, label }) {
  const link = h('a', { class: 'fab', href, 'aria-label': label }, icon('plus', { strokeWidth: 2.5 }));
  watchEnd(link);
  return link;
}

function watchEnd(link) {
  let frame = 0;
  let observer = null;

  const stop = () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    observer?.disconnect();
    cancelAnimationFrame(frame);
  };

  const update = () => {
    frame = 0;
    if (!link.isConnected) return stop(); // het scherm is vervangen of verlaten
    const contentEnd = link.parentElement.getBoundingClientRect().bottom; // de inhoud van dit scherm; main zelf rekt op tot de schermhoogte
    // de knop dekt de laatste kaart af zodra de onderkant van de inhoud in beeld is en achter de knop zit. Staat de pagina bovenaan
    // (korte pagina) dan kun je niet verder scrollen om de knop weg te laten: dan blijft hij gewoon staan.
    const covers = window.scrollY > 0 && contentEnd > link.getBoundingClientRect().top && contentEnd < window.innerHeight;
    link.classList.toggle('fab--away', covers && document.activeElement !== link);
  };

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  link.addEventListener('focus', () => link.classList.remove('fab--away'));
  // pas na het plaatsen in de pagina is er iets te meten; verandert de hoogte van de pagina (afvinken klapt een sectie in), dan opnieuw
  requestAnimationFrame(() => {
    if (!link.parentElement) return stop();
    observer = new ResizeObserver(schedule);
    observer.observe(link.parentElement);
    update();
  });
}
