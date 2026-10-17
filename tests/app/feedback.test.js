// Feedback: wat verstuurd mag worden, de context die meegaat en wanneer we er een keer om vragen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVITE_AFTER_DAYS, INVITE_AFTER_SENT_DAYS, INVITE_SNOOZE_DAYS, countByStatus, filterFeedback, inviteDue, routeForFeedback, validateFeedback,
} from '../../src/app/feedback.js';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_000 * DAY;

test('een bericht heeft een soort en een tekst van hoogstens 1000 tekens', () => {
  assert.deepEqual(validateFeedback({ kind: 'idea', body: 'Een donker thema' }), []);
  assert.deepEqual(validateFeedback({ kind: null, body: 'tekst' }), [{ field: 'kind', code: 'required' }]);
  assert.deepEqual(validateFeedback({ kind: 'onzin', body: 'tekst' }), [{ field: 'kind', code: 'required' }]);
  assert.deepEqual(validateFeedback({ kind: 'idea', body: '   ' }), [{ field: 'body', code: 'required' }]);
  assert.deepEqual(validateFeedback({ kind: 'idea', body: 'x'.repeat(1001) }), [{ field: 'body', code: 'too_long' }]);
  assert.deepEqual(validateFeedback({ kind: 'idea', body: 'x'.repeat(1000) }), []);
  assert.deepEqual(validateFeedback({}).map((e) => e.field), ['kind', 'body']);
});

test('de pagina die meegaat heeft geen zoekopdracht en nooit een uitnodigingscode', () => {
  assert.equal(routeForFeedback('#/today'), '#/today');
  assert.equal(routeForFeedback('#/today?date=2026-10-12'), '#/today');
  assert.equal(routeForFeedback('#/habits/abc/edit'), '#/habits/abc/edit');
  assert.equal(routeForFeedback('#/vrienden/uitnodiging/GEHEIMECODE123'), '#/vrienden/uitnodiging/…');
  assert.equal(routeForFeedback('#/' + 'x'.repeat(300)).length, 100);
  assert.equal(routeForFeedback(undefined), '');
});

test('de uitnodiging komt pas na zeven dagen gebruik', () => {
  assert.equal(inviteDue({ now, firstRun: now - (INVITE_AFTER_DAYS - 1) * DAY }), false);
  assert.equal(inviteDue({ now, firstRun: now - INVITE_AFTER_DAYS * DAY }), true);
  assert.equal(inviteDue({ now, firstRun: null }), false, 'zonder bekende eerste keer nooit');
});

test('na "Niet nu" is het 28 dagen stil, en na een bericht 90 dagen', () => {
  const firstRun = now - 100 * DAY;
  assert.equal(inviteDue({ now, firstRun, lastAsked: now - (INVITE_SNOOZE_DAYS - 1) * DAY }), false);
  assert.equal(inviteDue({ now, firstRun, lastAsked: now - INVITE_SNOOZE_DAYS * DAY }), true);
  assert.equal(inviteDue({ now, firstRun, lastSent: now - (INVITE_AFTER_SENT_DAYS - 1) * DAY }), false);
  assert.equal(inviteDue({ now, firstRun, lastSent: now - INVITE_AFTER_SENT_DAYS * DAY }), true);
  assert.equal(inviteDue({ now, firstRun, lastAsked: now - 40 * DAY, lastSent: now - 10 * DAY }), false, 'een recent bericht gaat voor');
});

test('de lijst voor de beheerder: filteren op status en soort, en tellen', () => {
  const items = [
    { id: 1, status: 'new', kind: 'idea' }, { id: 2, status: 'done', kind: 'idea' }, { id: 3, status: 'new', kind: 'problem' }, { id: 4, status: 'done', kind: 'compliment' },
  ];
  assert.deepEqual(filterFeedback(items).map((i) => i.id), [1, 2, 3, 4]);
  assert.deepEqual(filterFeedback(items, { status: 'new' }).map((i) => i.id), [1, 3]);
  assert.deepEqual(filterFeedback(items, { status: 'done', kind: 'idea' }).map((i) => i.id), [2]);
  assert.deepEqual(filterFeedback(items, { kind: 'problem' }).map((i) => i.id), [3]);
  assert.deepEqual(countByStatus(items), { new: 2, done: 2, all: 4 });
  assert.deepEqual(countByStatus([]), { new: 0, done: 0, all: 0 });
});
