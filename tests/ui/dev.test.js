// Ontwikkelaarsopties: zeven tikken (binnen vier seconden) zetten ze aan of uit, de keuze wordt bewaard.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTapCounter, isDev, onDevChanged, setDev, TAPS_TO_ENABLE } from '../../src/ui/dev.js';

let store;
beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
});

test('standaard staan de ontwikkelaarsopties uit', () => {
  assert.equal(isDev(), false);
});

test('setDev bewaart de keuze, meldt een wijziging en zet hem ook weer uit', () => {
  let changes = 0;
  const stop = onDevChanged(() => { changes++; });
  setDev(true);
  assert.equal(isDev(), true);
  assert.equal(store.get('hb-dev'), '1');
  setDev(false);
  assert.equal(isDev(), false);
  assert.equal(store.has('hb-dev'), false);
  assert.equal(changes, 2);
  stop();
  setDev(true);
  assert.equal(changes, 2, 'na stoppen met luisteren komen er geen meldingen meer');
});

test('geblokkeerde opslag: niets gooit een fout en het blijft uit', () => {
  globalThis.localStorage = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('geblokkeerd'); }, removeItem: () => { throw new Error('geblokkeerd'); } };
  assert.equal(isDev(), false);
  assert.doesNotThrow(() => setDev(true));
  assert.equal(isDev(), false);
});

test('zeven tikken kort na elkaar zetten het aan; een tweede reeks zet het weer uit', () => {
  let t = 1000;
  const tap = createTapCounter({ now: () => t });
  const results = [];
  for (let i = 0; i < TAPS_TO_ENABLE; i++) { results.push(tap()); t += 300; }
  assert.equal(results.at(-1).toggled, true);
  assert.equal(isDev(), true);
  for (let i = 0; i < TAPS_TO_ENABLE; i++) { tap(); t += 300; }
  assert.equal(isDev(), false);
});

test('de teller telt af vanaf de derde tik (zoals Android), de eerste twee zeggen niets', () => {
  let t = 1000;
  const tap = createTapCounter({ now: () => t });
  const lefts = [];
  for (let i = 0; i < 6; i++) { lefts.push(tap().left); t += 200; }
  assert.deepEqual(lefts, [null, null, 4, 3, 2, 1]);
});

test('tikken met te veel tijd ertussen tellen niet door: opnieuw beginnen', () => {
  let t = 1000;
  const tap = createTapCounter({ now: () => t });
  for (let i = 0; i < 5; i++) { tap(); t += 300; }
  t += 5000; // pauze
  for (let i = 0; i < 5; i++) { tap(); t += 300; }
  assert.equal(isDev(), false, 'tien tikken met een pauze ertussen zijn geen zeven achter elkaar');
});
