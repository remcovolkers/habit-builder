import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHabitDetail, phaseBar, streakSpan } from '../../src/app/habit-detail.js';
import { pickTip } from '../../src/app/tips.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { checkAchievements } from '../../src/app/achievement-runner.js';
import {
  completeMonthTask, graduateHabit, rateAutomaticity, RuleError, saveMonthlyReview, saveWeeklyReview, setMaintenance,
} from '../../src/app/actions.js';
import { ValidationError } from '../../src/data/repository.js';
import { addDays, eachDay, isoWeek, localNow } from '../../src/domain/dates.js';
import {
  monthReviewClosesOn, monthReviewOpensOn, monthReviewState, monthTasks, reviewNudges, weekReviewClosesOn, weekReviewOpensOn, weekReviewState, weeksOfMonth,
} from '../../src/domain/reviews.js';
import { buildMonthReviewCard, buildWeekReviewCard } from '../../src/app/reviews.js';
import { TIPS } from '../../src/content/tips.js';
import { ACHIEVEMENT_INFO } from '../../src/content/achievements.js';
import { ACHIEVEMENT_KEYS } from '../../src/domain/achievements.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const doneRange = (habitId, from, to) => eachDay(from, to).map((date) => ({ habitId, date, status: 'done' }));

// --- tips en fasebalk ---------------------------------------------------------------------------

const tipFor = (over) => pickTip({ phase: 'building', activeDays: 30, graduationDays: 66, units: [], pausedNow: false, ...over });

test('tips: kiezen op fase, dag en recente misser', () => {
  assert.equal(tipFor({ phase: 'planned', activeDays: 0 }), 'planned');
  assert.equal(tipFor({ pausedNow: true }), 'paused');
  assert.equal(tipFor({ phase: 'established', activeDays: 90 }), 'maintain');
  assert.equal(tipFor({ phase: 'starting', activeDays: 3 }), 'start_small');
  assert.equal(tipFor({ phase: 'starting', activeDays: 7 }), 'start_small');
  assert.equal(tipFor({ phase: 'starting', activeDays: 8 }), 'dip');
  assert.equal(tipFor({ phase: 'starting', activeDays: 21 }), 'dip');
  assert.equal(tipFor({ activeDays: 22 }), 'cue');
  assert.equal(tipFor({ activeDays: 42 }), 'cue');
  assert.equal(tipFor({ activeDays: 43 }), 'identity');
  assert.equal(tipFor({ activeDays: 52 }), 'automatic');
  assert.equal(tipFor({ activeDays: 70 }), 'automatic');
});

test('tips: na een gemiste eenheid wint "nooit twee keer missen" (behalve bij ingeburgerd of pauze)', () => {
  const units = [{ status: 'done' }, { status: 'missed' }, { status: 'open' }];
  assert.equal(tipFor({ units, activeDays: 30 }), 'never_miss_twice');
  assert.equal(tipFor({ units, activeDays: 30, phase: 'established' }), 'maintain');
  assert.equal(tipFor({ units, activeDays: 30, pausedNow: true }), 'paused');
  assert.equal(tipFor({ units: [{ status: 'missed' }, { status: 'done' }], activeDays: 30 }), 'cue'); // alweer opgepakt
});

test('elke tip en elke prestatie heeft tekst', () => {
  for (const [key, tip] of Object.entries(TIPS)) assert.ok(tip.title && tip.text && tip.icon, key);
  for (const key of ACHIEVEMENT_KEYS) {
    const info = ACHIEVEMENT_INFO[key];
    assert.ok(info?.title && info.text && info.icon, key);
  }
});

test('fasebalk: vulling per fase en markerpositie', () => {
  const start = phaseBar({ activeDays: 0, graduationDays: 66, graduated: false });
  assert.deepEqual(start.fills, [0, 0, 0]);
  assert.equal(start.markerPercent, 0);
  const mid = phaseBar({ activeDays: 34, graduationDays: 66, graduated: false });
  assert.deepEqual(mid.fills.map((f) => Math.round(f * 100) / 100), [1, 0.29, 0]);
  assert.deepEqual(mid.sizes, [21, 45, 15]);
  const done = phaseBar({ activeDays: 200, graduationDays: 66, graduated: true });
  assert.deepEqual(done.fills, [1, 1, 1]);
  assert.ok(done.markerPercent <= 100);
  assert.deepEqual(phaseBar({ activeDays: 5, graduationDays: 100, graduated: false }).sizes, [21, 79, 15]);
});

