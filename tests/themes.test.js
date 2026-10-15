import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THEME, isTheme, mascotFor, THEME_IDS, THEMES, themeFor } from '../src/app/themes.js';
import { defaultSettings, validateSettings } from '../src/app/settings.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});

const cssOf = (id) => read(`styles/themes/${id}.css`);
/** alle custom properties die een bestand definieert ("--naam:") */
const definedIn = (css) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));

// --- het register ---------------------------------------------------------------------------

test('thema\'s: het register is volledig en het standaardthema bestaat', () => {
  assert.deepEqual(THEME_IDS, ['v0lky1', 'mel']);
  assert.equal(DEFAULT_THEME, 'v0lky1');
  assert.equal(THEMES.v0lky1.name, 'v0lky1 Theme');
  assert.equal(THEMES.mel.name, 'Mel Theme');
  for (const theme of Object.values(THEMES)) {
    assert.match(theme.themeColor, /^#[0-9a-f]{6}$/i);
    assert.equal(theme.swatches.length, 3);
    assert.ok(theme.description.length > 0);
  }
});

test('themeFor en isTheme: onbekend of leeg geeft het standaardthema', () => {
  assert.equal(isTheme('mel'), true);
  assert.equal(isTheme('nope'), false);
  assert.equal(isTheme(undefined), false);
  assert.equal(isTheme('toString'), false); // geen prototype-ketting
  assert.equal(themeFor('mel').id, 'mel');
  assert.equal(themeFor('nope').id, 'v0lky1');
  assert.equal(themeFor(undefined).id, 'v0lky1');
});

test('mascotFor: Mel heeft illustraties op elke plek, v0lky1 heeft er geen (dan blijft het standaardicoon)', () => {
  for (const slot of ['brand', 'celebrate', 'achievement', 'empty', 'login', 'phase.starting', 'phase.building', 'phase.established']) {
    assert.ok(mascotFor('mel', slot), `mel mist ${slot}`);
    assert.equal(mascotFor('v0lky1', slot), null);
  }
  assert.equal(mascotFor('mel', 'bestaat-niet'), null);
});

test('instellingen: thema wordt bewaard en gevalideerd; standaard is v0lky1', () => {
  assert.equal(defaultSettings('Europe/Amsterdam').theme, 'v0lky1');
  const base = { timezone: 'Europe/Amsterdam', dayStartHour: 4 };
  assert.deepEqual(validateSettings({ ...base, theme: 'mel' }), []);
  assert.deepEqual(validateSettings({ ...base }), []); // oudere instellingen zonder thema
  assert.deepEqual(validateSettings({ ...base, theme: 'pink' }), [{ field: 'theme', code: 'invalid' }]);
});

// --- de opstartcode en de CSS blijven gelijk met het register -------------------------------------

test('theme-boot.js kent precies dezelfde thema\'s als het register', () => {
  const ids = read('src/theme-boot.js').match(/var ids = \[([^\]]*)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(ids, THEME_IDS);
});

test('elk thema heeft een CSS-bestand dat zich op data-theme richt; v0lky1 geldt ook zonder kenmerk', () => {
  assert.match(cssOf('v0lky1'), /:root,\s*:root\[data-theme='v0lky1'\]/);
  assert.match(cssOf('mel'), /:root\[data-theme='mel'\]/);
  const html = read('index.html');
  for (const id of THEME_IDS) assert.ok(html.includes(`styles/themes/${id}.css`), `${id}.css wordt niet geladen`);
});

test('tokenpariteit: beide thema\'s definiëren exact dezelfde variabelen (geen vergeten token bij een nieuw thema)', () => {
  const a = definedIn(cssOf('v0lky1'));
  const b = definedIn(cssOf('mel'));
  assert.ok(a.size > 40);
  assert.deepEqual([...a].filter((x) => !b.has(x)), [], 'staat in v0lky1 maar niet in mel');
  assert.deepEqual([...b].filter((x) => !a.has(x)), [], 'staat in mel maar niet in v0lky1');
});

test('structurele tokens staan niet in een thema en themakleuren niet in tokens.css', () => {
  const tokens = definedIn(read('styles/tokens.css'));
  const themeVars = definedIn(cssOf('v0lky1'));
  assert.deepEqual([...tokens].filter((x) => themeVars.has(x)), []);
  assert.ok(![...tokens].some((x) => /^--(color|habit|accent|shadow-glow|ring)/.test(x)), 'kleuren horen in een thema');
});

test('elke var(--x) in de CSS verwijst naar een bestaande variabele (thema, tokens, lokaal of door JS gezet)', () => {
  const cssFiles = walk('styles').filter((f) => f.endsWith('.css'));
  const declared = new Set();
  for (const file of cssFiles) for (const name of definedIn(read(file))) declared.add(name);
  for (const file of walk('src').filter((f) => f.endsWith('.js'))) {
    for (const m of read(file).matchAll(/setProperty\(\s*[`'"](--[a-z0-9-]+)|setProperty\(\s*`(--[a-z0-9-]+)\$\{/gi)) declared.add(m[1] ?? m[2]);
    for (const m of read(file).matchAll(/`--(s)\$\{/g)) declared.add(`--${m[1]}1`).add(`--${m[1]}2`).add(`--${m[1]}3`);
  }
  const used = new Map();
  for (const file of cssFiles) {
    for (const m of read(file).matchAll(/var\((--[a-z0-9-]+)/gi)) used.set(m[1], file);
  }
  const missing = [...used].filter(([name]) => !declared.has(name)).map(([name, file]) => `${name} (${file})`);
  assert.deepEqual(missing, []);
});

test('geen vaste themakleuren meer in componenten (alles loopt via variabelen)', () => {
  const offenders = [];
  for (const file of [...walk('styles/components'), ...walk('styles/views'), 'styles/base.css']) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const line of css.split('\n')) {
      if (/(41,\s*255,\s*185|143,\s*255,\s*220|#29ffb9|#8fffdc|#ffcb05|rgba\(255,\s*107,\s*107|rgba\(255,\s*181,\s*71)/i.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// --- illustraties ----------------------------------------------------------------------------

test('alle illustraties van een thema bestaan, hebben een viewBox en bevatten geen scripts of externe verwijzingen', () => {
  const paths = new Set(Object.values(THEMES).flatMap((t) => Object.values(t.mascots)));
  assert.ok(paths.size >= 6);
  for (const path of paths) {
    assert.ok(existsSync(join(ROOT, path)), `${path} ontbreekt`);
    const svg = read(path);
    assert.match(svg, /<svg[^>]*viewBox="/, `${path} heeft geen viewBox`);
    assert.doesNotMatch(svg, /<script|\son[a-z]+\s*=|javascript:|<foreignObject|href="https?:|@import/i, `${path} bevat iets onveiligs`);
  }
});

test('de themamap wordt meegepubliceerd (anders ontbreken de illustraties op de site)', () => {
  for (const file of ['tools/stage.mjs', 'tools/serve.mjs']) assert.match(read(file), /'themes'/, file);
});

// --- toegankelijkheid: contrast in elk thema ----------------------------------------------------------

const luminance = ([r, g, b]) => {
  const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const hex = (css, name) => {
  const m = css.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'));
  assert.ok(m, `${name} is geen hexkleur in dit thema`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};

for (const id of THEME_IDS) {
  test(`contrast (${id}): tekst, accent, status en knoppen halen WCAG AA op de vlakken waarop ze staan`, () => {
    const css = cssOf(id);
    const c = (name) => hex(css, name);
    const backgrounds = { 'rand van de achtergrond': c('--color-bg-3'), kaart: c('--color-surface-solid'), 'verhoogd vlak': c('--color-elevated') };
    const failures = [];
    const need = (label, fg, bg, min) => { const ratio = contrast(fg, bg); if (ratio < min) failures.push(`${label}: ${ratio.toFixed(2)} < ${min}`); };

    for (const [name, bg] of Object.entries(backgrounds)) {
      need(`tekst op ${name}`, c('--color-text'), bg, 7);
      need(`gedempte tekst op ${name}`, c('--color-text-muted'), bg, 4.5);
      need(`accent op ${name}`, c('--color-accent'), bg, 4.5);
      need(`accent-tint op ${name}`, c('--color-accent-tint'), bg, 4.5);
      need(`gevaar op ${name}`, c('--color-danger'), bg, 4.5);
      need(`waarschuwing op ${name}`, c('--color-warning'), bg, 4.5);
      need(`vage tekst (alleen hulp/plaatshouder) op ${name}`, c('--color-text-faint'), bg, 3);
    }
    need('tekst op de accentknop', c('--color-on-accent'), c('--color-accent'), 7);
    assert.deepEqual(failures, []);
  });
}

// --- de opstartcode (draait vóór de eerste weergave) ------------------------------------------------------

import vm from 'node:vm';

function runBoot({ search = '', stored = null, storageThrows = false } = {}) {
  const attributes = {};
  const context = {
    URLSearchParams,
    location: { search },
    localStorage: { getItem: () => { if (storageThrows) throw new Error('geblokkeerd'); return stored; } },
    document: { documentElement: { setAttribute: (name, value) => { attributes[name] = value; } } },
  };
  vm.runInNewContext(read('src/theme-boot.js'), context);
  return attributes['data-theme'];
}

test('theme-boot: een bewaard thema wordt direct gezet', () => {
  assert.equal(runBoot({ stored: 'mel' }), 'mel');
  assert.equal(runBoot({ stored: 'v0lky1' }), 'v0lky1');
});

test('theme-boot: ?theme= in een gedeelde link wint van wat bewaard is', () => {
  assert.equal(runBoot({ search: '?theme=mel', stored: 'v0lky1' }), 'mel');
  assert.equal(runBoot({ search: '?x=1&theme=mel' }), 'mel');
});

test('theme-boot: onbekende waarden, geen waarde en geblokkeerde opslag laten het standaardthema staan (en gooien niet)', () => {
  assert.equal(runBoot({ stored: 'roze' }), undefined);
  assert.equal(runBoot({ search: '?theme=roze' }), undefined);
  assert.equal(runBoot({}), undefined);
  assert.equal(runBoot({ storageThrows: true }), undefined);
  assert.equal(runBoot({ search: '?theme=constructor' }), undefined);
});

// --- geldige kleurnotatie -------------------------------------------------------------------------------------

test('kleurtriplets (--x-rgb) zijn met spaties gescheiden: met komma\'s is rgb(… / 0.5) ongeldig en valt de regel stil weg', () => {
  for (const id of THEME_IDS) {
    const triplets = [...cssOf(id).matchAll(/(--[a-z-]+-rgb):\s*([^;]+);/g)];
    assert.ok(triplets.length >= 6, `${id}: te weinig rgb-tokens`);
    for (const [, name, value] of triplets) assert.match(value.trim(), /^\d{1,3} \d{1,3} \d{1,3}$/, `${id} ${name}: "${value.trim()}"`);
  }
});

test('elke rgb(var(--x-rgb) / alpha) in de CSS gebruikt een bestaand rgb-token', () => {
  const triplets = definedIn(cssOf('v0lky1'));
  const used = new Set();
  for (const file of walk('styles').filter((f) => f.endsWith('.css'))) {
    for (const m of read(file).matchAll(/rgb\(var\((--[a-z-]+)\)\s*\/\s*[0-9.]+\)/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 6);
  for (const name of used) assert.ok(triplets.has(name), `${name} is niet gedefinieerd`);
});
