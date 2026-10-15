// Het detail van een dag in het overzicht op Voortgang: wat stond er gepland en hoe ging het.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayDetail } from '../../src/app/overview.js';
import { TODAY, validHabit } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const habit = (id, over = {}) => validHabit({ id, name: id, startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule: daily }], ...over });
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ratings: [], ...over });
const states = (detail) => Object.fromEntries(detail.items.map((item) => [item.name, item.state]));

test('dagdetail: per habit hoe het ging op een voorbije dag', () => {
  const habits = [habit('lezen'), habit('water'), habit('wandelen'), habit('sporten')];
  const checkIns = [
    { habitId: 'lezen', date: '2026-10-12', status: 'done' },
    { habitId: 'water', date: '2026-10-12', status: 'minimal' },
    { habitId: 'wandelen', date: '2026-10-12', status: 'skipped' },
  ];
  const detail = buildDayDetail({ snapshot: snapshot({ habits, checkIns }), date: '2026-10-12', today: TODAY });
  assert.deepEqual(states(detail), { lezen: 'done', water: 'minimal', wandelen: 'skipped', sporten: 'missed' });
  assert.deepEqual([detail.done, detail.total], [2, 3], 'overgeslagen telt niet mee in het totaal');
  assert.equal(detail.items.every((item) => item.icon && item.color), true);
});

test('dagdetail: vandaag is "nog open", een dag in de toekomst "gepland"', () => {
  const habits = [habit('lezen')];
  assert.deepEqual(states(buildDayDetail({ snapshot: snapshot({ habits }), date: TODAY, today: TODAY })), { lezen: 'open' });
  assert.deepEqual(states(buildDayDetail({ snapshot: snapshot({ habits }), date: '2026-10-16', today: TODAY })), { lezen: 'planned' });
});

test('dagdetail: een dag van maanden geleden is te bekijken, maar niet meer aan te passen op Vandaag', () => {
  const habits = [habit('lezen')];
  const checkIns = [{ habitId: 'lezen', date: '2026-08-20', status: 'done' }];
  const old = buildDayDetail({ snapshot: snapshot({ habits, checkIns }), date: '2026-08-20', today: TODAY });
  assert.deepEqual(states(old), { lezen: 'done' });
  assert.equal(old.editable, false);
  assert.equal(buildDayDetail({ snapshot: snapshot({ habits }), date: '2026-10-12', today: TODAY }).editable, true);
  assert.equal(buildDayDetail({ snapshot: snapshot({ habits }), date: '2026-10-22', today: TODAY }).editable, true, 'tot een week vooruit');
  assert.equal(buildDayDetail({ snapshot: snapshot({ habits }), date: '2026-10-23', today: TODAY }).editable, false);
});

test('dagdetail: een dag zonder gepland werk heeft geen regels en is niet aan te passen', () => {
  const detail = buildDayDetail({ snapshot: snapshot({ habits: [habit('lezen', { startDate: '2026-10-14', schedules: [{ effectiveFrom: '2026-10-14', schedule: daily }] })] }), date: '2026-10-10', today: TODAY });
  assert.deepEqual(detail.items, []);
  assert.equal(detail.editable, false);
});
