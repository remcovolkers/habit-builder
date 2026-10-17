// De introductie voor nieuwe gebruikers: wanneer ze vanzelf komt (alleen zonder habits en één keer) en de lokale vlaggen.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_HASH, INTRO_MAX_STEPS, RETURN_TTL_MS, afterLoginHash, clearFirstTip, firstTipPending, introDue, introSeen, markIntroSeen, peekReturn, rememberReturn, setFirstTipPending, showLoginHint, takeReturn,
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

test('"Heb je al een account? Log in" staat alleen voor wie niet is ingelogd (ook niet terwijl een bewaarde inlog wordt hersteld)', () => {
  assert.equal(showLoginHint('anonymous'), true);
  assert.equal(showLoginHint('signed-in'), false);
  assert.equal(showLoginHint('restoring'), false);
});

test('terug naar de introductie na het inloggen: de bestemming wordt één keer gegeven en vervalt na tien minuten', () => {
  const t0 = 1_000_000;
  assert.equal(peekReturn(t0), false);
  assert.equal(takeReturn(t0), null);
  rememberReturn(INTRO_HASH, t0);
  assert.equal(peekReturn(t0 + 1000), true);
  assert.equal(takeReturn(t0 + 1000), INTRO_HASH);
  assert.equal(takeReturn(t0 + 1000), null, 'één keer');
  rememberReturn(INTRO_HASH, t0);
  assert.equal(peekReturn(t0 + RETURN_TTL_MS + 1), false);
  assert.equal(takeReturn(t0 + RETURN_TTL_MS + 1), null, 'verlopen');
});

test('de onthouden bestemming vervalt als je de introductie overslaat of afrondt, en onzin wordt genegeerd', () => {
  rememberReturn(INTRO_HASH);
  markIntroSeen();
  assert.equal(takeReturn(), null);
  store.set('hb-after-login', 'geen json');
  assert.equal(takeReturn(), null);
  store.set('hb-after-login', JSON.stringify({ hash: 'https://elders.example', at: Date.now() }));
  assert.equal(takeReturn(), null, 'alleen een route in de app');
});

test('na het inloggen terug naar de introductie, behalve met een bestaand account vol habits (dan naar Vandaag en is de introductie gezien)', () => {
  assert.equal(afterLoginHash({ back: INTRO_HASH, habitCount: 0 }), INTRO_HASH);
  assert.equal(introSeen(), false);
  assert.equal(afterLoginHash({ back: INTRO_HASH, habitCount: 3 }), '#/today');
  assert.equal(introSeen(), true);
  assert.equal(afterLoginHash({ back: '#/habits', habitCount: 3 }), '#/habits');
});
