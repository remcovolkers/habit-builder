import { h } from '../dom.js';
import { THEMES, THEME_IDS } from '../../app/themes.js';

/**
 * De themakeuze: een kaart per thema met kleurstalen, naam en omschrijving. Gedeeld door Instellingen en de introductie.
 * current: het gekozen thema, onPick(id): wat er bij een keuze gebeurt (het thema opslaan en toepassen doet de aanroeper).
 */
export function themeOptions({ current, onPick }) {
  return h('div', { class: 'theme-options', role: 'radiogroup' },
    ...THEME_IDS.map((id) => {
      const theme = THEMES[id];
      const swatches = theme.swatches.map((color) => {
        const dot = h('i', { class: 'theme-option__swatch' });
        dot.style.background = color;
        return dot;
      });
      return h('label', { class: 'theme-option', dataset: { theme: id } },
        h('input', { class: 'choice__input', type: 'radio', name: 'theme', value: id, checked: id === current, onchange: () => onPick(id) }),
        h('span', { class: 'theme-option__face' },
          h('span', { class: 'theme-option__swatches' }, ...swatches),
          h('span', { class: 'theme-option__name' }, theme.name),
          h('span', { class: 'theme-option__desc' }, theme.description)));
    }));
}
