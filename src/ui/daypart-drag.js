// Een kaart naar een ander dagdeel slepen op Vandaag. Met de muis pak je hem en sleep je; op een telefoon houd je hem even vast (anders blijft scrollen
// gewoon scrollen) en sleep je dan. De kaart blijft op zijn plek staan; een kopie volgt je vinger. Dagdelen waar de kaart heen mag lichten op, ook als er
// nog niets in staat (daar komt tijdelijk een lege plek). Wat de gebruiker niet kan slepen (toetsenbord, schermlezer) kan via ⋯ → "Ander dagdeel".
import { DAYPARTS } from '../domain/habit.js';
import { OWN_CONTROLS } from './tap-to-check.js';

const HOLD_MS = 380; // zo lang vasthouden op een telefoon voordat slepen begint
const TOUCH_SLOP = 10; // zo ver mag de vinger bewegen tijdens het vasthouden; verder is het scrollen
const MOUSE_SLOP = 6; // zo ver moet de muis bewegen voordat het slepen is
const EDGE = 72; // zo dicht bij de rand van het scherm gaat de pagina meescrollen
const MAX_SCROLL = 18; // px per beeld, bij het uiterste randje
const AFTER_DRAG = 300; // zo lang slikken we de tik die na het loslaten kan volgen

const ZONE = '[data-drop-daypart]';
let active = null; // er is maar één sleepactie tegelijk

const orderOf = (zone) => DAYPARTS.indexOf(zone.dataset.dropDaypart);

/** Zet een tijdelijke plek op de juiste plaats tussen de dagdelen. */
function placeZone(container, zone) {
  const siblings = [...container.querySelectorAll(`:scope > ${ZONE}`)];
  const next = siblings.find((other) => orderOf(other) > orderOf(zone));
  if (next) container.insertBefore(zone, next);
  else if (siblings.length > 0) siblings.at(-1).insertAdjacentElement('afterend', zone);
  else container.insertBefore(zone, null);
}

function scrollParent(el) {
  for (let parent = el?.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return document.scrollingElement;
}

/**
 * Maakt een kaart versleepbaar.
 * targets:    de dagdelen waar hij heen mag
 * createZone: (daypart) => element voor een dagdeel waar nog niets staat (met data-drop-daypart)
 * onDrop:     (daypart) => wordt aangeroepen met het dagdeel waar hij is losgelaten
 * De dagdelen met data-drop-daypart staan op de pagina; de kaart zelf hoeft er niets van te weten.
 */
export function makeDraggable(card, { targets, createZone, onDrop }) {
  card.dataset.draggable = 'true';
  // op een telefoon opent langer indrukken anders een menu of selecteert tekst
  card.addEventListener('contextmenu', (event) => { if (active?.card === card) event.preventDefault(); });
  card.addEventListener('pointerdown', (event) => {
    if (active?.dragging) return; // een tweede vinger tijdens het slepen telt niet
    active?.finish(false); // een eerdere aanraking die nooit is losgelaten (de muis buiten het venster) laten we los
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.target.closest(OWN_CONTROLS)) return;
    begin(card, event, { targets, createZone, onDrop });
  });
}

function begin(card, event, { targets, createZone, onDrop }) {
  const touch = event.pointerType !== 'mouse';
  const rect = card.getBoundingClientRect();
  const drag = {
    card, touch, id: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY,
    dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width,
    dragging: false, timer: 0, frame: 0, ghost: null, over: null, scroller: null,
  };
  active = drag;
  drag.finish = (drop) => finish(drop);

  const start = () => {
    drag.dragging = true;
    drag.scroller = scrollParent(card);
    drag.ghost = card.cloneNode(true);
    drag.ghost.classList.add('drag-ghost');
    drag.ghost.removeAttribute('data-draggable');
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.style.width = `${drag.width}px`;
    document.body.append(drag.ghost);
    document.body.classList.add('is-dragging');
    card.dataset.dragging = 'true';
    try { navigator.vibrate?.(12); } catch { /* niet elk toestel trilt */ }
    tick();
  };

  // elk beeld: meescrollen aan de rand, de kopie bij de vinger houden en kijken boven welk dagdeel hij hangt
  const tick = () => {
    if (!drag.dragging) return;
    const container = document.querySelector('.today__main');
    if (container) {
      for (const daypart of targets) {
        if (!container.querySelector(`:scope > ${ZONE}[data-drop-daypart="${daypart}"]`)) {
          const zone = createZone(daypart);
          zone.dataset.dropTemp = 'true';
          placeZone(container, zone);
        }
      }
    }
    const zones = [...document.querySelectorAll(ZONE)];
    const hit = document.elementsFromPoint(drag.x, drag.y).map((el) => el.closest(ZONE)).find((zone) => zone && targets.includes(zone.dataset.dropDaypart)) ?? null;
    drag.over = hit?.dataset.dropDaypart ?? null;
    for (const zone of zones) {
      const mine = targets.includes(zone.dataset.dropDaypart);
      zone.dataset.dropState = mine ? (zone === hit ? 'over' : 'ready') : '';
      if (!zone.dataset.dropState) delete zone.dataset.dropState;
    }

    const { scroller } = drag;
    if (scroller) {
      const box = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      const top = Math.max(0, box.top);
      const bottom = Math.min(window.innerHeight, box.bottom);
      if (drag.y < top + EDGE) scroller.scrollTop -= Math.ceil(MAX_SCROLL * Math.min(1, (top + EDGE - drag.y) / EDGE));
      else if (drag.y > bottom - EDGE) scroller.scrollTop += Math.ceil(MAX_SCROLL * Math.min(1, (drag.y - (bottom - EDGE)) / EDGE));
    }
    drag.ghost.style.transform = `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px)`;
    drag.frame = requestAnimationFrame(tick);
  };

  const move = (e) => {
    if (e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.dragging) return;
    const far = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (drag.touch) { if (far > TOUCH_SLOP) finish(false); } // de vinger gaat al voor het vasthouden klaar is: dit is scrollen
    else if (far > MOUSE_SLOP) start();
  };
  const up = (e) => { if (e.pointerId === drag.id) finish(true); };
  const cancel = (e) => { if (e.pointerId === drag.id) finish(false); };
  // tijdens het slepen mag de pagina niet scrollen onder de vinger (dat doen we zelf aan de rand)
  const block = (e) => { if (drag.dragging && e.cancelable) e.preventDefault(); };

  function finish(drop) {
    clearTimeout(drag.timer);
    cancelAnimationFrame(drag.frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('touchmove', block);
    active = null;
    if (!drag.dragging) return;
    const target = drop ? drag.over : null;
    drag.ghost.remove();
    document.body.classList.remove('is-dragging');
    delete card.dataset.dragging;
    for (const zone of document.querySelectorAll(ZONE)) delete zone.dataset.dropState;
    document.querySelectorAll('[data-drop-temp]').forEach((zone) => zone.remove());
    // na het loslaten kan de browser nog een "klik" op de kaart geven: die is geen afvinken
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), AFTER_DRAG);
    if (target) onDrop(target);
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('touchmove', block, { passive: false });
  if (touch) drag.timer = setTimeout(start, HOLD_MS);
}
