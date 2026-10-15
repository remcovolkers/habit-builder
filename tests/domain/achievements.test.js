import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_KEYS, evaluateAchievements, hasComeback, hasPerfectWeek, hasReviewStreak,
} from '../../src/domain/achievements.js';
import { buildHabitStats } from '../../src/domain/stats.js';
import { addDays, eachDay } from '../../src/domain/dates.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { habit, weekdaysSchedule } from './helpers.js';

const TODAY = '2026-10-15';
const daily = weekdaysSchedule(ALL_WEEKDAYS);

const dayUnit = (status, start) => ({ kind: 'day', span: 'day', type: 'weekdays', start, end: start, days: 1, status });
const weekUnit = (status, start) => ({ kind: 'period', span: 'week', type: 'times_per_period', start, end: addDays(start, 6), days: 7, status });

function stats(id, start, doneDays, extra = {}) {
  return buildHabitStats({
    habit: habit(daily, start, { id, ...extra }),
    checkIns: doneDays.map((date) => ({ date, status: 'done' })),
    today: TODAY,
  });
}
const allDays = (start) => eachDay(start, addDays(TODAY, -1));
const fake = (over) => ({
  habitId: 'x', habitStatus: 'active', graduated: false, units: [], activeDays: 0,
  consistency: { rate: null }, totalDone: 0, ...over,
});
const keys = (list) => list.map((a) => (a.habitId ? `${a.key}@${a.habitId}` : a.key));

test('comeback: gemiste periode van ≥ 7 dagen en dan weer gedaan', () => {
  const gap = (n, then) => [
    dayUnit('done', '2026-10-01'),
    ...Array.from({ length: n }, (_, i) => dayUnit('missed', addDays('2026-10-02', i))),
    dayUnit('done', addDays('2026-10-02', n)),
  ].slice(0, then ?? undefined);
  assert.equal(hasComeback(gap(8)), true); // 2 okt t/m 9 okt gemist, 10 okt weer
  assert.equal(hasComeback(gap(7)), true); // 2 okt gemist, terug op 9 okt: precies 7 dagen
  assert.equal(hasComeback(gap(4)), false);
  assert.equal(hasComeback([dayUnit('done', '2026-10-01')]), false);
});

test('comeback: overgeslagen eenheden midden in de gemiste periode onderbreken niets', () => {
  const units = [
    dayUnit('missed', '2026-10-01'),
    dayUnit('skipped', '2026-10-04'),
    dayUnit('paused', '2026-10-05'),
    dayUnit('done', '2026-10-09'),
  ];
  assert.equal(hasComeback(units), true);
});

test('comeback: een gemiste week bij een weekhabit en dan weer gehaald telt', () => {
  assert.equal(hasComeback([weekUnit('done', '2026-10-05'), weekUnit('missed', '2026-10-12'), weekUnit('done', '2026-10-19')]), true);
});

test('perfecte week: alleen afgesloten weken met ≥ 3 eenheden en geen misser', () => {
  const week = (status = 'done') => eachDay('2026-10-05', '2026-10-11').map((d) => dayUnit(status, d));
  assert.equal(hasPerfectWeek(week(), '2026-10-12'), true);
  assert.equal(hasPerfectWeek(week(), '2026-10-11'), false); // week is nog niet afgesloten
  assert.equal(hasPerfectWeek([...week().slice(0, 6), dayUnit('missed', '2026-10-11')], '2026-10-20'), false);
  assert.equal(hasPerfectWeek(week().slice(0, 2), '2026-10-20'), false); // te weinig eenheden
});

test('perfecte week: weekeenheden en meerdere habits tellen samen; overgeslagen niet', () => {
  const units = [weekUnit('done', '2026-10-05'), dayUnit('done', '2026-10-06'), dayUnit('done', '2026-10-07')];
  assert.equal(hasPerfectWeek(units, '2026-10-20'), true);
  const withSkips = [dayUnit('done', '2026-10-06'), dayUnit('done', '2026-10-07'), dayUnit('skipped', '2026-10-08'), dayUnit('paused', '2026-10-09')];
  assert.equal(hasPerfectWeek(withSkips, '2026-10-20'), false); // maar 2 tellende eenheden
});

