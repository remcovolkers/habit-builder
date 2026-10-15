import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildId, listFiles, renderServiceWorker, writeServiceWorker } from '../tools/lib/pwa.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const PUBLISH = ['index.html', 'manifest.webmanifest', 'src', 'styles', 'vendor', 'icons', 'fonts'];

/** Een uit te rollen map in een tijdelijke plek, zoals tools/stage.mjs hem maakt. */
function stageTo(dir) {
  for (const entry of PUBLISH) cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  return writeServiceWorker(dir, join(ROOT, 'sw.js'));
}
const tempDir = () => mkdtempSync(join(tmpdir(), 'hb-pwa-'));

const pngSize = (path) => {
  const bytes = readFileSync(join(ROOT, path));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${path} is geen PNG`);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};

// --- manifest en index.html -------------------------------------------------------------------

test('manifest: installeerbaar (naam, start, scope, weergave, kleuren)', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Habit Builder');
  assert.ok(manifest.short_name.length <= 12);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'nl');
  // relatief, want GitHub Pages draait op een subpad (/habit-builder/)
  for (const key of ['id', 'start_url', 'scope']) assert.equal(manifest[key], './', key);
  for (const key of ['background_color', 'theme_color']) assert.match(manifest[key], /^#[0-9a-f]{6}$/i, key);
});

test('manifest: iconen bestaan en hebben echt de opgegeven afmetingen (192 en 512, ook maskable)', () => {
  const { icons } = JSON.parse(read('manifest.webmanifest'));
  const has = (size, purpose) => icons.some((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
  assert.ok(has(192, 'any') && has(512, 'any') && has(512, 'maskable'));
  for (const icon of icons) {
    assert.ok(existsSync(join(ROOT, icon.src)), `${icon.src} ontbreekt`);
    assert.equal(pngSize(icon.src), icon.sizes, icon.src);
    assert.equal(icon.type, 'image/png');
    assert.ok(!icon.src.startsWith('/'), 'iconpad moet relatief zijn');
  }
});

test('manifest: snelkoppelingen wijzen binnen de app', () => {
  const { shortcuts } = JSON.parse(read('manifest.webmanifest'));
  for (const shortcut of shortcuts) {
    assert.ok(shortcut.url.startsWith('./#/'));
    for (const icon of shortcut.icons) assert.ok(existsSync(join(ROOT, icon.src)));
  }
});

test('index.html: koppelt manifest en iconen, themakleur komt overeen met het manifest', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  const apple = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1];
  assert.ok(apple && existsSync(join(ROOT, apple)));
  assert.equal(pngSize(apple), '180x180');
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="icons\/icon\.svg">/);
  assert.equal(html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1], manifest.theme_color);
  assert.match(html, /apple-mobile-web-app-capable/);
});

// --- bouwen van de service worker --------------------------------------------------------------

test('sjabloon: in ontwikkeling doet de worker niets (lege lijst, build "dev")', () => {
  const source = read('sw.js');
  assert.match(source, /const BUILD = 'dev';/);
  assert.match(source, /const PRECACHE = \[\];/);
});

test('renderServiceWorker: vult build en lijst in, en weigert een sjabloon zonder de vaste regels', () => {
  const out = renderServiceWorker(read('sw.js'), ['index.html', 'src/main.js'], 'abc123abc123');
  assert.match(out, /const BUILD = 'abc123abc123';/);
  assert.match(out, /"\.\/index\.html"/);
  assert.match(out, /"\.\/src\/main\.js"/);
  assert.doesNotMatch(out, /const BUILD = 'dev'/);
  assert.throws(() => renderServiceWorker('// niets', [], 'x'), /mist de regels/);
});

test('de ingevulde worker is geldige JavaScript', () => {
  const dir = tempDir();
  try {
    stageTo(dir);
    assert.doesNotThrow(() => new vm.Script(readFileSync(join(dir, 'sw.js'), 'utf8')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('de cachelijst bevat elke uit te rollen file, maar niet sw.js zelf', () => {
  const dir = tempDir();
  try {
    const { files } = stageTo(dir);
    for (const required of ['index.html', 'manifest.webmanifest', 'src/main.js', 'src/router.js', 'vendor/supabase-js.min.mjs',
      'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg', 'fonts/manrope-wght--regular.ttf', 'styles/tokens.css']) {
      assert.ok(files.includes(required), `${required} staat niet in de cache-lijst`);
    }
    assert.ok(!files.includes('sw.js') && !files.includes('.nojekyll'));
    assert.deepEqual(files, [...files].sort(), 'gesorteerd, dus stabiel');
    assert.equal(new Set(files).size, files.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('alles wat index.html laadt (stijlen, script, manifest, iconen) zit in de cache-lijst — anders werkt offline starten niet', () => {
  const dir = tempDir();
  try {
    const { files } = stageTo(dir);
    const html = read('index.html');
    const referenced = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
    assert.ok(referenced.length >= 10);
    for (const ref of referenced) assert.ok(files.includes(ref), `${ref} (uit index.html) ontbreekt in de cache-lijst`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fonts en modules die vanuit CSS/JS worden geladen zitten ook in de lijst', () => {
  const dir = tempDir();
  try {
    const { files } = stageTo(dir);
    const css = read('styles/fonts.css');
    for (const match of css.matchAll(/url\("\.\.\/([^"]+)"\)/g)) assert.ok(files.includes(match[1]), `${match[1]} ontbreekt`);
    // dynamische import van de SDK in data/auth.js
    assert.match(read('src/data/auth.js'), /\.\.\/\.\.\/vendor\/supabase-js\.min\.mjs/);
    assert.ok(files.includes('vendor/supabase-js.min.mjs'));
    // elke relatieve import in src/ verwijst naar een bestand dat in de lijst staat
    for (const file of files.filter((f) => f.startsWith('src/') && f.endsWith('.js'))) {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const m of source.matchAll(/(?:from|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = join(file, '..', m[1]).split('\\').join('/');
        assert.ok(files.includes(target), `${file} importeert ${m[1]} dat niet in de cache-lijst staat`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('versie-id: stabiel bij dezelfde inhoud, anders zodra één byte verandert (ook in een CSS-bestand of font)', () => {
  const dir = tempDir();
  try {
    const first = stageTo(dir);
    const again = writeServiceWorker(dir, join(ROOT, 'sw.js'));
    assert.equal(first.id, again.id);
    assert.match(first.id, /^[0-9a-f]{12}$/);

    writeFileSync(join(dir, 'styles', 'base.css'), `${readFileSync(join(dir, 'styles', 'base.css'), 'utf8')}\n/* x */`);
    assert.notEqual(writeServiceWorker(dir, join(ROOT, 'sw.js')).id, first.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildId hangt ook af van de bestandsnaam, niet alleen van de inhoud', () => {
  const dir = tempDir();
  try {
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a', 'x.txt'), 'zelfde');
    writeFileSync(join(dir, 'y.txt'), 'zelfde');
    assert.notEqual(buildId(dir, ['a/x.txt']), buildId(dir, ['y.txt']));
    assert.deepEqual(listFiles(dir), ['a/x.txt', 'y.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- het gedrag van de worker, in een nagebootste omgeving ----------------------------------------------

function loadWorker({ build = 'v1', precache = ['./index.html', './src/main.js'], existingCaches = {}, network = {} } = {}) {
  const source = read('sw.js')
    .replace("const BUILD = 'dev';", `const BUILD = '${build}';`)
    .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(precache)};`);

  const stores = new Map(Object.entries(existingCaches).map(([name, files]) => [name, new Map(Object.entries(files))]));
  const key = (request) => (typeof request === 'string' ? new URL(request, 'https://app.test/habit-builder/sw.js').href : request.url);
  const makeCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      match: async (request) => map.get(key(request))?.clone(),
      addAll: async (requests) => {
        for (const request of requests) {
          const url = key(request);
          if (network.fail?.includes(url)) throw new TypeError('netwerkfout');
          map.set(url, new Response(`inhoud van ${url}`));
        }
      },
    };
  };
  const fetched = [];
  const listeners = {};
  const self = {
    location: new URL('https://app.test/habit-builder/sw.js'),
    clients: { claimed: false, claim: async () => { self.clients.claimed = true; } },
    skipWaiting: () => { self.skipped = true; },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  // in een echte service worker worden relatieve adressen opgelost vanaf het adres van de worker zelf
  const base = 'https://app.test/habit-builder/sw.js';
  class WorkerRequest extends Request {
    constructor(input, init) {
      super(typeof input === 'string' ? new URL(input, base).href : input, init);
    }
  }
  const context = {
    self, URL, Request: WorkerRequest, Response, TypeError,
    caches: {
      open: async (name) => makeCache(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (request) => {
      fetched.push(request.url ?? request);
      if (network.offline) throw new TypeError('offline');
      return new Response(`netwerk: ${request.url ?? request}`);
    },
  };
  vm.runInNewContext(source, context);

  const waitFor = async (event) => {
    const pending = [];
    event.waitUntil = (promise) => pending.push(promise);
    await listeners[event.type]?.(event);
    await Promise.all(pending);
  };
  const dispatchFetch = async (request) => {
    let response;
    const event = { request, respondWith: (value) => { response = value; } };
    listeners.fetch(event);
    return response === undefined ? undefined : response;
  };
  return { stores, fetched, self, install: () => waitFor({ type: 'install' }), activate: () => waitFor({ type: 'activate' }), message: (data) => listeners.message({ data }), fetch: dispatchFetch };
}

const req = (url, init = {}) => {
  const request = new Request(url, init);
  return init.mode === 'navigate' ? Object.defineProperty(request, 'mode', { value: 'navigate' }) : request;
};
const nav = (url) => Object.defineProperty(new Request(url), 'mode', { value: 'navigate' });

test('worker: installeren zet alle bestanden van deze versie in één cache', async () => {
  const w = loadWorker({ build: 'abc' });
  await w.install();
  assert.deepEqual([...w.stores.keys()], ['hb-shell-abc']);
  assert.equal(w.stores.get('hb-shell-abc').size, 2);
});

test('worker: faalt één bestand, dan faalt de hele installatie (en blijft de oude versie ongemoeid)', async () => {
  const w = loadWorker({ build: 'nieuw', existingCaches: { 'hb-shell-oud': { 'https://app.test/habit-builder/index.html': new Response('oud') } }, network: { fail: ['https://app.test/habit-builder/src/main.js'] } });
  await assert.rejects(() => w.install(), /netwerkfout/);
  assert.ok(w.stores.has('hb-shell-oud'));
});

test('worker: activeren ruimt alleen oude app-caches op en neemt de pagina over', async () => {
  const w = loadWorker({ build: 'nieuw', existingCaches: { 'hb-shell-oud': {}, 'hb-shell-ouder': {}, 'hb-shell-nieuw': {}, 'iets-anders': {} } });
  await w.activate();
  assert.deepEqual([...w.stores.keys()].sort(), ['hb-shell-nieuw', 'iets-anders']);
  assert.equal(w.self.clients.claimed, true);
});

test('worker: wacht tot de gebruiker vernieuwt (SKIP_WAITING), niet eerder', async () => {
  const w = loadWorker();
  await w.install();
  assert.equal(w.self.skipped, undefined);
  w.message({ type: 'iets-anders' });
  assert.equal(w.self.skipped, undefined);
  w.message({ type: 'SKIP_WAITING' });
  assert.equal(w.self.skipped, true);
});

test('worker: navigatie geeft de app-shell uit de cache, ook offline en met een querystring (Google-terugkeer)', async () => {
  const w = loadWorker({ network: { offline: true } });
  await w.install();
  for (const url of ['https://app.test/habit-builder/', 'https://app.test/habit-builder/?code=abc123', 'https://app.test/habit-builder/index.html?x=1']) {
    const response = await w.fetch(nav(url));
    assert.match(await response.text(), /index\.html/, url);
  }
  assert.deepEqual(w.fetched, []); // niets via het netwerk
});

test('worker: bestanden komen uit de cache; wat niet in de lijst staat gaat naar het netwerk; offline is dat een fout', async () => {
  const w = loadWorker();
  await w.install();
  assert.match(await (await w.fetch(req('https://app.test/habit-builder/src/main.js'))).text(), /inhoud van/);
  assert.match(await (await w.fetch(req('https://app.test/habit-builder/onbekend.png'))).text(), /netwerk:/);

  const offline = loadWorker({ network: { offline: true } });
  await offline.install();
  const failed = await offline.fetch(req('https://app.test/habit-builder/onbekend.png'));
  assert.equal(failed.type, 'error');
});

test('worker: Supabase en andere sites en alles behalve GET laat hij met rust', async () => {
  const w = loadWorker();
  await w.install();
  assert.equal(await w.fetch(req('https://rbsqafttotdaakpwtjmh.supabase.co/rest/v1/records')), undefined);
  assert.equal(await w.fetch(req('https://app.test/habit-builder/src/main.js', { method: 'POST', body: 'x' })), undefined);
});

test('worker: in ontwikkeling (lege lijst) doet hij niets: geen cache, geen onderschepping', async () => {
  const w = loadWorker({ precache: [] });
  await w.install();
  assert.equal(w.stores.size, 0);
  assert.equal(await w.fetch(nav('https://app.test/habit-builder/')), undefined);
});

test('de echte sw.js uit de repo is geldige JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(read('sw.js')));
});
