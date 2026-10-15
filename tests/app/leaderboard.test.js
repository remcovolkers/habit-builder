// De ranglijst (docs/SOCIAAL.md §4.3–4.4): wie erin staat, de volgorde en de rangen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaderboard, isRecentlyActive } from '../../src/app/leaderboard.js';

const TODAY = '2026-10-15';
const entry = (userId, name, points, extra = {}) => ({ userId, name, points, done: points / 10, streak: 0, activeHabits: 3, lastActive: TODAY, ...extra });
const board = (entries, meId = 'me') => buildLeaderboard({ entries, meId, today: TODAY });
const names = (rows) => rows.map((r) => r.name);

test('actief = vandaag, gisteren of eergisteren iets afgevinkt; 3 dagen of langer stil is weg', () => {
  assert.equal(isRecentlyActive('2026-10-15', TODAY), true);
  assert.equal(isRecentlyActive('2026-10-14', TODAY), true);
  assert.equal(isRecentlyActive('2026-10-13', TODAY), true);
  assert.equal(isRecentlyActive('2026-10-12', TODAY), false);
  assert.equal(isRecentlyActive(null, TODAY), false);
  assert.equal(isRecentlyActive(undefined, TODAY), false);
  assert.equal(isRecentlyActive('2026-10-16', TODAY), false, 'een datum in de toekomst (klok die voorloopt) telt niet als bewijs');
});

test('een vriend die 3 dagen niets deed verdwijnt, en komt terug zodra hij weer iets afvinkt', () => {
  const quiet = entry('f', 'Femke', 90, { lastActive: '2026-10-12' });
  assert.deepEqual(names(board([entry('me', 'Ik', 50), quiet])), ['Ik']);
  assert.deepEqual(names(board([entry('me', 'Ik', 50), { ...quiet, lastActive: TODAY }])), ['Femke', 'Ik']);
});

test('jezelf staat er altijd in, ook als je zelf 3 dagen niets deed of nog niets had', () => {
  const rows = board([entry('me', 'Ik', 40, { lastActive: '2026-10-01' }), entry('f', 'Femke', 90)]);
  assert.deepEqual(names(rows), ['Femke', 'Ik']);
  assert.equal(rows.find((r) => r.isMe).name, 'Ik');
  assert.deepEqual(names(board([entry('me', 'Ik', 0, { lastActive: null })])), ['Ik']);
});

test('een vriend die nog nooit iets afvinkte, staat er niet in', () => {
  assert.deepEqual(names(board([entry('me', 'Ik', 50), entry('f', 'Nieuw', 0, { lastActive: null })])), ['Ik']);
});

test('gesorteerd op punten, de meeste eerst, met rang 1, 2, 3', () => {
  const rows = board([entry('a', 'Anna', 60), entry('me', 'Ik', 90), entry('b', 'Bram', 75)]);
  assert.deepEqual(names(rows), ['Ik', 'Bram', 'Anna']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test('gelijke punten is gelijke rang en daarna slaat de telling een plek over ("1, 1, 3")', () => {
  const rows = board([entry('a', 'Anna', 80), entry('b', 'Bram', 80), entry('c', 'Cor', 70), entry('d', 'Daan', 70), entry('e', 'Eef', 50)], 'a');
  assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3, 3, 5]);
});

test('bij gelijke punten gaat de langste reeks voor, dan de naam', () => {
  const rows = board([
    entry('a', 'Zoë', 80, { streak: 2 }),
    entry('c', 'Cor', 80, { streak: 5 }),
    entry('d', 'Anna', 80, { streak: 5 }),
  ], 'a');
  assert.deepEqual(names(rows), ['Anna', 'Cor', 'Zoë']);
});

test('nul punten is een gewone stand (onderaan), geen aparte soort', () => {
  const rows = board([entry('a', 'Anna', 0), entry('me', 'Ik', 10), entry('b', 'Bram', 20)]);
  assert.deepEqual(names(rows), ['Bram', 'Ik', 'Anna']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test('namen sorteren op Nederlandse volgorde (hoofdletters en accenten maken niet uit)', () => {
  const rows = board([entry('a', 'émile', 10), entry('b', 'Eva', 10), entry('c', 'anna', 10)], 'x');
  assert.deepEqual(names(rows), ['anna', 'émile', 'Eva']);
});

test('een lege lijst blijft leeg en het werkt zonder jezelf in de lijst', () => {
  assert.deepEqual(board([]), []);
  assert.deepEqual(names(board([entry('f', 'Femke', 70)])), ['Femke']);
});

test('de invoer wordt niet gewijzigd', () => {
  const entries = [entry('a', 'Anna', 60), entry('me', 'Ik', 90)];
  const copy = JSON.parse(JSON.stringify(entries));
  board(entries);
  assert.deepEqual(entries, copy);
});

// ---- de uitleg in de app klopt met de regel ------------------------------------------------------------------------------------

import { nl } from '../../src/content/nl.js';
import { SOCIAL_ACTIVE_DAYS } from '../../src/domain/constants.js';
import { addDays } from '../../src/domain/dates.js';

test('de uitleg "Wie staat er op de ranglijst?" noemt het aantal dagen uit de regel, en er is geen minimum aantal taken', () => {
  const text = nl.friends.rules.items({ activeDays: SOCIAL_ACTIVE_DAYS }).join(' ');
  assert.ok(text.includes(`${SOCIAL_ACTIVE_DAYS} dagen`), 'het aantal dagen staat in de tekst');
  assert.ok(/geen minimum aantal taken/.test(text));
  // en het gedrag: de laatste dag die nog meetelt is SOCIAL_ACTIVE_DAYS - 1 dagen geleden, een dag eerder valt eraf
  assert.equal(isRecentlyActive(addDays(TODAY, -(SOCIAL_ACTIVE_DAYS - 1)), TODAY), true);
  assert.equal(isRecentlyActive(addDays(TODAY, -SOCIAL_ACTIVE_DAYS), TODAY), false);
});

test('één afgevinkte taak is genoeg om op andermans lijst te komen: er is geen minimum aantal punten of taken', () => {
  const one = entry('f', 'Femke', 10, { done: 1, lastActive: TODAY });
  assert.deepEqual(names(board([entry('me', 'Ik', 50), one])), ['Ik', 'Femke']);
  const zero = entry('g', 'Gijs', 0, { done: 1, lastActive: TODAY }); // wel iets afgevinkt, maar de minpunten brengen hem op 0
  assert.ok(names(board([entry('me', 'Ik', 50), zero])).includes('Gijs'));
});
