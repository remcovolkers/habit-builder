import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { config, pickEnvironment, PRODUCTION_HOST } from '../src/config.js';

const envs = {
  production: { supabaseUrl: 'https://prod.supabase.co', supabasePublishableKey: 'prod-key', vapidPublicKey: 'vapid' },
  development: { supabaseUrl: 'https://dev.supabase.co', supabasePublishableKey: 'dev-key', vapidPublicKey: '' },
};
const emptyDev = { ...envs, development: { supabaseUrl: '', supabasePublishableKey: '', vapidPublicKey: '' } };

test('de productie-site gebruikt altijd het productieproject', () => {
  const picked = pickEnvironment(PRODUCTION_HOST, envs);
  assert.equal(picked.environment, 'production');
  assert.equal(picked.supabaseUrl, 'https://prod.supabase.co');
  assert.equal(picked.vapidPublicKey, 'vapid');
});

test('zonder pagina (tests, server) is het productie, zodat niets per ongeluk naar een testproject gaat', () => {
  assert.equal(pickEnvironment(undefined, envs).environment, 'production');
  assert.equal(pickEnvironment('', envs).environment, 'production');
});

test('elke andere host (localhost, het IP-adres van je computer) gebruikt het ontwikkelproject', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.20', 'laptop.local']) {
    const picked = pickEnvironment(host, envs);
    assert.equal(picked.environment, 'development', host);
    assert.equal(picked.supabaseUrl, 'https://dev.supabase.co');
    assert.equal(picked.supabasePublishableKey, 'dev-key');
    assert.equal(picked.vapidPublicKey, '', 'de herinnering bestaat niet in het ontwikkelproject');
  }
});

test('een host die er alleen op lijkt, krijgt géén productie', () => {
  assert.equal(pickEnvironment(`${PRODUCTION_HOST}.evil.example`, envs).environment, 'development');
  assert.equal(pickEnvironment(`x${PRODUCTION_HOST}`, envs).environment, 'development');
});

test('is het ontwikkelproject niet ingevuld, dan blijft alles zoals het was (productie)', () => {
  assert.equal(pickEnvironment('localhost', emptyDev).environment, 'production');
  assert.equal(pickEnvironment('localhost', { ...envs, development: { ...envs.development, supabasePublishableKey: '' } }).environment, 'production');
});

test('de echte configuratie wijst naar het productieproject en bevat nooit een service-sleutel', () => {
  assert.equal(config.environment, 'production'); // in de tests is er geen pagina
  assert.match(config.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(config.supabasePublishableKey, /^sb_publishable_/);
});

test('de CSP in index.html staat verbindingen toe naar beide projecten (en naar niets breders)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const connect = /connect-src ([^;]+);/.exec(html)?.[1] ?? '';
  const source = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const urls = [...source.matchAll(/supabaseUrl: '(https:\/\/[a-z0-9]+\.supabase\.co)'/g)].map((m) => m[1]);
  assert.ok(urls.length >= 1);
  for (const url of urls) {
    assert.ok(connect.includes(url), `connect-src mist ${url}`);
    assert.ok(connect.includes(url.replace('https://', 'wss://')), `connect-src mist wss voor ${url}`);
  }
  assert.ok(!connect.includes('*'), 'connect-src mag geen jokertekens bevatten');
});