// --- detailmodel --------------------------------------------------------------------------------

const snapshotFor = (habit, checkIns = [], ratings = [], pauses = []) => ({ checkIns, pauses, ratings, habits: [habit] });

test('streakSpan: dagen, weken of maanden', () => {
  const week = validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period: 'week', count: 2 } }] });
  assert.equal(streakSpan(validHabit(), [], TODAY), 'day');
  assert.equal(streakSpan(week, [], TODAY), 'week');
  assert.equal(streakSpan(week, [{ span: 'month' }], TODAY), 'month');
  assert.equal(streakSpan(validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'day_of_month', day: 3 } }] }), [], TODAY), 'month');
});

test('detail: een lopende habit na 76 dagen met goede cijfers', () => {
  const habit = validHabit({ id: 'h', startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule: daily }] });
  const detail = buildHabitDetail({ habit, snapshot: snapshotFor(habit, doneRange('h', '2026-08-01', '2026-10-14')), today: TODAY });
  assert.equal(detail.stats.activeDays, 76);
  assert.equal(detail.remainingDays, 0);
  assert.equal(detail.canGraduate, true);
  assert.equal(detail.streakSpan, 'day');
  assert.equal(detail.heatmap.weeks.length, 6);
  assert.equal(detail.pausedNow, false);
  assert.equal(detail.tipKey, 'automatic');
});

test('detail: nog niet toe aan ingeburgerd telt de resterende dagen af', () => {
  const habit = validHabit({ id: 'h', startDate: '2026-09-12', schedules: [{ effectiveFrom: '2026-09-12', schedule: daily }] });
  const detail = buildHabitDetail({ habit, snapshot: snapshotFor(habit, doneRange('h', '2026-09-12', '2026-10-14')), today: TODAY });
  assert.equal(detail.stats.activeDays, 34);
  assert.equal(detail.remainingDays, 32);
  assert.equal(detail.canGraduate, false);
});

test('detail: een taak 2× per maand telt de voortgang in keren en vraagt automatisme', () => {
  const twice = { type: 'times_per_period', period: 'month', count: 2 };
  const habit = validHabit({ id: 'h', startDate: '2026-06-01', schedules: [{ effectiveFrom: '2026-06-01', schedule: twice }] });
  const dates = ['2026-06-05', '2026-06-20', '2026-07-04', '2026-07-19', '2026-08-02', '2026-08-16'];
  const detail = buildHabitDetail({ habit, snapshot: snapshotFor(habit, dates.map((date) => ({ habitId: 'h', date, status: 'done' }))), today: TODAY });

  assert.deepEqual(detail.progress, { unit: 'times', value: 6, total: 8 });
  assert.equal(detail.remainingDays, 0); // ruim 66 dagen onderweg
  assert.equal(detail.remainingRepetitions, 2);
  assert.equal(detail.automaticityRequired, true);
  assert.equal(detail.useAutomaticity, false);
  assert.equal(detail.canGraduate, false);
  assert.deepEqual(detail.stats.graduation.criteria.map((c) => c.key), ['days', 'repetitions', 'consistency', 'automaticity']);
  assert.deepEqual(detail.phaseBar.sizes, [3, 5, 2]); // opstarten, opbouw en open einde in keren

  const daily7 = validHabit({ id: 'd', startDate: '2026-09-12', schedules: [{ effectiveFrom: '2026-09-12', schedule: daily }] });
  const dense = buildHabitDetail({ habit: daily7, snapshot: snapshotFor(daily7, doneRange('d', '2026-09-12', '2026-10-14')), today: TODAY });
  assert.deepEqual(dense.progress, { unit: 'days', value: 34, total: 66 });
  assert.equal(dense.automaticityRequired, false);
  assert.equal(dense.remainingRepetitions, 20); // 53 nodig, 33 gedaan
});

