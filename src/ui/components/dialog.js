import { fill, h } from '../dom.js';
import { nl } from '../../content/nl.js';

const CLOSE_DISTANCE = 0.25; // zo ver (als deel van de hoogte) moet je het blad naar beneden slepen om het te sluiten
const CLOSE_SPEED = 0.6; // of zo snel (px per ms) wegvegen

/**
 * Modale dialoog op basis van <dialog>, als blad onderaan het scherm.
 * actions: [{ label, variant: 'primary'|'secondary'|'danger', onClick }] — de dialoog sluit na onClick,
 * tenzij die `false` teruggeeft (bv. bij een validatiefout).
 *
 * Focus: bij het openen gaat die naar de titel, niet naar het eerste veld. Een invoerveld dat de focus krijgt laat op een telefoon meteen het toetsenbord
 * omhoog springen, en dat is niet gewenst als de tekst optioneel is. `focus: 'native'` laat de browser kiezen (het eerste bedienbare element).
 *
 * Sluiten kan met een knop, met Esc, door buiten het blad te tikken of door het blad aan het handvat of de titel naar beneden te slepen.
 */
export function openDialog({ title, description = null, content = null, actions = [], cancelLabel = nl.app.cancel, onClose = null, className = '', focus = 'title' }) {
  const dialog = h('dialog', { class: `dialog ${className}`.trim(), 'aria-labelledby': 'dialog-title' });
  const close = () => dialog.close();

  const buttons = actions.map(({ label, variant = 'secondary', onClick }) =>
    h('button', {
      type: 'button',
      class: `button button--${variant}`,
      onclick: async () => {
        if ((await onClick?.()) !== false) close();
      },
    }, label),
  );
  if (cancelLabel) buttons.push(h('button', { type: 'button', class: 'button button--ghost', onclick: close }, cancelLabel));

  const grab = h('div', { class: 'dialog__grab', 'aria-hidden': 'true' });
  const heading = h('h2', { id: 'dialog-title', class: 'dialog__title', tabindex: focus === 'title' ? '-1' : null }, title);
  fill(
    dialog,
    grab,
    heading,
    description ? h('p', { class: 'dialog__text' }, description) : null,
    content,
    h('div', { class: 'dialog__actions' }, ...buttons),
  );

  // tikken buiten het blad (op het donkere vlak) sluit het
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) close();
  });

  // naar beneden slepen aan het handvat of de titel
  for (const handle of [grab, heading]) {
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button > 0) return;
      drag = { id: event.pointerId, startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, speed: 0, dy: 0 };
      handle.setPointerCapture(event.pointerId);
      dialog.style.transition = 'none';
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.dy = Math.max(0, event.clientY - drag.startY);
      const dt = event.timeStamp - drag.lastT;
      if (dt > 0) drag.speed = (event.clientY - drag.lastY) / dt;
      drag.lastY = event.clientY;
      drag.lastT = event.timeStamp;
      dialog.style.transform = `translateY(${drag.dy}px)`;
    });
    const release = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { dy, speed } = drag;
      drag = null;
      dialog.style.transition = 'transform var(--duration-fast) var(--ease-out)';
      if (dy > dialog.offsetHeight * CLOSE_DISTANCE || (dy > 12 && speed > CLOSE_SPEED)) close();
      else dialog.style.transform = '';
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
  }

  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  if (focus === 'title') heading.focus({ preventScroll: true }); // de titel, niet het eerste invoerveld: geen toetsenbord dat ongevraagd omhoog springt
  return { close, dialog };
}
