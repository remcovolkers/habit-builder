// De lokale cache van vrienden en ranglijst: hoort bij één gebruiker, overleeft kapotte of geblokkeerde opslag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialCache } from '../../src/data/social-cache.js';

const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

test('bewaart en leest de gegevens van deze gebruiker', () => {
  const cache = createSocialCache(memory());
  cache.write('u1', { me: { username: 'remco' }, lists: { friends: [1] }, fetchedAt: 5 });
  assert.deepEqual(cache.read('u1'), { me: { username: 'remco' }, lists: { friends: [1] }, fetchedAt: 5, userId: 'u1' });
});

test('een ander account ziet de cache van deze gebruiker nooit', () => {
  const cache = createSocialCache(memory());
  cache.write('u1', { me: { username: 'remco' } });
  assert.equal(cache.read('u2'), null);
  assert.equal(cache.read(null), null);
  assert.notEqual(cache.read('u1'), null, 'de eigen gegevens zijn er nog');
});

test('kapotte of lege opslag geeft null in plaats van een fout', () => {
  const store = memory();
  const cache = createSocialCache(store);
  assert.equal(cache.read('u1'), null);
  store.map.set('hb-social', 'dit is geen json');
  assert.equal(cache.read('u1'), null);
  store.map.set('hb-social', '"een tekst"');
  assert.equal(cache.read('u1'), null);
  store.map.set('hb-social', 'null');
  assert.equal(cache.read('u1'), null);
});

test('geblokkeerde opslag (privémodus, vol) laat niets crashen', () => {
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('SecurityError'); } };
  const cache = createSocialCache(blocked);
  assert.doesNotThrow(() => { cache.write('u1', { a: 1 }); cache.clear(); cache.rememberInvite('abc'); cache.forgetInvite(); });
  assert.equal(cache.read('u1'), null);
  assert.equal(cache.readInvite(), null);
  const none = createSocialCache(null);
  assert.doesNotThrow(() => { none.write('u1', {}); none.clear(); });
  assert.equal(none.read('u1'), null);
});

test('wissen haalt de cache én een onthouden uitnodiging weg', () => {
  const store = memory();
  const cache = createSocialCache(store);
  cache.write('u1', { me: {} });
  cache.rememberInvite('c'.repeat(64));
  cache.clear();
  assert.equal(cache.read('u1'), null);
  assert.equal(cache.readInvite(), null);
  assert.equal(store.map.size, 0, 'er blijft niets van dit account achter');
});

test('een uitnodigingscode onthouden en weer vergeten', () => {
  const cache = createSocialCache(memory());
  assert.equal(cache.readInvite(), null);
  cache.rememberInvite('c'.repeat(64));
  assert.equal(cache.readInvite(), 'c'.repeat(64));
  cache.forgetInvite();
  assert.equal(cache.readInvite(), null);
});