test('automatisme is optioneel maar wordt bindend zodra je een cijfer geeft (de laatste twee cijfers ≥ 4, of één na een geslaagde proef)', () => {
  const habit = validHabit({ id: 'h', startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule: daily }] });
  const checkIns = doneRange('h', '2026-08-01', '2026-10-14');
  const rate = (weekStart, score) => ({ habitId: 'h', weekStart, score });
  const base = (ratings) => buildHabitDetail({ habit, snapshot: snapshotFor(habit, checkIns, ratings), today: TODAY });

  assert.equal(base([]).canGraduate, true);
  assert.equal(base([]).useAutomaticity, false);
  const low = base([rate('2026-10-05', 3)]);
  assert.equal(low.canGraduate, false);
  assert.equal(low.useAutomaticity, true);
  assert.equal(base([rate('2026-09-28', 2), rate('2026-10-05', 4)]).canGraduate, false); // één keer 4 is te weinig
  assert.equal(base([rate('2026-09-28', 4), rate('2026-10-05', 5)]).canGraduate, true); // twee keer achter elkaar
  assert.equal(base([rate('2026-09-28', 5), rate('2026-10-05', 3)]).canGraduate, false); // het laatste cijfer telt
  assert.equal(base([rate('2026-09-21', 5), rate('2026-09-28', 3), rate('2026-10-05', 4)]).canGraduate, false);
  // een geslaagde proef zonder app telt als één van de twee keren
  const passed = { ...habit, trials: [{ period: 'week', start: '2026-09-28', end: '2026-10-04', result: 'passed', answeredOn: '2026-10-02' }] };
  assert.equal(buildHabitDetail({ habit: passed, snapshot: snapshotFor(passed, checkIns, [rate('2026-10-05', 4)]), today: TODAY }).canGraduate, true);
  assert.equal(buildHabitDetail({ habit: passed, snapshot: snapshotFor(passed, checkIns, [rate('2026-10-05', 3)]), today: TODAY }).canGraduate, false);
  assert.equal(base([rate('2026-10-12', 4)]).ratingThisWeek.score, 4); // huidige week = maandag 12 okt
  assert.equal(base([rate('2026-10-05', 4)]).ratingThisWeek, null);
});

test('detail: alleen een lopende habit kan ingeburgerd worden; gepauzeerd wordt herkend', () => {
  const habit = validHabit({ id: 'h', status: 'archived', endDate: '2026-10-01', startDate: '2026-07-01', schedules: [{ effectiveFrom: '2026-07-01', schedule: daily }] });
  const archived = buildHabitDetail({ habit, snapshot: snapshotFor(habit, doneRange('h', '2026-07-01', '2026-10-01')), today: TODAY });
  assert.equal(archived.canGraduate, false);

  const live = validHabit({ id: 'p', startDate: '2026-10-01', schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }] });
  const paused = buildHabitDetail({ habit: live, snapshot: snapshotFor(live, [], [], [{ habitId: 'p', from: '2026-10-14', to: null }]), today: TODAY });
  assert.deepEqual([paused.pausedNow, paused.tipKey], [true, 'paused']);
});

// --- acties --------------------------------------------------------------------------------------

test('graduateHabit en setMaintenance', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveHabit(validHabit());
  const done = await graduateHabit(repo, saved, TODAY);
  assert.deepEqual([done.status, done.graduatedAt, done.maintenance], ['graduated', TODAY, false]);
  await assert.rejects(() => graduateHabit(repo, done, TODAY), (e) => e instanceof RuleError && e.code === 'not_active');

  const kept = await setMaintenance(repo, done, true);
  assert.equal(kept.maintenance, true);
  assert.equal((await setMaintenance(repo, kept, false)).maintenance, false);
  await assert.rejects(() => setMaintenance(repo, { ...saved, status: 'active' }, true), (e) => e.code === 'not_graduated');
});

test('rateAutomaticity: huidige week, overschrijven, validatie', async () => {
  const { repo } = testRepo();
  await rateAutomaticity(repo, { habitId: 'h', score: 3 }, TODAY);
  await rateAutomaticity(repo, { habitId: 'h', score: 5 }, '2026-10-18'); // zondag, dezelfde week
  const ratings = await repo.listRatings('h');
  assert.equal(ratings.length, 1);
  assert.deepEqual([ratings[0].weekStart, ratings[0].score], ['2026-10-12', 5]);
  for (const score of [0, 6, 2.5, '4']) await assert.rejects(() => rateAutomaticity(repo, { habitId: 'h', score }, TODAY), ValidationError);
});

// 2026-10-16 is een vrijdag: de weekreview van 12 t/m 18 oktober staat open van vrijdag 16 oktober 00:00 tot maandag 19 oktober 12:00
const FRI = '2026-10-16T00:00';
const SUN = '2026-10-18T20:00';

