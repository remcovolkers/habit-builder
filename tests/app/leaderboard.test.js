// De ranglijst (docs/SOCIAAL.md §4.3–4.5): wie erin staat, de volgorde en de rangen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaderboard, isRecentlyActive } from '../../src/app/leaderboard.js';

const TODAY = '2026-10-15';
const entry = (userId, name, score, extra = {}) => ({ userId, name, score, planned: 10, done: 5, streak: 0, activeHabits: 3, lastActive: TODAY, ...extra });
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
  assert.deepEqual(names(board([entry('me', 'Ik', null, { lastActive: null })])), ['Ik']);
});

test('een vriend die nog nooit iets afvinkte, staat er niet in', () => {
  assert.deepEqual(names(board([entry('me', 'Ik', 50), entry('f', 'Nieuw', null, { lastActive: null })])), ['Ik']);
});

test('gesorteerd op score, hoogste eerst, met rang 1, 2, 3', () => {
  const rows = board([entry('a', 'Anna', 60), entry('me', 'Ik', 90), entry('b', 'Bram', 75)]);
  assert.deepEqual(names(rows), ['Ik', 'Bram', 'Anna']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  assert.ok(rows.every((r) => r.status === 'ranked'));
});

test('gelijke score is gelijke rang en daarna slaat de telling een plek over ("1, 1, 3")', () => {
  const rows = board([entry('a', 'Anna', 80), entry('b', 'Bram', 80), entry('c', 'Cor', 70), entry('d', 'Daan', 70), entry('e', 'Eef', 50)], 'a');
  assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3, 3, 5]);
});

test('bij gelijke score gaat wie meer gepland had voor, dan de langste reeks, dan de naam', () => {
  const rows = board([
    entry('a', 'Zoë', 80, { planned: 10, streak: 2 }),
    entry('b', 'Bram', 80, { planned: 20, streak: 0 }),
    entry('c', 'Cor', 80, { planned: 10, streak: 5 }),
    entry('d', 'Anna', 80, { planned: 10, streak: 5 }),
  ], 'a');
  assert.deepEqual(names(rows), ['Bram', 'Anna', 'Cor', 'Zoë']);
});

test('wie te weinig had om te beoordelen staat onderaan zonder rang', () => {
  const rows = board([entry('a', 'Anna', null), entry('me', 'Ik', 10), entry('b', 'Bram', 0)]);
  assert.deepEqual(names(rows), ['Ik', 'Bram', 'Anna']); // 0% is een score; null niet
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, null]);
  assert.equal(rows[2].status, 'too_little');
  assert.equal(rows[2].score, null);
});

test('namen sorteren op Nederlandse volgorde (hoofdletters en accenten maken niet uit)', () => {
  const rows = board([entry('a', 'émile', null), entry('b', 'Eva', null), entry('c', 'anna', null)], 'x');
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
