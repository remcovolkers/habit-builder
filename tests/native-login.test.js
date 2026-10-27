// Inloggen met Google in de Android-app (src/data/auth.js en src/ui/native-login.js): het adres waarmee Android de app opent, het starten van de
// inlog in de systeembrowser (met de echte Supabase-SDK, die zonder netwerk de inlog-url maakt) en het inwisselen van de code.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.location = { hostname: 'remcovolkers.github.io', origin: 'https://remcovolkers.github.io', pathname: '/habit-builder/', href: 'https://remcovolkers.github.io/habit-builder/', hash: '#/login', search: '' };

const auth = await import('../src/data/auth.js');
const { handleAuthUrl } = await import('../src/ui/native-login.js');

beforeEach(() => {
  store.clear();
  globalThis.Capacitor = undefined;
  location.hash = '#/login';
});

test('parseNativeAuthUrl: de code uit de query, of uit het #-deel', () => {
  assert.deepEqual(auth.parseNativeAuthUrl('habitbuilder://auth?code=abc-123'), { code: 'abc-123' });
  assert.deepEqual(auth.parseNativeAuthUrl('habitbuilder://auth#code=xyz'), { code: 'xyz' });
  assert.deepEqual(auth.parseNativeAuthUrl('habitbuilder://auth/?code=abc'), { code: 'abc' });
});

test('parseNativeAuthUrl: een fout van Google of Supabase (bijvoorbeeld annuleren) wordt een fout, geen code', () => {
  assert.deepEqual(auth.parseNativeAuthUrl('habitbuilder://auth?error=access_denied&error_description=User+cancelled'), { error: 'User cancelled' });
  assert.deepEqual(auth.parseNativeAuthUrl('habitbuilder://auth#error=access_denied'), { error: 'access_denied' });
  assert.deepEqual(auth.parseNativeAuthUrl('habitbuilder://auth'), { error: 'onbekend' });
});

test('parseNativeAuthUrl: alles wat geen inlogadres is, wordt genegeerd', () => {
  for (const url of ['https://remcovolkers.github.io/habit-builder/?code=abc', 'habitbuilder://ander?code=abc', 'andereapp://auth?code=abc', 'onzin', '', undefined, null]) {
    assert.equal(auth.parseNativeAuthUrl(url), null, String(url));
  }
});

test('in de app opent Google-inloggen de systeembrowser met de inlog-url en het eigen terugkeeradres', async () => {
  const opened = [];
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Browser: { open: async (options) => { opened.push(options); } } } };
  await auth.signInWithGoogle();
  assert.equal(opened.length, 1);
  const url = new URL(opened[0].url);
  assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('redirect_to'), 'habitbuilder://auth');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.ok(url.searchParams.get('code_challenge'), 'PKCE: de verifier blijft bij ons, alleen de uitdaging gaat mee');
});

test('in de app zonder browser-plugin: een duidelijke fout in plaats van een stille mislukking', async () => {
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  await assert.rejects(() => auth.signInWithGoogle(), /browser-plugin/);
});

test('handleAuthUrl: een code wordt ingewisseld, daarna wordt het inlogscherm verlaten', async () => {
  const calls = [];
  const handled = await handleAuthUrl('habitbuilder://auth?code=code-1', {
    complete: async (code) => { calls.push(['complete', code]); },
    login: async () => { calls.push(['login']); },
    say: (message) => calls.push(['say', message]),
  });
  assert.equal(handled, true);
  assert.deepEqual(calls, [['complete', 'code-1'], ['login']]);
  assert.equal(location.hash, '#/today');
});

test('handleAuthUrl: dezelfde code een tweede keer (Android biedt het adres soms twee keer aan) wordt niet nog eens ingewisseld', async () => {
  let completes = 0;
  const deps = { complete: async () => { completes += 1; }, login: async () => {}, say: () => {} };
  await handleAuthUrl('habitbuilder://auth?code=code-dubbel', deps);
  await handleAuthUrl('habitbuilder://auth?code=code-dubbel', deps);
  assert.equal(completes, 1);
});

test('handleAuthUrl: een mislukte inwisseling geeft een melding en laat de pagina staan', async () => {
  const said = [];
  const handled = await handleAuthUrl('habitbuilder://auth?code=code-stuk', {
    complete: async () => { throw Object.assign(new Error('invalid flow state, no valid flow state found'), { status: 400 }); },
    login: async () => assert.fail('niet inloggen na een fout'),
    say: (message) => said.push(message),
  });
  assert.equal(handled, true);
  assert.equal(said.length, 1);
  assert.equal(location.hash, '#/login');
});

test('handleAuthUrl: Google meldt een fout of annuleren: melding, niets inwisselen', async () => {
  const said = [];
  await handleAuthUrl('habitbuilder://auth?error=access_denied', {
    complete: async () => assert.fail('er is geen code'),
    login: async () => assert.fail('er is geen code'),
    say: (message) => said.push(message),
  });
  assert.match(said[0], /Google/);
});

test('handleAuthUrl: een adres dat geen inlogadres is, wordt niet geclaimd', async () => {
  assert.equal(await handleAuthUrl('https://remcovolkers.github.io/habit-builder/#/today', { complete: async () => assert.fail('nee') }), false);
});

test('handleAuthUrl: staat het inlogscherm niet open, dan verandert de pagina niet', async () => {
  location.hash = '#/stats';
  await handleAuthUrl('habitbuilder://auth?code=code-elders', { complete: async () => {}, login: async () => {}, say: () => {} });
  assert.equal(location.hash, '#/stats');
});
