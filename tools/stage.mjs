// Kopieert alleen de publiceerbare bestanden naar _site/ (wat CI naar GitHub Pages uploadt)
// en vult de service worker in met de bestandslijst en een versie-id van déze build.
import { cpSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeServiceWorker } from './lib/pwa.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, '_site');
const PUBLISH = ['index.html', 'manifest.webmanifest', 'src', 'styles', 'vendor', 'icons', 'fonts', 'themes'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of PUBLISH) {
  const from = join(ROOT, entry);
  if (existsSync(from)) cpSync(from, join(OUT, entry), { recursive: true });
}
writeFileSync(join(OUT, '.nojekyll'), '');

const { id, files } = writeServiceWorker(OUT, join(ROOT, 'sw.js'));
console.log(`Gestaged naar ${OUT} (build ${id}, ${files.length} bestanden in de cache)`);
