import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowLocalApi, hostnameFromHeader } from '../tools/dev-csp.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const connectOf = (text) => /connect-src ([^;]+);/.exec(text)?.[1] ?? '';

test('de dev-server laat de lokale Supabase toe voor de host waarop je de app opent', () => {
  const dev = allowLocalApi(html, 'localhost');
  assert.ok(connectOf(dev).includes('http://localhost:54321'));
  assert.ok(connectOf(allowLocalApi(html, '192.168.1.20')).includes('http://192.168.1.20:54321'));
});

test('de rest van de CSP en de productie-adressen blijven gelijk', () => {
  const dev = allowLocalApi(html, 'localhost');
  assert.equal(dev.replace(' http://localhost:54321', ''), html);
  assert.ok(connectOf(dev).includes("'self'"));
});

test('het bestand zelf (productie) bevat geen lokaal adres en geen jokertekens', () => {
  assert.ok(!connectOf(html).includes('localhost') && !connectOf(html).includes('127.0.0.1') && !connectOf(html).includes('*'));
});

test('een onbetrouwbare Host-header komt nooit in de CSP', () => {
  for (const bad of ['evil.com; script-src *', 'a b', "x'y", '', undefined, 'a/b']) {
    assert.equal(hostnameFromHeader(bad), null, String(bad));
  }
  assert.equal(allowLocalApi(html, hostnameFromHeader('evil.com; script-src *')), html);
});

test('hostnamen uit de Host-header: naam, IPv4, poort wordt weggelaten', () => {
  assert.equal(hostnameFromHeader('localhost:5173'), 'localhost');
  assert.equal(hostnameFromHeader('192.168.1.20:5173'), '192.168.1.20');
  assert.equal(hostnameFromHeader('laptop.local'), 'laptop.local');
});