test('review-reeks: 4 opeenvolgende weken, datums midden in de week worden genormaliseerd', () => {
  const r = (...weekStarts) => weekStarts.map((weekStart) => ({ weekStart }));
  assert.equal(hasReviewStreak(r('2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05')), true);
  assert.equal(hasReviewStreak(r('2026-09-16', '2026-09-23', '2026-09-30', '2026-10-08')), true);
  assert.equal(hasReviewStreak(r('2026-09-14', '2026-09-21', '2026-10-05', '2026-10-12')), false); // gat
  assert.equal(hasReviewStreak(r('2026-09-14', '2026-09-21', '2026-09-28')), false);
  assert.equal(hasReviewStreak(r('2026-09-14', '2026-09-14', '2026-09-21', '2026-09-28')), false); // dubbele telt 1×
  assert.equal(hasReviewStreak([]), false);
});

test('evaluateAchievements: 76 dagen trouw geeft de eerste mijlpalen, nog niet 100', () => {
  const s = stats('A', '2026-08-01', allDays('2026-08-01'));
  const got = evaluateAchievements({ today: TODAY, stats: [s] });
  assert.deepEqual(keys(got), [
    'first_checkin', 'days_7@A', 'days_21@A', 'days_42@A', 'days_66@A', 'perfect_week',
  ]);
});

test('evaluateAchievements: idempotent — eerder ontgrendeld komt niet terug', () => {
  const s = stats('A', '2026-08-01', allDays('2026-08-01'));
  const first = evaluateAchievements({ today: TODAY, stats: [s] });
  assert.deepEqual(evaluateAchievements({ today: TODAY, stats: [s], unlocked: first }), []);
  const partial = evaluateAchievements({ today: TODAY, stats: [s], unlocked: [{ key: 'days_7', habitId: 'A' }] });
  assert.equal(keys(partial).includes('days_7@A'), false);
  assert.equal(keys(partial).includes('days_21@A'), true);
});

test('evaluateAchievements: mijlpalen zijn per habit', () => {
  const a = stats('A', '2026-08-01', allDays('2026-08-01'));
  const b = stats('B', '2026-10-01', allDays('2026-10-01')); // 15 dagen
  const got = keys(evaluateAchievements({ today: TODAY, stats: [a, b] }));
  assert.ok(got.includes('days_66@A'));
  assert.ok(got.includes('days_7@B'));
  assert.equal(got.includes('days_21@B'), false);
});

test('evaluateAchievements: dagen alleen tellen met ≥ 50% consistentie', () => {
  const sparse = stats('A', '2026-08-01', ['2026-08-01', '2026-08-02', '2026-09-01']);
  const got = keys(evaluateAchievements({ today: TODAY, stats: [sparse] }));
  // geen days_* (consistentie ver onder 50%); de gat-en-weer-oppakken-lijn is wél een comeback
  assert.deepEqual(got, ['first_checkin', 'comeback@A']);
});

test('evaluateAchievements: comeback, ingeburgerd, drie actief en review-reeks', () => {
  const withGap = stats('A', '2026-09-01', allDays('2026-09-01').filter((d) => d < '2026-09-10' || d > '2026-09-20'));
  const got = keys(
    evaluateAchievements({
      today: TODAY,
      stats: [
        withGap,
        fake({ habitId: 'G', habitStatus: 'graduated', graduated: true }),
        fake({ habitId: 'B' }),
        fake({ habitId: 'C' }),
      ],
      reviews: ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((weekStart) => ({ weekStart })),
    }),
  );
  assert.ok(got.includes('comeback@A'));
  assert.ok(got.includes('first_graduated'));
  assert.ok(got.includes('three_active')); // A, B, C zijn 'active'
  assert.ok(got.includes('review_streak_4'));
});

test('evaluateAchievements: twee actieve habits is nog geen three_active; nieuwe gebruiker krijgt niets', () => {
  const two = evaluateAchievements({ today: TODAY, stats: [fake({ habitId: 'A' }), fake({ habitId: 'B' })] });
  assert.deepEqual(two, []);
  assert.deepEqual(evaluateAchievements({ today: TODAY, stats: [] }), []);
});

test('alle sleutels die evaluateAchievements kan geven staan in ACHIEVEMENT_KEYS', () => {
  const s = stats('A', '2026-01-01', eachDay('2026-01-01', addDays(TODAY, -1)));
  const got = evaluateAchievements({
    today: TODAY,
    stats: [s, fake({ habitId: 'G', graduated: true }), fake({ habitId: 'B' })],
    reviews: ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((weekStart) => ({ weekStart })),
  });
  for (const a of got) assert.ok(ACHIEVEMENT_KEYS.includes(a.key), a.key);
  assert.ok(got.some((a) => a.key === 'days_100'));
});