test('reviewvensters: week vrijdag 00:00 tot maandag 12:00, maand de 25e 00:00 tot de 2e 12:00', () => {
  const week = (now) => weekReviewState('2026-10-12', now);
  assert.deepEqual(['2026-10-12T09:00', '2026-10-15T23:59'].map(week), ['before', 'before']);
  assert.deepEqual(['2026-10-16T00:00', '2026-10-17T14:00', SUN, '2026-10-19T11:59'].map(week), ['open', 'open', 'open', 'open']);
  assert.deepEqual(['2026-10-19T12:00', '2026-10-20T09:00', '2026-11-30T09:00'].map(week), ['closed', 'closed', 'closed']);
  const month = (now) => monthReviewState('2026-10-01', now);
  assert.deepEqual(['2026-10-01T09:00', '2026-10-24T23:59'].map(month), ['before', 'before']);
  assert.deepEqual(['2026-10-25T00:00', '2026-10-31T23:59', '2026-11-01T18:00', '2026-11-02T11:59'].map(month), ['open', 'open', 'open', 'open']);
  assert.deepEqual(['2026-11-02T12:00', '2026-11-15T09:00'].map(month), ['closed', 'closed']);
  // een korte maand: de 25e en de 2e liggen er ook in; de week die over de maandgrens loopt sluit gewoon op maandag
  assert.equal(monthReviewState('2026-02-01', '2026-02-25T00:00'), 'open');
  assert.equal(monthReviewState('2026-02-01', '2026-03-02T12:00'), 'closed');
  assert.equal(weekReviewState('2026-10-26', '2026-11-02T11:59'), 'open', 'de weekreview over de maandgrens heen sluit op maandag 2 november 12:00');
  assert.deepEqual([weekReviewOpensOn('2026-10-12'), weekReviewClosesOn('2026-10-12'), monthReviewOpensOn('2026-10-01'), monthReviewClosesOn('2026-10-01')], ['2026-10-16', '2026-10-19', '2026-10-25', '2026-11-02']);
});

test('localNow: de muurtijd in de tijdzone van de gebruiker, zonder dagwissel', () => {
  assert.equal(localNow(new Date('2026-10-16T22:30:00Z'), 'Europe/Amsterdam'), '2026-10-17T00:30');
  assert.equal(localNow(new Date('2026-10-16T22:30:00Z'), 'UTC'), '2026-10-16T22:30');
  assert.equal(localNow(new Date('2026-10-25T01:30:00Z'), 'Europe/Amsterdam'), '2026-10-25T02:30', 'de nacht dat de klok teruggaat');
  assert.equal(localNow(new Date('2026-10-16T00:05:00Z'), 'Europe/Amsterdam').slice(11), '02:05');
});

test('saveWeeklyReview: pas vanaf vrijdag en tot maandag 12:00, per week, overschrijven en lengtegrens', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => saveWeeklyReview(repo, { wentWell: 'x', wentBad: '' }, '2026-10-14', '2026-10-15T23:59'), (e) => e instanceof RuleError && e.code === 'review_locked');
  await saveWeeklyReview(repo, { wentWell: ' lezen ging goed ', wentBad: 'te laat naar bed' }, '2026-10-14', FRI); // een dag in de week is genoeg
  await saveWeeklyReview(repo, { wentWell: 'lezen ging goed', wentBad: 'te laat opgestaan' }, '2026-10-13', SUN);
  const reviews = await repo.listReviews();
  assert.equal(reviews.length, 1);
  assert.deepEqual([reviews[0].weekStart, reviews[0].wentBad], ['2026-10-12', 'te laat opgestaan']);
  assert.equal('adjust' in reviews[0], false, 'wat pas ik aan hoort niet meer bij de week');
  await saveWeeklyReview(repo, { wentWell: 'nog iets', wentBad: '' }, '2026-10-12', '2026-10-19T11:59'); // maandagochtend: nog open
  await assert.rejects(() => saveWeeklyReview(repo, { wentWell: 'te laat', wentBad: '' }, '2026-10-12', '2026-10-19T12:00'), (e) => e instanceof RuleError && e.code === 'review_closed');
  assert.equal((await repo.getReview('2026-10-12')).wentWell, 'nog iets', 'na het sluiten verandert er niets meer');
  await assert.rejects(() => saveWeeklyReview(repo, { wentWell: 'x', wentBad: 'y' }, '2026-10-05', '2026-10-17T10:00'), (e) => e.code === 'review_closed', 'een eerdere week alsnog invullen kan niet meer');
  await assert.rejects(() => saveWeeklyReview(repo, { wentWell: 'x'.repeat(1001), wentBad: '' }, '2026-10-12', SUN), ValidationError);
});

