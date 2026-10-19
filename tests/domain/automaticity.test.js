// Automatisme: de cijfers, wat er hielp en de raad die daaruit volgt (src/domain/automaticity.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATING_CUES, adviceFor, cleanCues, cueSummary, levelOf, recentScores, sortedRatings, validCues } from '../../src/domain/automaticity.js';

const rate = (weekStart, score, cues) => ({ habitId: 'h', weekStart, score, ...(cues ? { cues } : {}) });

test('niveaus: 1–2 nog bewust, 3 komt eraan, 4 bijna vanzelf, 5 vanzelfsprekend', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(levelOf), ['aware', 'aware', 'coming', 'almost', 'natural']);
});

test('wat hielp: alleen bekende sleutels, zonder dubbelen, en "niets" staat alleen', () => {
  assert.equal(validCues([]), true);
  assert.equal(validCues(['reminder', 'routine']), true);
  assert.equal(validCues(['nothing']), true);
  assert.equal(validCues(['nothing', 'reminder']), false);
  assert.equal(validCues(['reminder', 'reminder']), false);
  assert.equal(validCues(['magic']), false);
  assert.equal(validCues('reminder'), false);
  assert.equal(validCues(null), false);
  assert.deepEqual([...RATING_CUES], ['reminder', 'app_plan', 'routine', 'someone', 'nothing']);
});

test('cleanCues maakt van een lijst een geldige', () => {
  assert.deepEqual(cleanCues(['routine', 'magic', 'routine', 'reminder']), ['routine', 'reminder']);
  assert.deepEqual(cleanCues(['reminder', 'nothing']), ['nothing']);
  assert.deepEqual(cleanCues(undefined), []);
});

test('cijfers: oudste eerst, en de laatste n', () => {
  const ratings = [rate('2026-10-12', 4), rate('2026-09-28', 2), rate('2026-10-05', 3)];
  assert.deepEqual(sortedRatings(ratings).map((r) => r.score), [2, 3, 4]);
  assert.deepEqual(recentScores(ratings, 2), [3, 4]);
  assert.deepEqual(recentScores([], 2), []);
});

test('cueSummary telt alleen de laatste cijfers met een antwoord, en zet de externe hulp apart', () => {
  const ratings = [
    rate('2026-09-07', 2, ['reminder']), rate('2026-09-14', 3), rate('2026-09-21', 3, ['routine']),
    rate('2026-09-28', 3, ['app_plan', 'routine']), rate('2026-10-05', 4, ['nothing']), rate('2026-10-12', 4, ['reminder']),
  ];
  // de laatste vier met een antwoord: 21 sep, 28 sep, 5 okt, 12 okt
  assert.deepEqual(cueSummary(ratings), { tagged: 4, external: 2 });
  assert.deepEqual(cueSummary([rate('2026-10-05', 4)]), { tagged: 0, external: 0 });
});

test('raad: moeite, een herinnering, een cue, bijna, vast', () => {
  const habit = { cue: null };
  assert.equal(adviceFor({ ratings: [], habit }), null);
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 5), rate('2026-10-12', 2)], habit }), 'effort');
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 3), rate('2026-10-12', 3)], habit }), 'coming');
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 3), rate('2026-10-12', 4)], habit }), 'once');
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 4)], habit }), 'once');
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 4), rate('2026-10-12', 5)], habit }), 'steady');

  const leaning = [rate('2026-10-05', 3, ['reminder']), rate('2026-10-12', 3, ['app_plan', 'routine'])];
  assert.equal(adviceFor({ ratings: leaning, habit: { cue: null } }), 'cue', 'steunt op de app en heeft nog geen cue');
  assert.equal(adviceFor({ ratings: leaning, habit: { cue: '  ' } }), 'cue');
  assert.equal(adviceFor({ ratings: leaning, habit: { cue: 'na het eten' } }), 'weaning', 'er is al een cue: probeer het zonder de app');
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 3, ['reminder'])], habit }), 'coming', 'één antwoord is te weinig om iets te zeggen');
  assert.equal(adviceFor({ ratings: [rate('2026-10-05', 3, ['routine']), rate('2026-10-12', 3, ['routine'])], habit }), 'coming');
});
