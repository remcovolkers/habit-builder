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
  // De Edge Function leest de sleutel uit de omgeving van de server; alleen de NAAM van die variabele mag in de repo staan.
  const offenders = files.filter((f) => /service_role|sb_secret_/i.test(readFileSync(f, 'utf8').replaceAll('SUPABASE_SERVICE_ROLE_KEY', '')));
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});

test('R3: de naam van de service-sleutel komt alleen voor in de Edge Function, haar tests en de documentatie — nooit in de app', () => {
  const clientSide = ['src', 'tools', 'styles', 'vendor']
    .flatMap((d) => {
      try { return walk(join(ROOT, d)); } catch { return []; }
    })
    .concat(join(ROOT, 'index.html'), join(ROOT, 'sw.js'), join(ROOT, 'manifest.webmanifest'));
  const offenders = clientSide.filter((f) => readFileSync(f, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.deepEqual(offenders.map((f) => relative(ROOT, f)), []);
});

test('D2: index.html gebruikt alleen relatieve paden (Pages draait op een subpad)', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const absolute = [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(absolute, []);
});

test('CSS: de pagina is nooit hoger dan het scherm — min-height gebruikt svh, niet dvh (dvh verandert met de adresbalk van Chrome op Android)', () => {
  const css = ['styles/base.css', 'styles/components/empty.css', 'styles/components/mascot.css']
    .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  assert.doesNotMatch(css, /min-height:\s*100dvh/);
  assert.doesNotMatch(css, /\d+dvh/);
});

test('CSS: trek-om-te-verversen staat uit (overscroll-behavior-y: none op html)', () => {
  const css = readFileSync(join(ROOT, 'styles/base.css'), 'utf8');
  assert.match(css, /html\s*\{[^}]*overscroll-behavior-y:\s*none/);
});

test('zoomen met twee vingers staat uit (bewuste keuze): viewport-meta én touch-action', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)[1];
  assert.match(viewport, /maximum-scale=1/);
  assert.match(viewport, /user-scalable=no/);
  assert.match(readFileSync(join(ROOT, 'styles/base.css'), 'utf8'), /html\s*\{[^}]*touch-action:\s*pan-x pan-y/);
});

test('CSS: tikvlakken zijn minstens 44px en groeien niet mee met grote tekst; de pagina scrolt nooit zijwaarts', () => {
  const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
  assert.match(tokens, /--size-tap:\s*max\(44px,/);
  assert.match(tokens, /--size-check:\s*max\(44px,/);
  assert.match(readFileSync(join(ROOT, 'styles/base.css'), 'utf8'), /html\s*\{[^}]*overflow-x:\s*clip/);
});