test('saveMonthlyReview: open van de 25e tot de 2e 12:00, per maand, en een andere tekst is een nieuwe afspraak', async () => {
  const { repo } = testRepo();
  const save = (adjust, now, date = '2026-10-20') => saveMonthlyReview(repo, { adjust }, date, now);
  await assert.rejects(() => save('vroeger opstaan', '2026-10-24T23:59'), (e) => e instanceof RuleError && e.code === 'review_locked');
  await save(' vroeger opstaan ', '2026-10-25T00:00');
  let review = await repo.getMonthReview('2026-10-01');
  assert.deepEqual([review.id, review.period, review.monthStart, review.adjust, review.appliedAt], ['month:2026-10', 'month', '2026-10-01', 'vroeger opstaan', null]);
  assert.equal((await repo.listReviews()).length, 1);
  await assert.rejects(() => save('   ', '2026-10-28T10:00'), ValidationError);
  await assert.rejects(() => save('x'.repeat(1001), '2026-10-28T10:00'), ValidationError);

  const done = await completeMonthTask(repo, { monthStart: '2026-10-01' }, '2026-11-01');
  assert.equal((await repo.getMonthReview('2026-10-01')).appliedAt, '2026-11-01');
  await save('vroeger opstaan', '2026-11-01T18:00'); // dezelfde tekst, in de eerste dagen van de nieuwe maand: het afvinken blijft
  assert.equal((await repo.getMonthReview('2026-10-01')).appliedAt, '2026-11-01');
  await done.undo();
  assert.equal((await repo.getMonthReview('2026-10-01')).appliedAt, null);
  await completeMonthTask(repo, { monthStart: '2026-10-01' }, '2026-11-01');
  await save('eerder naar bed', '2026-11-02T11:59');
  review = await repo.getMonthReview('2026-10-01');
  assert.deepEqual([review.adjust, review.appliedAt], ['eerder naar bed', null]);
  await assert.rejects(() => save('te laat', '2026-11-02T12:00'), (e) => e.code === 'review_closed');
  assert.equal((await repo.getMonthReview('2026-10-01')).adjust, 'eerder naar bed');
});

test('maandtaak: staat klaar vanaf de eerste van de volgende maand tot hij is afgevinkt', async () => {
  const { repo } = testRepo();
  await saveMonthlyReview(repo, { adjust: 'vroeger opstaan' }, '2026-10-20', '2026-10-28T10:00');
  await repo.saveReview({ weekStart: '2026-10-26', wentWell: 'a', wentBad: 'b' });
  const tasks = async (today) => monthTasks({ reviews: await repo.listReviews(), today });
  assert.deepEqual(await tasks('2026-10-31'), []);
  assert.deepEqual(await tasks('2026-11-01'), [{ monthStart: '2026-10-01', text: 'vroeger opstaan', availableFrom: '2026-11-01' }]);
  assert.equal((await tasks('2026-12-15')).length, 1, 'blijft staan tot hij is afgevinkt');
  await completeMonthTask(repo, { monthStart: '2026-10-01' }, '2026-11-03');
  assert.deepEqual(await tasks('2026-11-03'), []);
});

