import { themeIconHref } from '../../app/icons.js';
import { THEME_ICON_KEYS } from '../../content/theme-icons.js';
import { state } from '../state.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Het icoon van een habit voor het huidige thema: de tekening van het thema als dat er een heeft voor deze emoji (themes/<id>/icons.svg),
 * anders de emoji zelf. Geeft een SVG-element of tekst terug, om als kind in een vak te zetten. Decoratief: het vak zegt `aria-hidden`
 * of de omringende tekst noemt de habit al.
 */
export function habitIcon(emoji) {
  const href = themeIconHref(state.settings?.theme, emoji, THEME_ICON_KEYS);
  if (!href) return emoji;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'habit-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', href);
  svg.appendChild(use);
  return svg;
}
