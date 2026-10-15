// Kopieert alleen de publiceerbare bestanden naar _site/ (wat CI naar GitHub Pages uploadt).
import { cpSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, '_site');
const PUBLISH = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'styles', 'vendor', 'icons', 'fonts'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of PUBLISH) {
  const from = join(ROOT, entry);
  if (existsSync(from)) cpSync(from, join(OUT, entry), { recursive: true });
}
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`Gestaged naar ${OUT}`);
