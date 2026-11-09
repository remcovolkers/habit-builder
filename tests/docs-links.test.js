// De documentatie loopt niet achter: elke verwijzing naar een bestand of een kop in een ander document klopt, en elk document in docs/ staat in de index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const docs = readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
const files = ['README.md', ...docs.map((f) => `docs/${f}`)];
const read = (file) => readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

/** De ankers die GitHub van de koppen in een document maakt. */
function anchorsOf(file) {
  const out = new Set();
  let inCode = false;
  for (const line of read(file).split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    const m = !inCode && /^#{1,6}\s+(.*)$/.exec(line);
    if (m) out.add(m[1].trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-'));
  }
  return out;
}

test('links tussen documenten wijzen naar bestanden en koppen die bestaan', () => {
  const broken = [];
  for (const file of files) {
    let inCode = false;
    for (const line of read(file).split('\n')) {
      if (line.startsWith('```')) inCode = !inCode;
      if (inCode) continue;
      for (const [, target] of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const [path, anchor] = target.split('#');
        if (path === '' ) continue;
        const resolved = normalize(join(dirname(file), path)).replace(/\\/g, '/');
        if (!existsSync(join(ROOT, resolved))) { broken.push(`${file}: ${target} (bestand ontbreekt)`); continue; }
        if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(anchor)) broken.push(`${file}: ${target} (kop ontbreekt)`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('elk document in docs/ staat in de index (docs/README.md)', () => {
  const index = read('docs/README.md');
  const missing = docs.filter((f) => f !== 'README.md' && !index.includes(`](${f})`));
  assert.deepEqual(missing, [], 'voeg het toe aan docs/README.md');
});
