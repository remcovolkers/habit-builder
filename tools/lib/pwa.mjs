// Bouwt de service worker voor een uit te rollen map: lijst van alle bestanden plus een versie-id.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Bestanden die nooit in de cache van de service worker horen. */
const EXCLUDED = new Set(['sw.js', '.nojekyll']);

/** Alle bestanden in `dir` (posix-paden, gesorteerd), zonder de service worker zelf. */
export function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return files.filter((file) => !EXCLUDED.has(file)).sort();
}

/** Een korte, stabiele vingerafdruk van pad en inhoud van alle bestanden: wijzigt zodra er íets verandert. */
export function buildId(dir, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(join(dir, file)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Vult BUILD en PRECACHE in de sjabloon in. Gooit een fout als de vaste regels niet te vinden zijn. */
export function renderServiceWorker(template, files, id) {
  const buildLine = "const BUILD = 'dev';";
  const listLine = 'const PRECACHE = [];';
  if (!template.includes(buildLine) || !template.includes(listLine)) {
    throw new Error('sw.js mist de regels "const BUILD = \'dev\';" en/of "const PRECACHE = [];"');
  }
  return template
    .replace(buildLine, `const BUILD = '${id}';`)
    .replace(listLine, `const PRECACHE = ${JSON.stringify(files.map((file) => `./${file}`), null, 2)};`);
}

/** Schrijft de ingevulde sw.js in `dir`, op basis van de sjabloon. Geeft { id, files } terug. */
export function writeServiceWorker(dir, templatePath) {
  const files = listFiles(dir);
  const id = buildId(dir, files);
  writeFileSync(join(dir, 'sw.js'), renderServiceWorker(readFileSync(templatePath, 'utf8'), files, id));
  return { id, files };
}
