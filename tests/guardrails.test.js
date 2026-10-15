// Bewaakt de afspraken uit PLAN.md die niet in de gewone logica terugkomen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = ['src', 'tools']
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));

test('R8: geen onveilige HTML-injectie in de broncode', () => {
  const forbidden = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b|new Function\(/;
  const offenders = sourceFiles.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});

test('UI: geen replaceChildren/append/prepend/before/after — die maken van null de tekst "null"; gebruik fill() of h()', () => {
  const unsafe = /\.(replaceChildren|append|prepend|before|after)\(/;
  const offenders = sourceFiles
    .filter((f) => !f.endsWith(join('ui', 'dom.js')) && f.includes(`${join(ROOT, 'src')}`))
    .filter((f) => {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/document\.body\.append\(/g, '');
      return unsafe.test(code);
    });
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});

test('architectuur: src/domain en src/app zijn puur — geen DOM, netwerk, opslag of imports uit ui/data', () => {
  const domainFiles = ['domain', 'app']
    .flatMap((d) => walk(join(ROOT, 'src', d)))
    .filter((f) => f.endsWith('.js'));
  const impure = /\b(window|document|localStorage|sessionStorage|indexedDB|fetch|navigator|location)\b|from\s+['"]\.\.\/(ui|data)\//;
  const offenders = domainFiles.filter((f) => {
    const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''); // commentaar mag deze woorden bevatten
    return impure.test(code);
  });
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});

test('R3: de service-role key staat nergens in de repo', () => {
  const files = ['src', 'tools', 'tests', 'docs', 'supabase', '.github']
    .flatMap((d) => {
      try { return walk(join(ROOT, d)); } catch { return []; }
    })
    .filter((f) => !f.endsWith('guardrails.test.js'));
  const offenders = files.filter((f) => /service_role|sb_secret_/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});

test('D2: index.html gebruikt alleen relatieve paden (Pages draait op een subpad)', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const absolute = [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(absolute, []);
});
