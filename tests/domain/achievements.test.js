import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_KEYS, COUNT_ACHIEVEMENTS, achievementProgress, countAllDoneDays, counterFullStreak, countRecoveries, evaluateAchievements, hasComeback,
  hasPerfectWeek, hasResumedPause, hasReviewStreak, hasStrongReturn, longestWeekRun,
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
    'done_10', 'done_50', 'streak_7', 'streak_14', 'streak_30', 'perfect_weeks_4', // 75 keer, 75 dagen reeks, ruim vier perfecte weken
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
  assert.deepEqual(got, ['first_checkin', 'comeback@A']); // 3 keer gedaan: nog geen aantalprestatie
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

// --- ronde 1 van §5 --------------------------------------------------------------------------------------------

test('nieuwe prestaties: elke telprestatie heeft een eigen sleutel in ACHIEVEMENT_KEYS, en niets komt dubbel voor', () => {
  for (const { key } of COUNT_ACHIEVEMENTS) assert.ok(ACHIEVEMENT_KEYS.includes(key), key);
  assert.equal(new Set(ACHIEVEMENT_KEYS).size, ACHIEVEMENT_KEYS.length);
});

test('opeenvolgende weken: de langste reeks telt, een gat breekt hem', () => {
  assert.equal(longestWeekRun([]), 0);
  assert.equal(longestWeekRun(['2026-09-07']), 1);
  assert.equal(longestWeekRun(['2026-09-07', '2026-09-14', '2026-09-21', '2026-10-05', '2026-10-12']), 3);
});

test('nooit twee keer missen: een gemiste eenheid gevolgd door de eerstvolgende gehaalde; overslaan en pauze doen niets', () => {
  const u = (...statuses) => statuses.map((status, i) => dayUnit(status, addDays('2026-10-01', i)));
  assert.equal(countRecoveries(u('done', 'missed', 'done', 'missed', 'done')), 2);
  assert.equal(countRecoveries(u('missed', 'missed', 'done')), 1); // twee keer missen en dan terug: één terugkeer
  assert.equal(countRecoveries(u('missed', 'skipped', 'paused', 'done')), 1);
  assert.equal(countRecoveries(u('done', 'done', 'done')), 0);
  assert.equal(countRecoveries(u('missed', 'missed')), 0);
  assert.equal(countRecoveries([]), 0);
});

test('sterk terug: een dip in een venster van twee weken en daarna weer op 80%', () => {
  const run = (...parts) => parts.flatMap(([status, n]) => Array.from({ length: n }, () => status))
    .map((status, i) => dayUnit(status, addDays('2026-09-01', i)));
  assert.equal(hasStrongReturn(run(['missed', 14], ['done', 12])), true); // 12 van 14 in het laatste venster
  assert.equal(hasStrongReturn(run(['missed', 14], ['done', 8])), false); // nog maar 57%
  assert.equal(hasStrongReturn(run(['done', 30])), false); // nooit een dip
  assert.equal(hasStrongReturn(run(['done', 10], ['missed', 3], ['done', 14])), false); // een kleine misser is geen dip
  assert.equal(hasStrongReturn(run(['missed', 3], ['done', 14])), false); // te weinig om een dip te noemen: de eerste 3 zijn geen 4
  assert.equal(hasStrongReturn([]), false);
  const monthly = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map((start) => ({ ...weekUnit('missed', start), span: 'month' }));
  assert.equal(hasStrongReturn(monthly), false); // te weinig eenheden in twee weken
});

test('vol doel: zeven dagen achter elkaar het volle doel; een minimale versie of een half doel breekt de reeks', () => {
  const days = (statuses) => statuses.map((status, i) => ({ ...dayUnit(status, addDays('2026-10-01', i)), minimalCount: status === 'minimal' ? 1 : 0 }));
  assert.equal(counterFullStreak(days(Array(7).fill('done'))), 7);
  assert.equal(counterFullStreak(days(['done', 'done', 'minimal', 'done', 'done', 'done', 'done'])), 4);
  assert.equal(counterFullStreak(days(['done', 'done', 'missed', 'done', 'done'])), 2); // een half doel telt als gemist
  assert.equal(counterFullStreak(days(['done', 'skipped', 'done'])), 2); // een bewust overgeslagen dag onderbreekt niet
  assert.equal(counterFullStreak([weekUnit('done', '2026-10-05')]), 0); // alleen dagen
});

test('pauzeren is oké: een afgelopen pauze en daarna weer gedaan', () => {
  const pause = { habitId: 'A', from: '2026-10-01', to: '2026-10-05' };
  const done = (date, habitId = 'A', status = 'done') => ({ habitId, date, status });
  assert.equal(hasResumedPause([pause], [done('2026-10-06')], TODAY), true);
  assert.equal(hasResumedPause([pause], [done('2026-10-06', 'A', 'minimal')], TODAY), true);
  assert.equal(hasResumedPause([pause], [done('2026-10-05')], TODAY), false); // nog in de pauze
  assert.equal(hasResumedPause([pause], [done('2026-10-06', 'B')], TODAY), false); // een andere habit
  assert.equal(hasResumedPause([{ ...pause, to: null }], [done('2026-10-06')], TODAY), false); // nog gepauzeerd
  assert.equal(hasResumedPause([{ ...pause, to: '2026-10-20' }], [done('2026-10-21')], TODAY), false); // de pauze loopt nog (toekomst)
  assert.equal(hasResumedPause([], [done('2026-10-06')], TODAY), false);
});

