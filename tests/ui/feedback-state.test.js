// Wat de app lokaal onthoudt over feedback: de eerste keer, wanneer we vroegen en wanneer je iets stuurde.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackInviteDue, markFeedbackSent, markFirstRun, snoozeFeedbackInvite } from '../../src/ui/feedback-state.js';

const DAY = 24 * 60 * 60 * 1000;
let store;
beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
});

test('de eerste keer wordt één keer onthouden en niet overschreven', () => {
  markFirstRun(1000 * DAY);
  markFirstRun(2000 * DAY);
  assert.equal(store.get('hb-first-run'), String(1000 * DAY));
});

test('de uitnodiging: niet in de eerste week, daarna wel, na "Niet nu" een tijd niet, en na een bericht lang niet', () => {
  markFirstRun(1000 * DAY);
  assert.equal(feedbackInviteDue(1003 * DAY), false);
  assert.equal(feedbackInviteDue(1007 * DAY), true);
  snoozeFeedbackInvite(1007 * DAY);
  assert.equal(feedbackInviteDue(1020 * DAY), false);
  assert.equal(feedbackInviteDue(1035 * DAY), true);
  markFeedbackSent(1035 * DAY);
  assert.equal(feedbackInviteDue(1100 * DAY), false);
  assert.equal(feedbackInviteDue(1125 * DAY), true);
});

test('zonder bekende eerste keer wordt er niet gevraagd', () => {
  assert.equal(feedbackInviteDue(5000 * DAY), false);
});

test('geblokkeerde opslag: niets gooit een fout en er wordt niet gevraagd (we kunnen niet onthouden dat je nee zei)', () => {
  const blocked = () => { throw new Error('geblokkeerd'); };
  globalThis.localStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };
  assert.doesNotThrow(() => { markFirstRun(); snoozeFeedbackInvite(); markFeedbackSent(); });
  assert.equal(feedbackInviteDue(Date.now() + 1000 * DAY), false);
});
