// De vraag "andere tijdzone overnemen?" (src/ui/timezone-watch.js): wanneer hij komt, wat "overnemen" en "zo laten" doen.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
let openDialogs = 0;
// documentElement: saveSettings past ook het thema toe (ui/theme.js)
globalThis.document = { hidden: false, addEventListener() {}, documentElement: { setAttribute() {} }, querySelector: (selector) => (selector === 'dialog[open]' && openDialogs > 0 ? {} : null) };
globalThis.location = { hostname: 'remcovolkers.github.io', href: 'https://remcovolkers.github.io/habit-builder/', hash: '#/today' };

const { offerTimezone } = await import('../../src/ui/timezone-watch.js');
const { state } = await import('../../src/ui/state.js');

const saved = [];
beforeEach(() => {
  store.clear();
  openDialogs = 0;
  saved.length = 0;
  location.hash = '#/today';
  state.settings = { timezone: 'Europe/Amsterdam', dayStartHour: 4 };
  state.repo = { saveSettings: async (patch) => { saved.push(patch); return { ...state.settings, ...patch }; } };
});

/** Een nagebootste dialoog: onthoudt wat er gevraagd werd en laat de test op "Overnemen" tikken of hem sluiten. */
function fakeDialog() {
  const asked = [];
  const ask = (options) => { asked.push(options); };
  return { asked, ask };
}

test('een andere tijdzone op het toestel: de vraag verschijnt met beide plaatsnamen', () => {
  const { asked, ask } = fakeDialog();
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), 'America/New_York');
  assert.equal(asked.length, 1);
  assert.match(asked[0].description, /New York/);
  assert.match(asked[0].description, /Amsterdam/);
  asked[0].onClose(); // een volgende vraag kan pas als deze is gesloten
});

test('dezelfde tijdzone: geen vraag', () => {
  const { asked, ask } = fakeDialog();
  assert.equal(offerTimezone({ device: 'Europe/Amsterdam', ask }), null);
  assert.equal(asked.length, 0);
});

test('"Overnemen" slaat de nieuwe tijdzone op, en de vraag komt niet terug', async () => {
  const { asked, ask } = fakeDialog();
  offerTimezone({ device: 'America/New_York', ask });
  await asked[0].actions[0].onClick();
  asked[0].onClose();
  assert.deepEqual(saved, [{ timezone: 'America/New_York' }]);
  assert.equal(store.has('hb-tz-declined'), false, 'wie overneemt hoeft niets te onthouden');
  state.settings = { ...state.settings, timezone: 'America/New_York' };
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), null);
});

test('"Zo laten" onthoudt die tijdzone: dezelfde vraag komt niet bij elk openen terug, een andere tijdzone wel', () => {
  const { asked, ask } = fakeDialog();
  offerTimezone({ device: 'America/New_York', ask });
  asked[0].onClose(); // gesloten zonder overnemen
  assert.equal(store.get('hb-tz-declined'), 'America/New_York');
  assert.deepEqual(saved, []);
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), null);
  assert.equal(offerTimezone({ device: 'Asia/Tokyo', ask }), 'Asia/Tokyo');
  asked[1].onClose();
});

test('niet midden in iets anders: bij een open venster of in de introductie wacht de vraag', () => {
  const { asked, ask } = fakeDialog();
  openDialogs = 1;
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), null);
  openDialogs = 0;
  location.hash = '#/welkom/2';
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), null);
  assert.equal(asked.length, 0);
  location.hash = '#/today';
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), 'America/New_York');
  asked[0].onClose(); // een volgende vraag kan pas als deze is gesloten
});

test('een tweede vraag terwijl de eerste nog openstaat komt er niet', () => {
  const { asked, ask } = fakeDialog();
  offerTimezone({ device: 'America/New_York', ask });
  assert.equal(offerTimezone({ device: 'America/New_York', ask }), null);
  assert.equal(asked.length, 1);
  asked[0].onClose();
});
