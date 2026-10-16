// Zet een iconenset van Moda in een thema: controleert de iconen, schrijft themes/<thema>/icons.svg (één sprite) en werkt
// src/content/theme-icons.js bij. Gebruik:
//   npm run icons:build -- <thema> <map met <sleutel>.svg-bestanden  of  de HTML-pagina van Moda>
// Een deel van de set is toegestaan (bijvoorbeeld de eerste 12 van ronde 1): wat ontbreekt toont de emoji. Bij een fout wordt niets geschreven.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_IDS } from '../src/app/themes.js';
import { THEME_ICON_KEYS } from '../src/content/theme-icons.js';
import { ALL_ICON_KEYS, buildSprite, extractIcons, normalizeIconSvg, themeIconsModule, validateIconSvg } from './lib/icons.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [theme, source] = process.argv.slice(2);
if (!THEME_IDS.includes(theme) || !source || !existsSync(source)) {
  console.error(`Gebruik: npm run icons:build -- <${THEME_IDS.join('|')}> <map of html-bestand>`);
  process.exit(2);
}

const icons = new Map();
if (statSync(source).isDirectory()) {
  for (const file of readdirSync(source).filter((f) => extname(f).toLowerCase() === '.svg').sort()) icons.set(basename(file, '.svg'), readFileSync(join(source, file), 'utf8'));
} else {
  for (const [key, svg] of extractIcons(readFileSync(source, 'utf8'))) icons.set(key, svg);
}
if (icons.size === 0) {
  console.error('Geen iconen gevonden (verwacht <sleutel>.svg-bestanden of <svg id="icon-<sleutel>"> in een HTML-pagina).');
  process.exit(1);
}

let failed = 0;
for (const [key, svg] of icons) icons.set(key, normalizeIconSvg(svg));
for (const [key, svg] of icons) {
  const problems = validateIconSvg(key, svg);
  if (problems.length) {
    failed += 1;
    console.error(`✗ ${key}\n${problems.map((p) => `    - ${p}`).join('\n')}`);
  }
}
if (failed) {
  console.error(`\n${failed} van ${icons.size} iconen afgekeurd; er is niets geschreven.`);
  process.exit(1);
}

const dir = join(ROOT, 'themes', theme);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'icons.svg'), buildSprite(icons));
const order = new Map(ALL_ICON_KEYS.map((key, i) => [key, i]));
const keys = [...icons.keys()].sort((a, b) => order.get(a) - order.get(b));
writeFileSync(join(ROOT, 'src/content/theme-icons.js'), themeIconsModule({ ...THEME_ICON_KEYS, [theme]: keys }));
const missing = ALL_ICON_KEYS.filter((key) => !icons.has(key));
console.log(`✓ ${keys.length} iconen in themes/${theme}/icons.svg; ${missing.length === 0 ? 'de set is volledig' : `${missing.length} ontbreken nog (dan toont de app de emoji): ${missing.join(', ')}`}`);
