// De Android-bronnen worden pas in CI gebouwd (lokaal is geen Android SDK nodig), dus een fout die de bouw breekt, zie je daar pas laat.
// Dit vangt de fouten die we al eens maakten: een XML-commentaar met "--" erin (niet toegestaan) breekt de hele resource-stap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAIN = join(ROOT, 'android/app/src/main');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
const xmlFiles = walk(MAIN).filter((file) => file.endsWith('.xml') && !file.includes(`${join('assets', 'public')}`));

test('Android-XML: er zijn bronbestanden om te controleren', () => {
  assert.ok(xmlFiles.length > 5, `${xmlFiles.length} bestanden`);
});

test('Android-XML: geen "--" binnen een commentaar (dat is ongeldige XML en breekt de bouw)', () => {
  const offenders = [];
  for (const file of xmlFiles) {
    for (const [, comment] of readFileSync(file, 'utf8').matchAll(/<!--([\s\S]*?)-->/g)) {
      if (comment.includes('--')) offenders.push(`${relative(ROOT, file)}: ${comment.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Android-XML: elk bestand begint met een XML-declaratie of een commentaar, en elk commentaar wordt gesloten', () => {
  for (const file of xmlFiles) {
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    assert.match(text, /^\s*<(\?xml|!--|[a-zA-Z])/, relative(ROOT, file));
    assert.equal((text.match(/<!--/g) ?? []).length, (text.match(/-->/g) ?? []).length, `commentaar niet gesloten in ${relative(ROOT, file)}`);
  }
});
