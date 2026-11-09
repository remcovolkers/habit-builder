import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habitAchievements } from '../../src/app/habit-achievements.js';
import { buildHabitDetail } from '../../src/app/habit-detail.js';
import { ACHIEVEMENT_INFO } from '../../src/content/achievements.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const stats = (over = {}) => ({ activeDays: 30, totalDone: 12, pace: { timesPerWeek: 7 }, ...over });
const names = (list) => list.map((item) => item.key);

test('habitAchievements: behaald (oudste eerst) en per soort de eerstvolgende met voortgang', () => {
  const records = [{ key: 'habit_done_10', date: '2026-10-05' }, { key: 'days_7', date: '2026-10-01' }, { key: 'days_21', date: '2026-10-10' }];
  const { reached, next } = habitAchievements({ habit: { id: 'h' }, stats: stats(), records });
  assert.deepEqual(names(reached), ['days_7', 'habit_done_10', 'days_21']);
  assert.deepEqual(next, [
    { key: 'days_42', value: 30, target: 42, repsNeeded: 22 }, // dagelijks: 0,8 × 42 = 34 keer, 12 gedaan
    { key: 'habit_done_25', value: 12, target: 25 },
  ]);
});

test('habitAchievements: een nieuwe habit begint bij de eerste mijlpalen; een habit die uitbouwt krijgt "Uitgebouwd" als volgende', () => {
  const fresh = habitAchievements({ habit: { id: 'h' }, stats: stats({ activeDays: 3, totalDone: 2 }), records: [] });
  assert.deepEqual(names(fresh.next), ['days_7', 'habit_done_10']);
  assert.deepEqual(fresh.reached, []);
  const growing = habitAchievements({ habit: { id: 'h', goal: { completedOn: null } }, stats: stats(), records: [] });
  assert.deepEqual(names(growing.next).at(-1), 'built_goal');
  const done = habitAchievements({ habit: { id: 'h', goal: { completedOn: '2026-10-01' } }, stats: stats(), records: [{ key: 'built_goal', date: '2026-10-01' }] });
  assert.equal(names(done.next).includes('built_goal'), false);
});

test('habitAchievements: alle opgegeven sleutels hebben een tekst, en een habit ver voorbij alle mijlpalen heeft geen "volgende" meer', () => {
  const all = ['days_7', 'days_21', 'days_42', 'days_66', 'days_100', 'days_365', 'habit_done_10', 'habit_done_25', 'habit_done_50', 'habit_done_100'];
  const { next } = habitAchievements({ habit: { id: 'h' }, stats: stats(), records: all.map((key) => ({ key, date: '2026-10-01' })) });
  assert.deepEqual(next, []);
  for (const key of [...all, 'built_goal']) assert.ok(ACHIEVEMENT_INFO[key], key);
});

test('buildHabitDetail: de prestaties van alleen deze habit', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit({ name: 'Lezen' }));
  const other = await repo.saveHabit(validHabit({ name: 'Water' }));
  await repo.unlockAchievement({ key: 'days_7', habitId: habit.id, date: '2026-10-08' });
  await repo.unlockAchievement({ key: 'days_7', habitId: other.id, date: '2026-10-09' });
  await repo.unlockAchievement({ key: 'first_checkin', date: '2026-10-02' });
  const detail = buildHabitDetail({ habit, snapshot: await repo.snapshot(), today: TODAY });
  assert.deepEqual(detail.achievements.reached, [{ key: 'days_7', date: '2026-10-08' }]);
});