test('evaluateAchievements: aantallen tellen over alle habits samen', () => {
  const a = fake({ habitId: 'A', totalDone: 6 });
  const b = fake({ habitId: 'B', totalDone: 4 });
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [a, b] })).includes('done_10'));
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [a, fake({ habitId: 'B', totalDone: 3 })] })).includes('done_10'), false);
});

test('evaluateAchievements: een reeks telt alleen bij een habit met vaste dagen, in dagen', () => {
  const days = Array.from({ length: 7 }, (_, i) => dayUnit('done', addDays('2026-10-01', i)));
  const weeks = Array.from({ length: 8 }, (_, i) => weekUnit('done', addDays('2026-08-03', i * 7)));
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [fake({ habitId: 'A', units: days })] })).includes('streak_7'));
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [fake({ habitId: 'W', units: weeks })] })).includes('streak_7'), false); // acht weken is geen reeks van dagen
});

test('evaluateAchievements: de minimale versie ingevuld, en vijf keer gebruikt', () => {
  const s = fake({ habitId: 'A' });
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [s], habits: [{ id: 'A', minimalVersion: '  ' }] })).includes('minimal_first'), false);
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [s], habits: [{ id: 'A', minimalVersion: '2 minuten' }] })).includes('minimal_first'));
  const minimal = (n) => Array.from({ length: n }, (_, i) => ({ habitId: 'A', date: addDays('2026-10-01', i), status: 'minimal' }));
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [s], checkIns: minimal(4) })).includes('minimal_5'), false);
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [s], checkIns: minimal(5) })).includes('minimal_5'));
});

test('evaluateAchievements: vol doel alleen voor een habit met een teller', () => {
  const units = Array.from({ length: 7 }, (_, i) => dayUnit('done', addDays('2026-10-01', i)));
  const s = fake({ habitId: 'C', units });
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [s], habits: [{ id: 'C', counter: { unit: 'glazen', target: 8 } }] })).includes('counter_week'));
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [s], habits: [{ id: 'C', counter: null }] })).includes('counter_week'), false);
});

test('evaluateAchievements: tweede en vijfde ingeburgerd', () => {
  const grad = (n) => Array.from({ length: n }, (_, i) => fake({ habitId: `G${i}`, habitStatus: 'graduated', graduated: true }));
  assert.deepEqual(keys(evaluateAchievements({ today: TODAY, stats: grad(1) })), ['first_graduated']);
  assert.deepEqual(keys(evaluateAchievements({ today: TODAY, stats: grad(2) })), ['first_graduated', 'graduated_2']);
  assert.deepEqual(keys(evaluateAchievements({ today: TODAY, stats: grad(5) })), ['first_graduated', 'graduated_2', 'graduated_5']);
});

test('evaluateAchievements: nieuwe prestaties komen één keer, en een onbekende sleutel in de opslag geeft geen fout', () => {
  const s = fake({ habitId: 'A', totalDone: 12 });
  const first = evaluateAchievements({ today: TODAY, stats: [s] });
  assert.deepEqual(evaluateAchievements({ today: TODAY, stats: [s], unlocked: [...first, { key: 'iets_uit_de_toekomst', habitId: null }] }), []);
});

test('voortgang: waarde tot het doel, ook zonder gegevens', () => {
  const progress = achievementProgress({ today: TODAY, stats: [fake({ habitId: 'A', totalDone: 37 })] });
  assert.deepEqual(progress.done_50, { value: 37, target: 50 });
  assert.deepEqual(progress.done_10, { value: 10, target: 10 }); // hoogstens het doel
  assert.deepEqual(progress.streak_7, { value: 0, target: 7 });
  assert.deepEqual(Object.keys(achievementProgress({ today: TODAY, stats: [] })), COUNT_ACHIEVEMENTS.map((a) => a.key));
});

// --- ronde 2 van §5 --------------------------------------------------------------------------------------------

test('alles gedaan: een dag met minstens twee dingen, alles gehaald, niets gemist of open', () => {
  const day = (date, ...statuses) => statuses.map((status) => dayUnit(status, date));
  const units = [
    ...day('2026-10-01', 'done', 'done'), // telt
    ...day('2026-10-02', 'done', 'minimal', 'done'), // telt
    ...day('2026-10-03', 'done'), // maar één ding
    ...day('2026-10-04', 'done', 'missed'), // eentje gemist
    ...day('2026-10-05', 'done', 'open'), // vandaag nog niet af
    ...day('2026-10-06', 'done', 'done', 'skipped'), // overgeslagen doet niets af
    ...day('2026-10-07', 'done', 'paused'), // één gedaan, de rest gepauzeerd: te weinig
    weekUnit('done', '2026-10-05'), // een weekeenheid hoort niet bij een dag
  ];
  assert.equal(countAllDoneDays(units), 3);
  assert.equal(countAllDoneDays([]), 0);
});

