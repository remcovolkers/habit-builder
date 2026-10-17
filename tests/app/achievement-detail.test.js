// De uitleg bij een prestatie die je aantikt: wat de regel is, wanneer (en bij welke habit) je hem haalde, of hoe ver je bent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainAchievement } from '../../src/app/achievement-detail.js';
import { ACHIEVEMENT_INFO } from '../../src/content/achievements.js';
import { ACHIEVEMENT_KEYS } from '../../src/domain/achievements.js';

const names = new Map([['h1', 'Wandelen'], ['h2', 'Lezen']]);

test('een behaalde prestatie zonder habit: de regel en de dag waarop je hem haalde', () => {
  const e = explainAchievement({ info: ACHIEVEMENT_INFO.first_checkin, records: [{ habitId: null, date: '2026-10-03' }], names });
  assert.equal(e.unlocked, true);
  assert.equal(e.text, ACHIEVEMENT_INFO.first_checkin.text);
  assert.equal(e.status, null);
  assert.equal(e.rows.length, 1);
  assert.equal(e.rows[0].label, null);
  assert.match(e.rows[0].when, /^Behaald op /);
});

test('een prestatie per habit: elke habit krijgt een regel, oudste eerst', () => {
  const e = explainAchievement({
    info: ACHIEVEMENT_INFO.comeback,
    records: [{ habitId: 'h2', date: '2026-10-09' }, { habitId: 'h1', date: '2026-10-02' }],
    names,
  });
  assert.deepEqual(e.rows.map((r) => r.label), ['Wandelen', 'Lezen']);
});

test('een habit die je hebt verwijderd krijgt een nette naam in plaats van niets', () => {
  const e = explainAchievement({ info: ACHIEVEMENT_INFO.comeback, records: [{ habitId: 'weg', date: '2026-10-02' }], names });
  assert.equal(e.rows[0].label, 'Een habit die je hebt verwijderd');
});

test('een prestatie die nog niet behaald is: hoe je hem haalt en hoe ver je bent', () => {
  const e = explainAchievement({ info: ACHIEVEMENT_INFO.done_50, records: [], names, progress: { value: 37, target: 50 } });
  assert.equal(e.unlocked, false);
  assert.equal(e.heading, 'Zo haal je hem');
  assert.equal(e.status, '37 van 50');
  assert.deepEqual(e.rows, []);
});

test('zonder voortgang (geen telprestatie) staat er "Nog niet behaald"', () => {
  const e = explainAchievement({ info: ACHIEVEMENT_INFO.comeback, records: [], names });
  assert.equal(e.status, 'Nog niet behaald');
});

test('elke prestatie heeft een uitleg die iets zegt', () => {
  for (const key of ACHIEVEMENT_KEYS.filter((k) => ACHIEVEMENT_INFO[k])) {
    const e = explainAchievement({ info: ACHIEVEMENT_INFO[key], records: [], names });
    assert.ok(e.text.length > 10, key);
  }
});
