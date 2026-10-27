// De updatecontrole in de app (src/ui/app-update.js): eens per dag, uit de cache bij een tweede keer, en met de geïnstalleerde versie als maat.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.document = { hidden: false, addEventListener() {} };

const { appUpdate, checkAppUpdate } = await import('../../src/ui/app-update.js');

let installed;
beforeEach(() => {
  store.clear();
  installed = '1.2.0-debug';
  appUpdate.available = null;
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App: { getInfo: async () => ({ version: installed }) } } };
});

const release = (tag = 'v1.3.0') => ({
  tag_name: tag, draft: false, prerelease: false,
  html_url: `https://github.com/remcovolkers/habit-builder/releases/tag/${tag}`,
  assets: [{ name: 'habit-builder.apk', browser_download_url: `https://github.com/remcovolkers/habit-builder/releases/download/${tag}/habit-builder.apk` }],
});
const answer = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
const DAY = 24 * 60 * 60 * 1000;

test('een nieuwere release: status "available" en de balk krijgt zijn gegevens', async () => {
  const result = await checkAppUpdate({ fetchImpl: answer(release()), now: 1000 });
  assert.equal(result.status, 'available');
  assert.equal(result.version, '1.3.0');
  assert.equal(appUpdate.available.apkUrl, 'https://github.com/remcovolkers/habit-builder/releases/download/v1.3.0/habit-builder.apk');
});

test('dezelfde versie: "current", niets te melden', async () => {
  const result = await checkAppUpdate({ fetchImpl: answer(release('v1.2.0')), now: 1000 });
  assert.equal(result.status, 'current');
  assert.equal(appUpdate.available, null);
});

test('nog geen release (404): "current", geen fout', async () => {
  const result = await checkAppUpdate({ fetchImpl: answer({ message: 'Not Found' }, 404), now: 1000 });
  assert.equal(result.status, 'current');
  assert.equal(appUpdate.available, null);
});

test('hoogstens één keer per dag: een tweede controle vraagt GitHub niet opnieuw maar onthoudt de uitkomst', async () => {
  let calls = 0;
  const counting = async () => { calls += 1; return new Response(JSON.stringify(release()), { status: 200 }); };
  await checkAppUpdate({ fetchImpl: counting, now: 1000 });
  appUpdate.available = null; // zoals na een herstart van de app
  const again = await checkAppUpdate({ fetchImpl: counting, now: 1000 + DAY - 1 });
  assert.equal(calls, 1);
  assert.equal(again.status, 'skipped');
  assert.equal(appUpdate.available.version, '1.3.0', 'de balk komt uit de onthouden uitkomst');
  await checkAppUpdate({ fetchImpl: counting, now: 1000 + DAY + 1 });
  assert.equal(calls, 2, 'na een dag opnieuw');
});

test('na het bijwerken verdwijnt een onthouden update meteen (de geïnstalleerde versie is nu gelijk)', async () => {
  await checkAppUpdate({ fetchImpl: answer(release()), now: 1000 });
  installed = '1.3.0';
  await checkAppUpdate({ fetchImpl: async () => assert.fail('geen nieuwe vraag'), now: 2000 });
  assert.equal(appUpdate.available, null);
});

test('force slaat de daglimiet over', async () => {
  await checkAppUpdate({ fetchImpl: answer(release('v1.2.0')), now: 1000 });
  const result = await checkAppUpdate({ fetchImpl: answer(release()), now: 2000, force: true });
  assert.equal(result.status, 'available');
});

test('een fout (offline, limiet bereikt) meldt "failed" en laat de dagteller ongemoeid, zodat het later weer lukt', async () => {
  const offline = await checkAppUpdate({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, now: 1000 });
  assert.equal(offline.status, 'failed');
  const limited = await checkAppUpdate({ fetchImpl: answer({}, 403), now: 1001 });
  assert.equal(limited.status, 'failed');
  assert.match(limited.reason, /403/);
  assert.equal(store.has('hb-update-checked'), false);
});

test('buiten de app, of zonder versie van de app: niets doen', async () => {
  globalThis.Capacitor = undefined;
  assert.equal((await checkAppUpdate({ fetchImpl: async () => assert.fail('geen aanvraag') })).status, 'skipped');
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal((await checkAppUpdate({ fetchImpl: async () => assert.fail('geen aanvraag') })).status, 'failed');
});
