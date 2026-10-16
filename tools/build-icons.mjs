// Bouwt de iconenset van de app uit wat Moda aanleverde: leest alle `<sleutel>.svg`-bestanden en alle HTML-pagina's met
// `<svg id="icon-<sleutel>">` onder docs/icons/ (ook in submappen), controleert elk icoon, schrijft icons/set.svg (één sprite voor alle
// thema's) en src/content/icon-set.js (welke sleutels erin staan). Gebruik: npm run icons:build [map met Moda-bestanden]
// Komt een sleutel in meer bestanden voor, dan wint het laatst gewijzigde bestand (een herziene versie). Een deel van de set is toegestaan:
// de test "de iconenset is compleet" faalt dan tot alles er is. Bij een fout wordt niets geschreven.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ICON_KEYS, buildSprite, extractIcons, iconSetModule, normalizeIconSvg, validateIconSvg } from './lib/icons.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = process.argv[2] ?? join(ROOT, 'docs', 'icons');
if (!existsSync(SOURCE) || !statSync(SOURCE).isDirectory()) {
  console.error(`Map niet gevonden: ${SOURCE}\nGebruik: npm run icons:build [map met de svg-bestanden en html-pagina's van Moda]`);
  process.exit(2);
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (['.svg', '.html'].includes(extname(entry.name).toLowerCase())) files.push({ path, time: statSync(path).mtimeMs });
  }
}(SOURCE));
files.sort((a, b) => a.time - b.time); // oud eerst: een nieuwer bestand overschrijft een oudere versie van dezelfde sleutel

const icons = new Map();
const origin = new Map();
for (const { path } of files) {
  const found = extname(path).toLowerCase() === '.svg' ? new Map([[basename(path, '.svg'), readFileSync(path, 'utf8')]]) : extractIcons(readFileSync(path, 'utf8'));
  for (const [key, svg] of found) {
    icons.set(key, normalizeIconSvg(svg));
    origin.set(key, path.slice(SOURCE.length).replace(/^[\\/]/, ''));
  }
}
if (icons.size === 0) {
  console.error('Geen iconen gevonden (verwacht <sleutel>.svg-bestanden of <svg id="icon-<sleutel>"> in een HTML-pagina).');
  process.exit(1);
}

let failed = 0;
for (const [key, svg] of icons) {
  const problems = validateIconSvg(key, svg);
  if (problems.length) {
    failed += 1;
    console.error(`✗ ${key} (${origin.get(key)})\n${problems.map((p) => `    - ${p}`).join('\n')}`);
  }
}
if (failed) {
  console.error(`\n${failed} van ${icons.size} iconen afgekeurd; er is niets geschreven.`);
  process.exit(1);
}

writeFileSync(join(ROOT, 'icons', 'set.svg'), buildSprite(icons));
const order = new Map(ALL_ICON_KEYS.map((key, i) => [key, i]));
const keys = [...icons.keys()].sort((a, b) => order.get(a) - order.get(b));
writeFileSync(join(ROOT, 'src/content/icon-set.js'), iconSetModule(keys));
const missing = ALL_ICON_KEYS.filter((key) => !icons.has(key));
console.log(`✓ ${keys.length} van ${ALL_ICON_KEYS.length} iconen in icons/set.svg; ${missing.length === 0 ? 'de set is volledig' : `${missing.length} ontbreken nog (dan toont de app de emoji): ${missing.join(', ')}`}`);
