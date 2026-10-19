import { STRUCK_ICON_KEYS, habitIconHref, isBlockedIcon, uiIconHref, DEFAULT_ICON_KEY } from '../../app/icons.js';
import { ICON_SET_KEYS } from '../../content/icon-set.js';

const NS = 'http://www.w3.org/2000/svg';

function sprite(href, className) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `theme-icon ${className}`.trim());
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', href);
  svg.appendChild(use);
  return svg;
}

const SLASH = 'M3.5 3.5L20.5 20.5';
let blockedCount = 0;

/**
 * Dezelfde tekening met één diagonale streep erdoor, in de accentkleur. Om de streep blijft een smalle ruimte vrij (een masker), zodat hij
 * ook op 24 px leesbaar blijft zonder dat de achtergrondkleur bekend hoeft te zijn. Elke tekening krijgt zijn eigen masker-id.
 */
function blockedSprite(href, className) {
  const svg = sprite(href, className);
  const id = `blocked-${blockedCount += 1}`;
  const make = (name, attrs) => {
    const el = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const use = svg.firstChild;
  const mask = make('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 24, height: 24 });
  mask.appendChild(make('rect', { width: 24, height: 24, fill: 'white' }));
  mask.appendChild(make('path', { d: SLASH, stroke: 'black', 'stroke-width': 4.75, 'stroke-linecap': 'round', fill: 'none' }));
  const defs = make('defs', {});
  defs.appendChild(mask);
  const group = make('g', { mask: `url(#${id})` });
  group.appendChild(use);
  svg.appendChild(defs);
  svg.appendChild(group);
  svg.appendChild(make('path', {
    d: SLASH, class: 'theme-icon__slash', stroke: 'var(--icon-accent, currentColor)', 'stroke-width': 1.75, 'stroke-linecap': 'round', fill: 'none',
  }));
  return svg;
}

/**
 * Het icoon van een habit: de tekening uit de iconenset (icons/set.svg) bij de emoji die in de habit staat. Een onbekende emoji (een eigen
 * emoji uit een oude versie of import) krijgt het standaardicoon: de app toont geen emoji van het toestel meer. De kleuren komen uit het
 * thema (currentColor en --icon-accent). Decoratief: het vak zegt `aria-hidden` of de omringende tekst noemt de habit al.
 */
export function habitIcon(emoji, className = '') {
  const href = habitIconHref(emoji, ICON_SET_KEYS);
  const classes = `habit-icon ${className}`;
  if (href && isBlockedIcon(emoji)) return blockedSprite(href, `${classes} is-blocked`);
  return sprite(href ?? uiIconHref(DEFAULT_ICON_KEY, ICON_SET_KEYS), classes);
}

/**
 * Hetzelfde voor prestaties, tips en tekens in de app (content/ui-icons.js): `key` is de sleutel van het icoon. `blocked`: met een streep erdoor;
 * standaard alleen bij de iconen die altijd doorgestreept zijn (geen suiker, niet roken, scherm uit).
 */
export function uiIcon(key, className = '', { blocked = STRUCK_ICON_KEYS.includes(key) } = {}) {
  const href = uiIconHref(key, ICON_SET_KEYS);
  return href && blocked ? blockedSprite(href, `${className} is-blocked`) : sprite(href, className);
}