test('reviewNudges: de weekreview van vrijdag tot maandag 12:00, de maandreview van de 25e tot de 2e 12:00; ingevuld of gesloten = geen melding', () => {
  const nudges = (now, reviews = []) => reviewNudges({ reviews, now }).map((n) => `${n.kind}:${n.start}`);
  assert.deepEqual(nudges('2026-10-14T10:00'), [], 'woensdag, midden in de maand');
  assert.deepEqual(nudges('2026-10-15T23:59'), [], 'donderdag');
  assert.deepEqual(nudges('2026-10-16T00:00'), ['week:2026-10-12'], 'vrijdag');
  assert.deepEqual(nudges(SUN), ['week:2026-10-12']);
  assert.deepEqual(nudges('2026-10-19T11:59'), ['week:2026-10-12'], 'maandagochtend: de week ervoor is nog open');
  assert.deepEqual(nudges('2026-10-19T12:00'), [], 'maandag 12:00: gesloten, en de nieuwe week begint pas vrijdag');
  assert.deepEqual(nudges('2026-10-24T20:00'), ['week:2026-10-19'], 'zaterdag 24 oktober: de maandreview opent pas op 25 oktober');
  assert.deepEqual(nudges('2026-10-25T00:00'), ['week:2026-10-19', 'month:2026-10-01'], 'zondag 25 oktober: week en maand');
  assert.deepEqual(nudges('2026-10-29T10:00'), ['month:2026-10-01'], 'donderdag 29 oktober: alleen de maand');
  assert.deepEqual(nudges('2026-10-30T10:00'), ['week:2026-10-26', 'month:2026-10-01'], 'vrijdag 30 oktober: beide, eerst de week');
  assert.deepEqual(reviewNudges({ reviews: [], now: '2026-10-30T10:00' }).map((n) => n.closesOn), ['2026-11-02', '2026-11-02']);
  const week = { weekStart: '2026-10-26', wentWell: 'goed', wentBad: '' };
  const month = { id: 'month:2026-10', period: 'month', monthStart: '2026-10-01', adjust: 'vroeger opstaan', appliedAt: null };
  assert.deepEqual(nudges('2026-10-30T10:00', [week]), ['month:2026-10-01'], 'weekreview ingevuld');
  assert.deepEqual(nudges('2026-10-30T10:00', [week, month]), [], 'beide ingevuld');
  assert.deepEqual(nudges('2026-10-30T10:00', [{ weekStart: '2026-10-26', wentWell: '', wentBad: '', adjust: 'oud' }]), ['week:2026-10-26', 'month:2026-10-01'], 'een lege (oude) weekreview telt niet als ingevuld');
  assert.deepEqual(nudges('2026-11-02T11:59'), ['week:2026-10-26', 'month:2026-10-01'], 'maandag 2 november vóór 12:00: week en maand van vorige keer staan nog open');
  assert.deepEqual(nudges('2026-11-02T12:00'), [], 'daarna niets meer');
  assert.deepEqual(nudges('2026-11-24T10:00'), [], 'een maand van 30 dagen: de 25e is nog niet geweest');
  assert.deepEqual(nudges('2026-02-25T10:00'), ['month:2026-02-01'], 'februari (woensdag 25): de maandreview staat open, de week nog niet');
});

test('review-kaarten: de fase en de vensters per periode', () => {
  const snapshot = { reviews: [{ weekStart: '2026-10-12', wentWell: 'goed', wentBad: '' }] };
  const week = (date, now) => buildWeekReviewCard({ snapshot, now, date });
  assert.deepEqual([week('2026-10-14', '2026-10-14T10:00').state, week('2026-10-14', '2026-10-14T10:00').isCurrent], ['before', true]);
  assert.equal(week('2026-10-14', SUN).state, 'open');
  assert.equal(week('2026-10-14', '2026-10-19T12:00').state, 'closed');
  assert.equal(week('2026-10-14', SUN).review.wentWell, 'goed');
  assert.deepEqual([week('2026-10-21', SUN).state, week('2026-10-21', SUN).isCurrent, week('2026-10-21', SUN).review], ['before', false, null], 'een week in de toekomst');
  const month = (date, now) => buildMonthReviewCard({ snapshot, now, date });
  assert.deepEqual([month('2026-10-10', '2026-10-24T10:00').state, month('2026-10-10', '2026-10-25T10:00').state, month('2026-10-10', '2026-11-02T12:00').state], ['before', 'open', 'closed']);
  assert.equal(month('2026-10-10', '2026-10-25T10:00').weeks.length, 1);
  assert.equal(month('2026-12-10', '2026-10-25T10:00').isFuture, true);
});

test('weeksOfMonth: een week hoort bij de maand van zijn donderdag, dus bij precies één maand', () => {
  assert.deepEqual(weeksOfMonth('2026-10-01'), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(weeksOfMonth('2026-11-01'), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  assert.equal(isoWeek('2026-10-15'), 42);
  assert.equal(isoWeek('2026-01-01'), 1);
  assert.equal(isoWeek('2027-01-01'), 53);
});

// --- prestaties opslaan ------------------------------------------------------------------------------

test('unlockAchievement is idempotent en bewaart de eerste datum', async () => {
  const { repo } = testRepo();
  const first = await repo.unlockAchievement({ key: 'days_7', habitId: 'h', date: '2026-10-01' });
  const again = await repo.unlockAchievement({ key: 'days_7', habitId: 'h', date: '2026-10-09' });
  assert.equal(again.date, '2026-10-01');
  assert.equal(first.id, again.id);
  await repo.unlockAchievement({ key: 'first_checkin', date: '2026-10-01' });
  assert.equal((await repo.listAchievements()).length, 2);
  await assert.rejects(() => repo.unlockAchievement({ key: '', date: '2026-10-01' }), ValidationError);
});

test('checkAchievements: ontgrendelt, slaat op en geeft de tweede keer niets nieuws; blijft na wissen van data', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit({ startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule: daily }] }));
  for (const c of doneRange(habit.id, '2026-08-01', '2026-10-14')) await repo.setCheckIn(c);

  const first = await checkAchievements(repo, TODAY);
  assert.ok(first.some((a) => a.key === 'first_checkin'));
  assert.ok(first.some((a) => a.key === 'days_66' && a.habitId === habit.id));
  assert.deepEqual(await checkAchievements(repo, TODAY), []);

  for (const c of await repo.listCheckIns()) await repo.clearCheckIn(c.habitId, c.date);
  assert.deepEqual(await checkAchievements(repo, TODAY), []);
  assert.equal((await repo.listAchievements()).length, first.length); // niets afgenomen
});

