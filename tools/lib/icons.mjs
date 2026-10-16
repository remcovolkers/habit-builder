// Iconensets van thema's: controleren van losse SVG's (uit Moda) en samenvoegen tot één sprite per thema. Puur, zonder bestanden:
// het lezen en schrijven doet tools/build-icons.mjs. Regels staan in docs/MODA-ICONS.md.
import { ICONS } from '../../src/content/icons.js';

export const MAX_ICON_BYTES = 6000;
const KEYS = new Set(ICONS.map((icon) => icon.key));
const ORDER = new Map(ICONS.map((icon, i) => [icon.key, i]));
const ROOT_SKIP = new Set(['id', 'xmlns', 'xmlns:xlink', 'viewbox', 'width', 'height', 'class', 'version', 'x', 'y', 'style']);
const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'color', 'flood-color'];
const OK_COLOR = /^(none|currentColor|inherit|transparent|var\(.+\))$/;

const rootOf = (svg) => /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(svg);

/** Alle kenmerken van een tag als { naam: waarde } (namen in kleine letters). */
function attributesOf(text) {
  const out = {};
  for (const [, name, value] of text.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[name.toLowerCase()] = value;
  return out;
}

const STYLE_TO_ATTR = new Set(['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'stroke-linecap', 'stroke-linejoin']);

/**
 * Moda zet het accent soms als style="stroke:var(--icon-accent, currentColor);fill:…" op een element. Dat is bedoeld zoals het is, maar een
 * style-kenmerk wordt door de beveiligingsregels van de app (CSP) niet overal gelezen. Hier worden zulke stijlen kenmerken
 * (stroke="…" fill="…"); een stijl met iets anders dan tekenkenmerken blijft staan en wordt bij het controleren afgekeurd.
 */
export function normalizeIconSvg(svg) {
  return String(svg).replace(/<(\w+)(\s[^>]*?)?(\/?)>/g, (tag, name, rest = '', selfClose) => {
    const style = /\sstyle\s*=\s*"([^"]*)"/.exec(rest);
    if (!style) return tag;
    const declarations = style[1].split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim().toLowerCase(), d.slice(d.indexOf(':') + 1).trim()]);
    if (declarations.length === 0 || !declarations.every(([property, value]) => STYLE_TO_ATTR.has(property) && value !== '' && !value.includes('"'))) return tag;
    let attrs = rest.replace(style[0], '');
    for (const [property] of declarations) attrs = attrs.replace(new RegExp(String.raw`\s${property}\s*=\s*"[^"]*"`, 'i'), '');
    return `<${name}${attrs}${declarations.map(([property, value]) => ` ${property}="${value}"`).join('')}${selfClose}>`;
  });
}

/** Geeft een lijst problemen (leeg = goed) voor één icoon. */
export function validateIconSvg(key, svg) {
  const problems = [];
  if (!KEYS.has(key)) problems.push(`onbekende sleutel "${key}" (zie src/content/icons.js)`);
  const text = String(svg ?? '');
  if (text.length > MAX_ICON_BYTES) problems.push(`te groot (${text.length} tekens, maximaal ${MAX_ICON_BYTES})`);
  const root = rootOf(text);
  if (!root) return [...problems, 'geen enkele <svg>…</svg>'];
  const attrs = attributesOf(root[1]);
  if (!/^0\s+0\s+24\s+24$/.test((attrs.viewbox ?? '').trim())) problems.push('viewBox moet "0 0 24 24" zijn');
  if ('width' in attrs || 'height' in attrs) problems.push('geen width of height op de <svg>: de grootte regelt de pagina');
  if ('style' in attrs || /\sstyle\s*=/.test(root[2])) problems.push('geen style-kenmerk: gebruik kenmerken als fill en stroke');
  for (const [pattern, what] of [
    [/<script\b/i, '<script>'], [/<style\b/i, '<style>'], [/<foreignObject\b/i, '<foreignObject>'], [/<image\b/i, '<image>'],
    [/<text\b/i, '<text> (geen tekst in een icoon)'], [/<(linear|radial)Gradient\b/i, 'een kleurverloop'], [/<filter\b/i, '<filter>'],
    [/\son[a-z]+\s*=/i, 'een gebeurtenis-kenmerk (onclick…)'], [/javascript:/i, 'javascript:'], [/\b(?:xlink:)?href\s*=/i, 'href (geen verwijzingen)'],
    [/<!ENTITY/i, '<!ENTITY'],
  ]) if (pattern.test(text)) problems.push(`bevat ${what}`);
  for (const [, tag, rest] of text.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const a = attributesOf(rest);
    for (const name of COLOR_ATTRS) {
      if (name in a && !OK_COLOR.test(a[name].trim())) problems.push(`vaste kleur in <${tag}>: ${name}="${a[name]}" (gebruik currentColor of var(--icon-accent, currentColor))`);
    }
  }
  return [...new Set(problems)];
}

/** Haalt de iconen uit een HTML-pagina van Moda: elke `<svg id="icon-<sleutel>" …>…</svg>`. Geeft een Map sleutel → svg. */
export function extractIcons(html) {
  const found = new Map();
  for (const match of String(html).matchAll(/<svg\b[^>]*\bid\s*=\s*"icon-([a-z0-9-]+)"[^>]*>[\s\S]*?<\/svg>/gi)) found.set(match[1], match[0]);
  return found;
}

/** Eén sprite (`<symbol id="sleutel">` per icoon, in de volgorde van de catalogus) uit een Map sleutel → svg. */
export function buildSprite(icons) {
  const symbols = [...icons.keys()].sort((a, b) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9)).map((key) => {
    const [, rawAttrs, inner] = rootOf(icons.get(key));
    const kept = Object.entries(attributesOf(rawAttrs)).filter(([name]) => !ROOT_SKIP.has(name) && !name.startsWith('xmlns'));
    const extra = kept.map(([name, value]) => ` ${name}="${value}"`).join('');
    return `  <symbol id="${key}" viewBox="0 0 24 24"${extra}>${inner.trim()}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
}

/** De tekst van src/content/theme-icons.js voor de sleutels per thema. */
export function themeIconsModule(keysByTheme) {
  const lines = Object.entries(keysByTheme).map(([id, keys]) => `  ${id}: Object.freeze([${keys.map((k) => `'${k}'`).join(', ')}]),`);
  return `// Welke sleutels (content/icons.js) elk thema als eigen tekening levert, in themes/<id>/icons.svg.
// GEGENEREERD door \`npm run icons:build\` (tools/build-icons.mjs): niet met de hand aanpassen.
// Een sleutel die hier niet staat, toont de emoji.
export const THEME_ICON_KEYS = Object.freeze({
${lines.join('\n')}
});
`;
}
