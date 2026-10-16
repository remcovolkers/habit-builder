import { habitIconHref, uiIconHref, DEFAULT_ICON_KEY } from '../../app/icons.js';
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

/**
 * Het icoon van een habit: de tekening uit de iconenset (icons/set.svg) bij de emoji die in de habit staat. Een onbekende emoji (een eigen
 * emoji uit een oude versie of import) krijgt het standaardicoon: de app toont geen emoji van het toestel meer. De kleuren komen uit het
 * thema (currentColor en --icon-accent). Decoratief: het vak zegt `aria-hidden` of de omringende tekst noemt de habit al.
 */
export function habitIcon(emoji, className = '') {
  return sprite(habitIconHref(emoji, ICON_SET_KEYS) ?? uiIconHref(DEFAULT_ICON_KEY, ICON_SET_KEYS), `habit-icon ${className}`);
}

/** Hetzelfde voor prestaties, tips en tekens in de app (content/ui-icons.js): `key` is de sleutel van het icoon. */
export function uiIcon(key, className = '') {
  return sprite(uiIconHref(key, ICON_SET_KEYS), className);
}
