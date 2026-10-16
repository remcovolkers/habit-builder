// De iconen van habits: opzoeken op emoji, zoeken op naam en het pad van de tekening in een thema. Puur (geen DOM).
import { ICON_GROUPS, ICONS } from '../content/icons.js';

// een emoji kan met of zonder variatiekenmerk (U+FE0F) zijn opgeslagen
const plain = (emoji) => String(emoji ?? '').replace(/️/g, '');
const BY_EMOJI = new Map(ICONS.map((icon) => [plain(icon.emoji), icon]));
const BY_KEY = new Map(ICONS.map((icon) => [icon.key, icon]));

/** Het icoon uit de catalogus bij een emoji (zoals die in `habit.icon` staat), of null voor een eigen of onbekende emoji. */
export const iconForEmoji = (emoji) => BY_EMOJI.get(plain(emoji)) ?? null;

/** De sleutel bij een emoji, of null. */
export const iconKeyFor = (emoji) => iconForEmoji(emoji)?.key ?? null;

export const iconForKey = (key) => BY_KEY.get(key) ?? null;

const fold = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Zoekt op naam, sleutel en zoekwoorden; elk woord uit de zoekopdracht moet ergens in voorkomen (op het begin van een woord).
 * Geeft de groepen terug met alleen de passende iconen; groepen zonder treffer vallen weg. Zonder zoekopdracht alles.
 */
export function searchIcons(query) {
  const terms = fold(query).split(/[\s-]+/).filter(Boolean);
  if (terms.length === 0) return ICON_GROUPS.map((group) => ({ ...group }));
  const matches = (icon) => {
    const words = fold(`${icon.name} ${icon.key.replace(/-/g, ' ')} ${icon.words}`).split(/\s+/);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  };
  return ICON_GROUPS
    .map((group) => ({ ...group, icons: group.icons.filter(matches) }))
    .filter((group) => group.icons.length > 0);
}

/**
 * Waar de tekening van een icoon in een thema staat (`themes/<thema>/icons.svg#<sleutel>`), of null als dit thema er geen heeft
 * voor deze emoji (dan toont de app de emoji). `themeKeys` is de lijst sleutels die het thema levert (content/theme-icons.js).
 */
export function themeIconHref(themeId, emoji, themeKeys) {
  const key = iconKeyFor(emoji);
  return key && (themeKeys?.[themeId] ?? []).includes(key) ? `themes/${themeId}/icons.svg#${key}` : null;
}
