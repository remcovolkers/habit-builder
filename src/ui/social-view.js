// Een scherm dat meebeweegt met de sociale status en het account (zoals liveView dat voor de gegevens doet).
// Tekent niet opnieuw terwijl je in een invoerveld typt (anders verdwijnt wat je intikte); dat gebeurt zodra je het veld verlaat.
import { fill, h } from './dom.js';
import { account, onAccountChanged } from './account.js';
import { onSocialChanged } from './social-app.js';

const isTextField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

/**
 * render():     geeft een Node terug
 * afterDraw():  na elke tekenbeurt (bijvoorbeeld om een actie te starten zodra de status klaar is)
 * onAccount():  als het account is ingelogd of uitgelogd (niet bij elke sync)
 * Het resultaat heeft `redraw()` om zelf opnieuw te laten tekenen.
 */
export function socialLive({ render, className = '', afterDraw = null, onAccount = null }) {
  const root = h('div', { class: className });
  let pending = false;
  let first = true;

  // `force`: een bewuste hertekening (bijvoorbeeld na een zoekopdracht); automatische hertekeningen wachten tot je het invoerveld verlaat
  function draw({ force = false } = {}) {
    const active = document.activeElement;
    const typing = root.contains(active) && isTextField(active);
    if (typing && !force) { pending = true; return; }
    pending = false;
    const focusKey = root.contains(active) ? active?.dataset?.focusKey ?? null : null;
    let node;
    try {
      node = render();
    } catch (error) {
      console.error(error);
      node = h('p', { class: 'error-text', role: 'alert' }, 'Er ging iets mis bij het laden.');
    }
    fill(root, node);
    if (typing && active.isConnected) active.focus({ preventScroll: true }); // hetzelfde veld, opnieuw in het scherm gezet
    else if (focusKey) root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    // na de eerste keer tekenen bestaat het scherm voor de aanroeper nog niet (hij krijgt het pas terug): daarom een tik later
    if (first) { first = false; queueMicrotask(() => afterDraw?.()); } else afterDraw?.();
  }

  const stops = [];
  const stopAll = () => stops.forEach((stop) => stop());
  // Een scherm start soms al een verversing terwijl de router het nog in de pagina moet zetten. Pas stoppen met luisteren nadat het scherm
  // er ooit was (of als het er na een paar seconden nog niet is): anders zou zo'n vroege melding het scherm voorgoed doof maken.
  const born = Date.now();
  let attached = false;
  const whenConnected = (fn) => () => {
    if (root.isConnected) { attached = true; fn(); return; }
    if (attached || Date.now() - born > 3000) stopAll();
  };
  let lastStatus = account.status;
  stops.push(onSocialChanged(whenConnected(draw)));
  stops.push(onAccountChanged(whenConnected(() => {
    if (account.status === lastStatus) return; // elke sync meldt zich hier: alleen inloggen of uitloggen telt
    lastStatus = account.status;
    onAccount?.();
    draw();
  })));
  root.addEventListener('focusout', () => setTimeout(() => { if (pending && root.isConnected) draw(); }, 0));

  root.redraw = () => draw({ force: true });
  draw();
  return root;
}