test('evaluateAchievements: eerste review', () => {
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [] })).includes('first_review'), false);
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [], reviews: [{ weekStart: '2026-10-05' }] })).includes('first_review'));
});

test('evaluateAchievements: automatisme in vier verschillende weken (van alle habits samen)', () => {
  const stats = [fake({ habitId: 'A' }), fake({ habitId: 'B' })];
  const r = (habitId, weekStart) => ({ habitId, weekStart, score: 3 });
  const three = [r('A', '2026-09-14'), r('B', '2026-09-14'), r('A', '2026-09-21'), r('A', '2026-10-05')]; // drie weken, vier cijfers
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats, ratings: three })).includes('automaticity_4'), false);
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats, ratings: [...three, r('B', '2026-10-12')] })).includes('automaticity_4'));
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats, ratings: [...three, r('GONE', '2026-10-12')] })).includes('automaticity_4'), false); // een verwijderde habit telt niet
});

test('evaluateAchievements: het waarom bij drie habits', () => {
  const habits = (...whys) => whys.map((why, i) => ({ id: `H${i}`, why, status: 'active', daypart: 'anytime' }));
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: [], habits: habits('a', 'b', '  ', undefined) })).includes('why_3'), false);
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: [], habits: habits('a', 'b', 'c') })).includes('why_3'));
});

test('evaluateAchievements: een habit in ochtend, middag én avond; "de hele dag" en gearchiveerd tellen niet', () => {
  const h = (daypart, status = 'active') => ({ id: daypart + status, daypart, status });
  const got = (habits) => keys(evaluateAchievements({ today: TODAY, stats: [], habits })).includes('all_dayparts');
  assert.equal(got([h('morning'), h('afternoon')]), false);
  assert.equal(got([h('morning'), h('afternoon'), h('anytime')]), false);
  assert.equal(got([h('morning'), h('afternoon'), h('evening', 'archived')]), false);
  assert.equal(got([h('morning'), h('afternoon'), h('evening')]), true);
  assert.equal(got([h('morning'), h('morning', 'graduated'), h('afternoon'), h('evening', 'graduated')]), true);
});

test('evaluateAchievements: vijf actieve habits tegelijk, naast drie', () => {
  const active = (n) => Array.from({ length: n }, (_, i) => fake({ habitId: `A${i}` }));
  assert.deepEqual(keys(evaluateAchievements({ today: TODAY, stats: active(4) })), ['three_active']);
  assert.deepEqual(keys(evaluateAchievements({ today: TODAY, stats: active(5) })), ['three_active', 'five_active']);
});

test('evaluateAchievements: alles gedaan op tien dagen', () => {
  const units = (days) => Array.from({ length: days }, (_, i) => [dayUnit('done', addDays('2026-10-01', i))]).flatMap(([u]) => [u, { ...u }]);
  const two = (n) => [fake({ habitId: 'A', units: units(n).filter((_, i) => i % 2 === 0) }), fake({ habitId: 'B', units: units(n).filter((_, i) => i % 2 === 1) })];
  assert.equal(keys(evaluateAchievements({ today: TODAY, stats: two(9) })).includes('all_done_10'), false);
  assert.ok(keys(evaluateAchievements({ today: TODAY, stats: two(10) })).includes('all_done_10'));
});

test('evaluateAchievements: vrienden komen van buiten (de sociale cache) en zonder sociaal is het 0', () => {
  const got = (friends) => keys(evaluateAchievements({ today: TODAY, stats: [], friends }));
  assert.deepEqual(got(0), []);
  assert.deepEqual(got(1), ['first_friend']);
  assert.deepEqual(got(4), ['first_friend']);
  assert.deepEqual(got(5), ['first_friend', 'friends_5']);
  assert.deepEqual(keys(evaluateAchievements({ today: TODAY, stats: [] })), []); // geen opgave: 0
});

test('voortgang ronde 2: dagdelen, vrienden en alles gedaan hebben een "x van y"', () => {
  const p = achievementProgress({
    today: TODAY,
    stats: [fake({ habitId: 'A' })],
    habits: [{ id: 'A', daypart: 'morning', status: 'active', why: 'x' }],
    friends: 3,
  });
  assert.deepEqual(p.all_dayparts, { value: 1, target: 3 });
  assert.deepEqual(p.friends_5, { value: 3, target: 5 });
  assert.deepEqual(p.first_friend, { value: 1, target: 1 });
  assert.deepEqual(p.why_3, { value: 1, target: 3 });
  assert.deepEqual(p.all_done_10, { value: 0, target: 10 });
  assert.deepEqual(p.automaticity_4, { value: 0, target: 4 });
});
