import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHabitDetail, phaseBar, streakSpan } from '../../src/app/habit-detail.js';
import { pickTip } from '../../src/app/tips.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { checkAchievements } from '../../src/app/achievement-runner.js';
import {
  graduateHabit, rateAutomaticity, RuleError, saveWeeklyReview, setMaintenance,
} from '../../src/app/actions.js';
import { ValidationError } from '../../src/data/repository.js';
import { addDays, eachDay } from '../../src/domain/dates.js';
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
  for (const [key, tip] of Object.entries(TIPS)) assert.ok(tip.title && tip.text && tip.emoji, key);
  for (const key of ACHIEVEMENT_KEYS) {
    const info = ACHIEVEMENT_INFO[key];
    assert.ok(info?.title && info.text && info.emoji, key);
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

test('automatisme is optioneel maar wordt bindend zodra je een cijfer geeft (laatste cijfer ≥ 4)', () => {
  const habit = validHabit({ id: 'h', startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule: daily }] });
  const checkIns = doneRange('h', '2026-08-01', '2026-10-14');
  const rate = (weekStart, score) => ({ habitId: 'h', weekStart, score });
  const base = (ratings) => buildHabitDetail({ habit, snapshot: snapshotFor(habit, checkIns, ratings), today: TODAY });

  assert.equal(base([]).canGraduate, true);
  assert.equal(base([]).useAutomaticity, false);
  const low = base([rate('2026-10-05', 3)]);
  assert.equal(low.canGraduate, false);
  assert.equal(low.useAutomaticity, true);
  assert.equal(base([rate('2026-09-28', 2), rate('2026-10-05', 4)]).canGraduate, true); // het laatste cijfer telt
  assert.equal(base([rate('2026-09-28', 5), rate('2026-10-05', 3)]).canGraduate, false);
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

test('saveWeeklyReview: per week, overschrijven en lengtegrens', async () => {
  const { repo } = testRepo();
  await saveWeeklyReview(repo, { wentWell: ' lezen ging goed ', adjust: 'eerder beginnen' }, TODAY);
  await saveWeeklyReview(repo, { wentWell: 'lezen ging goed', adjust: 'eerder opstaan' }, '2026-10-13');
  const reviews = await repo.listReviews();
  assert.equal(reviews.length, 1);
  assert.deepEqual([reviews[0].weekStart, reviews[0].adjust], ['2026-10-12', 'eerder opstaan']);
  await saveWeeklyReview(repo, { wentWell: 'x', adjust: 'y' }, '2026-10-05');
  assert.deepEqual((await repo.listReviews()).map((r) => r.weekStart), ['2026-10-12', '2026-10-05']); // nieuwste eerst
  await assert.rejects(() => saveWeeklyReview(repo, { wentWell: 'x'.repeat(1001), adjust: '' }, TODAY), ValidationError);
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
  for (const week of ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']) await repo.saveReview({ weekStart: week, wentWell: 'a', adjust: 'b' });
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
  await repo.saveReview({ weekStart: '2026-10-12', wentWell: 'goed', adjust: 'vroeger' });
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
