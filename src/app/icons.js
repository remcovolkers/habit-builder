// De iconen van habits: opzoeken op emoji, zoeken op naam en het pad van de tekening in de iconenset. Puur (geen DOM).
import { ICON_GROUPS, ICONS } from '../content/icons.js';

/**
 * De doorgestreepte stand ("geen alcohol", "ontbijt overslaan"): geen apart icoon maar dezelfde tekening met een streep erdoor.
 * In `habit.icon` staat dan de emoji met U+20E0 (het verbodsteken) erachter. Dat past in het bestaande veld: geen schemawijziging, en
 * sync en export werken door. Een oudere appversie toont zo'n habit als standaardicoon, net als bij elke onbekende emoji.
 */
export const BLOCK_MARK = '\u20E0';

// een emoji kan met of zonder variatiekenmerk (U+FE0F) zijn opgeslagen, en met of zonder doorstreepteken
const plain = (emoji) => String(emoji ?? '').replace(/[\uFE0F\u20E0]/g, '');
const BY_EMOJI = new Map(ICONS.map((icon) => [plain(icon.emoji), icon]));
const BY_KEY = new Map(ICONS.map((icon) => [icon.key, icon]));

/**
 * Iconen die altijd doorgestreept zijn ("geen suiker", "niet roken", "scherm uit"). Hun tekening in de set heeft geen streep: de app tekent
 * die zelf, net als bij elk ander doorgestreept icoon. Zo hoeven bestaande habits met deze iconen (opgeslagen zonder teken) niet te veranderen.
 */
export const STRUCK_ICON_KEYS = Object.freeze(['no-sugar', 'no-smoking', 'screen-off']);

/** Het icoon uit de catalogus bij een emoji (zoals die in `habit.icon` staat), of null voor een eigen of onbekende emoji. */
export const iconForEmoji = (emoji) => BY_EMOJI.get(plain(emoji)) ?? null;

/** De sleutel bij een emoji, of null. */
export const iconKeyFor = (emoji) => iconForEmoji(emoji)?.key ?? null;

export const iconForKey = (key) => BY_KEY.get(key) ?? null;

/** Staat er een streep door dit icoon? Alleen bij een bekend icoon: met het teken erachter, of een icoon dat altijd doorgestreept is. */
export const isBlockedIcon = (stored) => {
  const key = iconKeyFor(stored);
  return key !== null && (String(stored).includes(BLOCK_MARK) || STRUCK_ICON_KEYS.includes(key));
};

/** Is er expliciet doorgestreept gekozen (het teken staat erachter)? Voor de stand van de schakelaar in het icoonblad. */
export const hasBlockMark = (stored) => iconKeyFor(stored) !== null && String(stored).includes(BLOCK_MARK);

/** De opgeslagen waarde voor een emoji met of zonder streep (de emoji met of zonder U+20E0 erachter). Een icoon dat altijd doorgestreept is, blijft zonder teken. */
export const withBlock = (emoji, blocked) => {
  const base = String(emoji ?? '').replace(new RegExp(BLOCK_MARK, 'g'), '');
  const key = iconKeyFor(base);
  return blocked && key !== null && !STRUCK_ICON_KEYS.includes(key) ? `${base}${BLOCK_MARK}` : base;
};

const fold = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim();

/**
 * Past een zoekterm bij een woord? Het woord begint met de term ("toil" vindt "toilet"), of de term is een vorm van het woord
 * ("toiletten" vindt "toilet", "koelkasten" vindt "koelkast": meervoud en werkwoordsvormen).
 */
const termMatches = (term, word) => word.startsWith(term) || (word.length >= 5 && term.length > word.length && term.startsWith(word));

const wordsOf = (icon) => fold(`${icon.name} ${icon.key.replace(/-/g, ' ')} ${icon.words}`).split(/\s+/);

/**
 * Zoekt op naam, sleutel en zoekwoorden; elk woord uit de zoekopdracht moet ergens in voorkomen (op het begin van een woord, of als vorm ervan).
 * Geeft de groepen terug met alleen de passende iconen; groepen zonder treffer vallen weg. Zonder zoekopdracht alles.
 */
export function searchIcons(query) {
  const terms = fold(query).split(/[\s-]+/).filter(Boolean);
  if (terms.length === 0) return ICON_GROUPS.map((group) => ({ ...group }));
  const matches = (icon) => {
    const words = wordsOf(icon);
    return terms.every((term) => words.some((word) => termMatches(term, word)));
  };
  return ICON_GROUPS
    .map((group) => ({ ...group, icons: group.icons.filter(matches) }))
    .filter((group) => group.icons.length > 0);
}

// woorden in een habitnaam die niets zeggen over het icoon
const STOP_WORDS = new Set(['de', 'het', 'een', 'en', 'of', 'in', 'op', 'aan', 'met', 'voor', 'naar', 'van', 'te', 'om', 'bij', 'elke', 'iedere', 'per', 'mijn', 'ik', 'niet', 'geen', 'weer', 'dag', 'week', 'doen', 'maken', 'spelen', 'even', 'gaan']);

/**
 * Welke iconen passen bij de naam van een habit ("Toiletten schoonmaken" geeft het toilet en de bezem)? Elk woord telt los mee; een woord
 * in de naam van het icoon telt zwaarder dan een zoekwoord, en een woord eerder in de habitnaam zwaarder dan een later woord (het voorwerp
 * staat meestal vooraan: "koelkast opruimen"). Geeft hoogstens `limit` iconen, de beste eerst; leeg als niets past.
 */
export function suggestIcons(habitName, limit = 6) {
  const terms = fold(habitName).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
  if (terms.length === 0) return [];
  const scored = [];
  ICONS.forEach((icon, order) => {
    const nameWords = fold(`${icon.name} ${icon.key.replace(/-/g, ' ')}`).split(/\s+/);
    const words = wordsOf(icon);
    let score = 0;
    terms.forEach((term, index) => {
      const weight = 1 + (terms.length - index) * 0.01;
      if (nameWords.some((word) => termMatches(term, word))) score += 1.5 * weight;
      else if (words.some((word) => termMatches(term, word))) score += weight;
    });
    if (score > 0) scored.push({ icon, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((entry) => entry.icon);
}

/** Het icoon voor een emoji die niet in de catalogus staat. */
export const DEFAULT_ICON_KEY = 'sprout';

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