test('checkAchievements: meerdere reviews achter elkaar geven de review-prestatie', async () => {
  const { repo } = testRepo();
  for (const week of ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']) await repo.saveReview({ weekStart: week, wentWell: 'a', wentBad: 'b' });
  const fresh = await checkAchievements(repo, TODAY);
  assert.ok(fresh.some((a) => a.key === 'review_streak_4'));
});

// --- back-up -----------------------------------------------------------------------------------------

async function filledRepo() {
  const { repo } = testRepo();
  const water = await repo.saveHabit(validHabit({ name: 'Water', counter: { unit: 'glazen', target: 8 }, schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }] }));
  const other = await repo.saveHabit(validHabit({ name: 'Lezen', sortOrder: 1 }));
  await repo.setCheckIn({ habitId: water.id, date: '2026-10-14', status: 'partial', value: 5 });
  await repo.setCheckIn({ habitId: other.id, date: '2026-10-14', status: 'skipped', note: 'ziek' });
  await repo.addPause({ habitId: other.id, from: '2026-10-10', to: '2026-10-11' });
  await repo.setDayPlan({ habitId: other.id, date: TODAY });
  await repo.setRating({ habitId: other.id, weekStart: '2026-10-12', score: 4 });
  await repo.saveReview({ weekStart: '2026-10-12', wentWell: 'goed', wentBad: 'laat' });
  await repo.unlockAchievement({ key: 'first_checkin', date: '2026-10-14' });
  await repo.saveSettings({ displayName: 'Remco', dayStartHour: 3 });
  return { repo, water, other };
}

test('export → import: alles komt identiek terug in een lege repository', async () => {
  const { repo } = await filledRepo();
  const before = await repo.snapshot();
  const json = JSON.stringify(buildExport(before, new Date('2026-10-15T08:00:00Z')));

  const parsed = parseImport(json);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.deepEqual(parsed.warnings, []);

  const { repo: fresh } = testRepo();
  await fresh.replaceAll(parsed.data);
  const after = await fresh.snapshot();
  const strip = (list) => list.map(({ createdAt, updatedAt, ...rest }) => rest).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const name of ['habits', 'checkIns', 'pauses', 'dayPlans', 'achievements', 'ratings', 'reviews']) {
    assert.deepEqual(strip(after[name]), strip(before[name]), name);
  }
  assert.equal(after.settings.displayName, 'Remco');
  assert.equal(after.settings.dayStartHour, 3);
});

test('back-up: een maandreview en een oude weekreview (met adjust) komen door de import, een kapotte niet', async () => {
  const { repo } = testRepo();
  await repo.saveMonthReview({ monthStart: '2026-09-01', adjust: 'vroeger opstaan' });
  await repo.saveReview({ weekStart: '2026-10-12', wentWell: 'goed', wentBad: 'laat' });
  const json = buildExport(await repo.snapshot(), new Date('2026-10-15T08:00:00Z'));
  json.data.reviews.push({ id: '2026-10-05', weekStart: '2026-10-05', wentWell: 'oud', adjust: 'oude aanpassing' });
  const parsed = parseImport(JSON.stringify(json));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.data.reviews.length, 3);
  json.data.reviews.push({ id: 'month:x', period: 'month', monthStart: 'kapot', adjust: 'x' });
  assert.equal(parseImport(JSON.stringify(json)).warnings.some((w) => /review/.test(w)), true);
});

test('export bevat metadata en geen verwijderde records', async () => {
  const { repo, other } = await filledRepo();
  await repo.deleteHabit(other.id);
  const exported = buildExport(await repo.snapshot(), new Date('2026-10-15T08:00:00Z'));
  assert.deepEqual([exported.app, exported.version, exported.exportedAt], ['habit-builder', 1, '2026-10-15T08:00:00.000Z']);
  assert.equal(exported.data.habits.length, 1);
  assert.ok(exported.data.habits.every((h) => !('deletedAt' in h)));
});

