import { habitIconHref, uiIconHref } from '../../app/icons.js';
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
 * Het icoon van een habit: de tekening uit de iconenset (icons/set.svg) als de set er een heeft voor deze emoji, anders de emoji zelf.
 * De kleuren komen uit het thema (currentColor en --icon-accent). Geeft een SVG-element of tekst terug, om als kind in een vak te zetten. Decoratief: het vak zegt `aria-hidden`
 * of de omringende tekst noemt de habit al.
 */
export function habitIcon(emoji) {
  const href = habitIconHref(emoji, ICON_SET_KEYS);
  return href ? sprite(href, 'habit-icon') : emoji;
}

/**
 * Hetzelfde voor prestaties, tips en tekens in de app (content/ui-icons.js): `key` is de sleutel van het icoon, `fallback` wat er staat
 * zolang de set deze tekening nog niet heeft.
 */
export function uiIcon(key, fallback = null, className = '') {
  const href = uiIconHref(key, ICON_SET_KEYS);
  return href ? sprite(href, className) : fallback;
}
