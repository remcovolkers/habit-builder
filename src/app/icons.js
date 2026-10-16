// De iconen van habits: opzoeken op emoji, zoeken op naam en het pad van de tekening in de iconenset. Puur (geen DOM).
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

/** Waar de sprite met alle tekeningen staat; één set voor alle thema's (de kleuren komen uit het thema). */
export const ICON_SET_PATH = 'icons/set.svg';

/**
 * De href van de tekening bij de emoji van een habit (`icons/set.svg#<sleutel>`), of null als de set deze sleutel nog niet heeft
 * (dan toont de app de emoji). `setKeys` is de lijst sleutels die in de sprite staan (content/icon-set.js).
 */
export function habitIconHref(emoji, setKeys) {
  const key = iconKeyFor(emoji);
  return key && (setKeys ?? []).includes(key) ? `${ICON_SET_PATH}#${key}` : null;
}

/** Hetzelfde voor de iconen buiten de habits om (content/ui-icons.js): de href als de set deze sleutel heeft, anders null. */
export const uiIconHref = (key, setKeys) => ((setKeys ?? []).includes(key) ? `${ICON_SET_PATH}#${key}` : null);
