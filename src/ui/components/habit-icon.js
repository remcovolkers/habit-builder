import { themeIconHref, uiIconHref } from '../../app/icons.js';
import { THEME_ICON_KEYS } from '../../content/theme-icons.js';
import { state } from '../state.js';

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
 * Het icoon van een habit voor het huidige thema: de tekening van het thema als dat er een heeft voor deze emoji (themes/<id>/icons.svg),
 * anders de emoji zelf. Geeft een SVG-element of tekst terug, om als kind in een vak te zetten. Decoratief: het vak zegt `aria-hidden`
 * of de omringende tekst noemt de habit al.
 */
export function habitIcon(emoji) {
  const href = themeIconHref(state.settings?.theme, emoji, THEME_ICON_KEYS);
  return href ? sprite(href, 'habit-icon') : emoji;
}

/**
 * Hetzelfde voor prestaties, tips en tekens in de app (content/ui-icons.js): `key` is de sleutel van het icoon, `fallback` wat er staat
 * zolang het thema deze tekening nog niet heeft.
 */
export function uiIcon(key, fallback = null, className = '') {
  const href = uiIconHref(state.settings?.theme, key, THEME_ICON_KEYS);
  return href ? sprite(href, className) : fallback;
}
