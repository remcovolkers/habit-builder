// De introductie voor nieuwe gebruikers: wanneer ze vanzelf komt (alleen zonder habits en één keer) en de lokale vlaggen.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_HASH, INTRO_MAX_STEPS, clearFirstTip, firstTipPending, introDue, introSeen, markIntroSeen, setFirstTipPending,
} from '../../src/ui/intro.js';

let store;
beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
});

test('de introductie begint bij stap 1 en heeft hoogstens vier stappen (drie als de app al geïnstalleerd is)', () => {
  assert.equal(INTRO_HASH, '#/welkom/1');
  assert.equal(INTRO_MAX_STEPS, 4);
});

test('een nieuwe gebruiker zonder habits krijgt de introductie, één keer', () => {
  assert.equal(introSeen(), false);
  assert.equal(introDue({ habitCount: 0 }), true);
  markIntroSeen();
  assert.equal(introSeen(), true);
  assert.equal(introDue({ habitCount: 0 }), false, 'overslaan of afronden: ze komt niet vanzelf terug');
});

test('wie al habits heeft krijgt de introductie nooit, ook niet na een update of op een nieuw apparaat', () => {
  assert.equal(introDue({ habitCount: 1 }), false);
  assert.equal(introDue({ habitCount: 12 }), false);
});

test('geblokkeerde opslag: niets gooit een fout, en de introductie komt dan alleen zolang er geen habits zijn', () => {
  const blocked = () => { throw new Error('geblokkeerd'); };
  globalThis.localStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };
  assert.equal(introSeen(), false);
  assert.doesNotThrow(() => markIntroSeen());
  assert.equal(introSeen(), false);
  assert.equal(introDue({ habitCount: 0 }), true);
  assert.equal(introDue({ habitCount: 1 }), false);
  assert.equal(firstTipPending(), false);
  assert.doesNotThrow(() => { setFirstTipPending(); clearFirstTip(); });
});

test('de tip op Vandaag staat klaar na de eerste habit uit de introductie en verdwijnt als je haar sluit', () => {
  assert.equal(firstTipPending(), false);
  setFirstTipPending();
  assert.equal(firstTipPending(), true);
  clearFirstTip();
  assert.equal(firstTipPending(), false);
  assert.equal(store.has('hb-first-tip'), false);
});

test('de vlaggen blijven los van elkaar', () => {
  setFirstTipPending();
  assert.equal(introSeen(), false);
  markIntroSeen();
  clearFirstTip();
  assert.equal(introSeen(), true);
});