test('import vervangt wat er al was, ook als het bestand leeg is', async () => {
  const { repo } = await filledRepo();
  const empty = JSON.stringify({ app: 'habit-builder', version: 1, data: {} });
  const parsed = parseImport(empty);
  assert.equal(parsed.ok, true);
  await repo.replaceAll(parsed.data);
  const snap = await repo.snapshot();
  assert.deepEqual([snap.habits.length, snap.checkIns.length, snap.achievements.length], [0, 0, 0]);
  assert.equal(snap.settings.dayStartHour, 4); // terug naar standaard
});

test('import: foute bestanden worden netjes geweigerd', () => {
  assert.equal(parseImport('niet json').error, 'invalid_json');
  assert.equal(parseImport('[]').error, 'wrong_app');
  assert.equal(parseImport(JSON.stringify({ app: 'iets-anders', version: 1, data: {} })).error, 'wrong_app');
  assert.equal(parseImport(JSON.stringify({ app: 'habit-builder', version: 2, data: {} })).error, 'wrong_version');
  assert.equal(parseImport(JSON.stringify({ app: 'habit-builder', version: 1 })).error, 'invalid_data');
  assert.equal(parseImport(JSON.stringify({ app: 'habit-builder', version: 1, data: { habits: 'x' } })).error, 'invalid_data');
});

test('import: een ongeldige habit weigert het geheel; wees-records worden weggelaten met een waarschuwing', async () => {
  const { repo, water } = await filledRepo();
  const exported = buildExport(await repo.snapshot());

  const broken = structuredClone(exported);
  broken.data.habits[0].name = '';
  const refused = parseImport(JSON.stringify(broken));
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'invalid_data');
  assert.ok(refused.details.some((d) => d.includes('name.required')));

  const orphan = structuredClone(exported);
  orphan.data.checkIns.push({ id: 'x|2026-10-13', habitId: 'bestaat-niet', date: '2026-10-13', status: 'done' });
  orphan.data.checkIns.push({ id: `${water.id}|kapot`, habitId: water.id, date: 'kapot', status: 'done' });
  const ok = parseImport(JSON.stringify(orphan));
  assert.equal(ok.ok, true);
  assert.equal(ok.data.checkIns.length, exported.data.checkIns.length);
  assert.equal(ok.warnings.length, 2);
});

test('back-up: een cijfer met "wat hielp" en een habit met proeven komen door de export en import; foute waarden niet', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit({
    name: 'Tuin', trials: [{ period: 'week', start: '2026-10-05', end: '2026-10-11', result: 'passed', answeredOn: '2026-10-09' }],
  }));
  await repo.setRating({ habitId: habit.id, weekStart: '2026-10-12', score: 4, cues: ['routine', 'someone'] });
  const exported = buildExport(await repo.snapshot(), new Date('2026-10-15T08:00:00Z'));
  const parsed = parseImport(JSON.stringify(exported));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.deepEqual(parsed.data.ratings[0].cues, ['routine', 'someone']);
  assert.equal(parsed.data.habits[0].trials[0].result, 'passed');

  const badCues = structuredClone(exported);
  badCues.data.ratings[0].cues = ['magic'];
  assert.equal(parseImport(JSON.stringify(badCues)).warnings.some((w) => /cijfer/.test(w)), true, 'een cijfer met onbekende "wat hielp" valt weg met een waarschuwing');
  const badTrial = structuredClone(exported);
  badTrial.data.habits[0].trials[0].result = 'misschien';
  const refused = parseImport(JSON.stringify(badTrial));
  assert.equal(refused.ok, false);
  assert.ok(refused.details.some((d) => d.includes('trials.invalid')));
});

test('import: ongeldige instellingen en waarden worden geweigerd of weggelaten', async () => {
  const { repo } = await filledRepo();
  const exported = buildExport(await repo.snapshot());

  const badSettings = structuredClone(exported);
  badSettings.data.settings.dayStartHour = 9;
  assert.equal(parseImport(JSON.stringify(badSettings)).error, 'invalid_data');

  const badValue = structuredClone(exported);
  badValue.data.checkIns[0].value = -4;
  const parsed = parseImport(JSON.stringify(badValue));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.checkIns.length, exported.data.checkIns.length - 1);
  assert.equal(parsed.warnings.length, 1);
});

test('datumreeks helper blijft kloppen (sanity)', () => {
  assert.equal(addDays('2026-10-15', 1), '2026-10-16');
});
