// Notities per check-in, herstelmoment, week-/maandoverzicht en de volgorde van habits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayView } from '../../src/app/day-view.js';
import { buildHabitDetail } from '../../src/app/habit-detail.js';
import { buildPeriodOverview, buildWeekStrip, levelFor } from '../../src/app/overview.js';
import { byOrder, moveHabit } from '../../src/app/ordering.js';
import { logCheckIn } from '../../src/app/actions.js';
import { NOTE_MAX_LENGTH } from '../../src/domain/constants.js';
import { ValidationError } from '../../src/data/repository.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const habit = (id, over = {}) => validHabit({ id, name: id, startDate: '2026-10-01', schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }], ...over });
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ratings: [], ...over });
const entryOf = (view, id) => view.groups.flatMap((g) => g.entries).find((e) => e.habitId === id);
const done = (habitId, date) => ({ habitId, date, status: 'done' });

// --- notitie per check-in (F14) -------------------------------------------------------------------

test('notitie: wordt bewaard, opgeschoond en komt terug op Vandaag', async () => {
  const { repo } = testRepo();
  const h = await repo.saveHabit(validHabit({ name: 'Lezen' }));
  await logCheckIn(repo, { habitId: h.id, date: TODAY, status: 'done', note: '  Fijn rustig gelezen  ' }, TODAY);
  assert.equal((await repo.getCheckIn(h.id, TODAY)).note, 'Fijn rustig gelezen');

  const view = buildDayView({ snapshot: await repo.snapshot(), date: TODAY, today: TODAY });
  assert.equal(entryOf(view, h.id).noteToday, 'Fijn rustig gelezen');
});

test('notitie: leeg of alleen spaties wordt "geen notitie"; een afgevinkte habit zonder notitie heeft null', async () => {
  const { repo } = testRepo();
  const h = await repo.saveHabit(validHabit());
  await logCheckIn(repo, { habitId: h.id, date: TODAY, status: 'done', note: '   ' }, TODAY);
  assert.equal((await repo.getCheckIn(h.id, TODAY)).note, null);
  const view = buildDayView({ snapshot: await repo.snapshot(), date: TODAY, today: TODAY });
  assert.equal(entryOf(view, h.id).noteToday, null);
});

test('notitie: te lang en geen tekst worden geweigerd, precies de maximale lengte mag', async () => {
  const { repo } = testRepo();
  const h = await repo.saveHabit(validHabit());
  await assert.rejects(repo.setCheckIn({ habitId: h.id, date: TODAY, status: 'done', note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }), (e) => e instanceof ValidationError && e.errors[0].code === 'too_long');
  await assert.rejects(repo.setCheckIn({ habitId: h.id, date: TODAY, status: 'done', note: 42 }), (e) => e instanceof ValidationError && e.errors[0].code === 'invalid');
  await repo.setCheckIn({ habitId: h.id, date: TODAY, status: 'done', note: 'x'.repeat(NOTE_MAX_LENGTH) });
  assert.equal((await repo.getCheckIn(h.id, TODAY)).note.length, NOTE_MAX_LENGTH);
});

test('notitie: ongedaan maken zet de vorige notitie terug', async () => {
  const { repo } = testRepo();
  const h = await repo.saveHabit(validHabit());
  await logCheckIn(repo, { habitId: h.id, date: TODAY, status: 'done', note: 'eerste' }, TODAY);
  const { undo } = await logCheckIn(repo, { habitId: h.id, date: TODAY, status: 'minimal', note: 'tweede' }, TODAY);
  await undo();
  const back = await repo.getCheckIn(h.id, TODAY);
  assert.deepEqual([back.status, back.note], ['done', 'eerste']);
});

test('detailpagina: de laatste notities, nieuwste eerst, zonder lege', () => {
  const h = habit('h');
  const checkIns = [
    { habitId: 'h', date: '2026-10-10', status: 'done', note: 'oud' },
    { habitId: 'h', date: '2026-10-11', status: 'done', note: null },
    { habitId: 'h', date: '2026-10-12', status: 'skipped', note: 'ziek' },
    { habitId: 'h', date: '2026-10-13', status: 'done', note: '' },
    { habitId: 'h', date: '2026-10-14', status: 'done', note: 'goed' },
  ];
  const detail = buildHabitDetail({ habit: h, snapshot: snapshot({ checkIns }), today: TODAY });
  assert.deepEqual(detail.notes.map((n) => [n.date, n.note]), [['2026-10-14', 'goed'], ['2026-10-12', 'ziek'], ['2026-10-10', 'oud']]);
});

test('detailpagina: hoogstens vijf notities', () => {
  const checkIns = Array.from({ length: 9 }, (_, i) => ({ habitId: 'h', date: `2026-10-0${i + 1}`, status: 'done', note: `n${i}` }));
  assert.equal(buildHabitDetail({ habit: habit('h'), snapshot: snapshot({ checkIns }), today: TODAY }).notes.length, 5);
});

// --- herstelmoment (PLAN §2) ----------------------------------------------------------------------

const recovery = (h, checkIns, pauses = []) => entryOf(buildDayView({ snapshot: snapshot({ habits: [h], checkIns, pauses }), date: TODAY, today: TODAY }), h.id).recovery;

test('herstelmoment: de vorige geplande dag is gemist en vandaag is nog open', () => {
  assert.equal(recovery(habit('h', { startDate: '2026-10-10', schedules: [{ effectiveFrom: '2026-10-10', schedule: daily }] }), [done('h', '2026-10-12'), done('h', '2026-10-13')]), true);
});

test('herstelmoment: niet als gisteren gedaan, minimaal, overgeslagen of gepauzeerd was', () => {
  const h = habit('h', { startDate: '2026-10-10', schedules: [{ effectiveFrom: '2026-10-10', schedule: daily }] });
  const base = [done('h', '2026-10-13')];
  assert.equal(recovery(h, [...base, done('h', '2026-10-14')]), false);
  assert.equal(recovery(h, [...base, { habitId: 'h', date: '2026-10-14', status: 'minimal' }]), false);
  assert.equal(recovery(h, [...base, { habitId: 'h', date: '2026-10-14', status: 'skipped' }]), false);
  assert.equal(recovery(h, base, [{ habitId: 'h', from: '2026-10-14', to: '2026-10-14' }]), false);
});

test('herstelmoment: niet meer zodra je vandaag al iets hebt gelogd', () => {
  const h = habit('h', { startDate: '2026-10-10', schedules: [{ effectiveFrom: '2026-10-10', schedule: daily }] });
  assert.equal(recovery(h, [done('h', '2026-10-13'), done('h', TODAY)]), false);
});

const recoveryOn = (h, checkIns, date) => entryOf(buildDayView({ snapshot: snapshot({ habits: [h], checkIns }), date, today: TODAY }), h.id)?.recovery;

test('herstelmoment: kijk je vooruit en is vandaag nog niet afgevinkt, dan is er niets gemist en dus geen herstelmoment', () => {
  const h = habit('h', { startDate: '2026-10-10', schedules: [{ effectiveFrom: '2026-10-10', schedule: daily }] });
  const checkIns = [done('h', '2026-10-13')]; // vandaag (15 okt) is nog open, gisteren was gemist
  assert.equal(recoveryOn(h, checkIns, TODAY), true, 'vandaag zelf blijft een herstelmoment: gisteren is echt gemist');
  assert.equal(recoveryOn(h, checkIns, '2026-10-16'), false, 'morgen: vandaag is nog niet voorbij');
  assert.equal(recoveryOn(h, checkIns, '2026-10-18'), false, 'ook verder vooruit niet');
  assert.equal(recoveryOn(h, [done('h', '2026-10-14')], '2026-10-16'), false);
});

test('herstelmoment: bij vaste weekdagen telt de vorige geplande dag, niet gisteren', () => {
  // elke donderdag; de vorige donderdag (8 okt) is gemist
  const thursdays = habit('h', { startDate: '2026-10-01', schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'weekdays', weekdays: [3] } }] });
  assert.equal(recovery(thursdays, [done('h', '2026-10-01')]), true);
  assert.equal(recovery(thursdays, [done('h', '2026-10-01'), done('h', '2026-10-08')]), false);
});

test('herstelmoment: de allereerste dag en een nieuwe habit hebben er geen', () => {
  assert.equal(recovery(habit('h', { startDate: TODAY, schedules: [{ effectiveFrom: TODAY, schedule: daily }] }), []), false);
});

test('herstelmoment: flexibele habits (stapel) hebben het niet', () => {
  const weekly = habit('w', { schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period: 'week', count: 2 } }] });
  const view = buildDayView({ snapshot: snapshot({ habits: [weekly] }), date: TODAY, today: TODAY });
  assert.equal(view.pool.length, 1);
  assert.equal(view.pool[0].recovery, undefined);
});

// --- weekstrook (F16) -----------------------------------------------------------------------------

const two = [habit('a'), habit('b')];
const checkIns = [done('a', '2026-10-12'), done('b', '2026-10-12'), done('a', '2026-10-13')];

test('weekstrook: zeven dagen ma t/m zo met gedaan/gepland en een status per dag', () => {
  const strip = buildWeekStrip({ snapshot: snapshot({ habits: two, checkIns }), date: TODAY, today: TODAY });
  assert.equal(strip.length, 7);
  assert.deepEqual(strip.map((d) => d.date), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(strip.map((d) => d.state), ['all', 'some', 'none', 'open', 'future', 'future', 'future']);
  assert.deepEqual(strip.slice(0, 3).map((d) => [d.done, d.total]), [[2, 2], [1, 2], [0, 2]]);
});

test('weekstrook: markeert vandaag en de gekozen dag, en welke dagen je kunt openen', () => {
  const strip = buildWeekStrip({ snapshot: snapshot({ habits: two, checkIns }), date: '2026-10-13', today: TODAY });
  assert.deepEqual(strip.filter((d) => d.isSelected).map((d) => d.date), ['2026-10-13']);
  assert.deepEqual(strip.filter((d) => d.isToday).map((d) => d.date), [TODAY]);
  assert.ok(strip.every((d) => d.selectable));
  const old = buildWeekStrip({ snapshot: snapshot({ habits: two }), date: '2026-09-21', today: TODAY });
  assert.ok(old.every((d) => !d.selectable), 'buiten het terugwerkende venster (14 dagen)');
});

test('weekstrook: een dag zonder planning heet "empty"', () => {
  const strip = buildWeekStrip({ snapshot: snapshot({ habits: [habit('x', { schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'weekdays', weekdays: [0] } }] })] }), date: TODAY, today: TODAY });
  assert.deepEqual(strip.map((d) => d.state), ['none', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty']);
});

// --- week- en maandoverzicht (F21) ----------------------------------------------------------------

test('levelFor: 0 t/m 4, en -1 als er niets gepland was', () => {
  assert.deepEqual([[0, 0], [0, 4], [1, 4], [2, 4], [9, 10], [4, 4]].map(([d, t]) => levelFor({ done: d, total: t })), [-1, 0, 1, 2, 3, 4]);
  assert.equal(levelFor({ done: 1, total: 2 }), 2);
});

test('weekoverzicht: totalen tot en met vandaag; vorige en volgende periode zijn altijd vrij', () => {
  const o = buildPeriodOverview({ snapshot: snapshot({ habits: two, checkIns }), today: TODAY, period: 'week', anchor: TODAY });
  assert.equal(o.days.length, 7);
  assert.deepEqual([o.start, o.end], ['2026-10-12', '2026-10-18']);
  assert.deepEqual(o.totals, { done: 3, total: 8, percent: 38 }, 'ma t/m do telt; de toekomst niet');
  assert.equal(o.previous.anchor, '2026-10-05');
  assert.equal(o.next.anchor, '2026-10-19');
  assert.equal(o.planned, 14, 'ook wat na vandaag gepland staat');
  assert.deepEqual([o.isCurrent, o.isFuture], [true, false]);
});

test('maandoverzicht: een raster van hele weken, dagen buiten de maand tellen niet mee', () => {
  const o = buildPeriodOverview({ snapshot: snapshot({ habits: two, checkIns }), today: TODAY, period: 'month', anchor: '2026-10-20' });
  assert.deepEqual([o.start, o.end], ['2026-10-01', '2026-10-31']);
  assert.equal(o.days.length % 7, 0);
  assert.equal(o.days[0].date, '2026-09-28');
  assert.deepEqual(o.days.slice(0, 3).map((d) => d.state), ['outside', 'outside', 'outside']);
  assert.equal(o.days.at(-1).date, '2026-11-01');
  assert.equal(o.days.at(-1).state, 'outside');
  // 1 t/m 15 okt: 15 dagen × 2 habits, daarvan 3 gedaan
  assert.deepEqual(o.totals, { done: 3, total: 30, percent: 10 });
  assert.equal(o.previous.anchor, '2026-09-01', 'bladeren kan ook naar maanden zonder gegevens');
});

test('overzicht: een lege periode geeft geen percentage, en de toekomst telt alleen wat gepland staat', () => {
  const early = habit('e', { startDate: '2026-08-15', schedules: [{ effectiveFrom: '2026-08-15', schedule: daily }] });
  const future = buildPeriodOverview({ snapshot: snapshot({ habits: [early] }), today: TODAY, period: 'week', anchor: '2026-11-04' });
  assert.deepEqual([future.isFuture, future.isCurrent, future.totals.total, future.planned], [true, false, 0, 7]);
  const farBack = buildPeriodOverview({ snapshot: snapshot({ habits: [early] }), today: TODAY, period: 'month', anchor: '2020-01-10' });
  assert.deepEqual([farBack.start, farBack.planned], ['2020-01-01', 0]);
  const none = buildPeriodOverview({ snapshot: snapshot(), today: TODAY, period: 'week', anchor: TODAY });
  assert.equal(none.totals.percent, null);
  assert.ok(none.days.every((d) => d.state === 'empty'));
});

test('maandoverzicht: februari (28 dagen, begint op een zondag) vult het raster aan tot hele weken', () => {
  const o = buildPeriodOverview({ snapshot: snapshot(), today: '2026-10-15', period: 'month', anchor: '2026-02-10' });
  assert.deepEqual([o.start, o.end], ['2026-02-01', '2026-02-28']);
  assert.equal(o.days.length, 35); // ma 26 jan t/m zo 1 mrt
  assert.equal(o.days.filter((d) => d.inPeriod).length, 28);
  assert.equal(o.days[0].date, '2026-01-26');
});

// --- volgorde van habits (F7) ---------------------------------------------------------------------

const list = (...pairs) => pairs.map(([id, sortOrder]) => ({ id, name: id, sortOrder }));

test('volgorde: byOrder sorteert op sortOrder, dan op naam', () => {
  assert.deepEqual(list(['b', 1], ['a', 1], ['c', 0]).sort(byOrder).map((h) => h.id), ['c', 'a', 'b']);
});

test('volgorde: omhoog en omlaag verschuift één plek en nummert alles door', () => {
  const habits = list(['a', 0], ['b', 1], ['c', 2]);
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(moveHabit({ habits, visibleIds: ids, id: 'c', direction: -1 }), [{ id: 'c', sortOrder: 1 }, { id: 'b', sortOrder: 2 }]);
  assert.deepEqual(moveHabit({ habits, visibleIds: ids, id: 'a', direction: 1 }), [{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }]);
});

test('volgorde: bovenaan niet omhoog, onderaan niet omlaag, onbekend id doet niets', () => {
  const habits = list(['a', 0], ['b', 1]);
  assert.deepEqual(moveHabit({ habits, visibleIds: ['a', 'b'], id: 'a', direction: -1 }), []);
  assert.deepEqual(moveHabit({ habits, visibleIds: ['a', 'b'], id: 'b', direction: 1 }), []);
  assert.deepEqual(moveHabit({ habits, visibleIds: ['a', 'b'], id: 'zzz', direction: 1 }), []);
});

test('volgorde: gelijke sortOrder (alles 0) wordt netjes uit elkaar gehaald', () => {
  const habits = list(['a', 0], ['b', 0], ['c', 0]); // op naam: a, b, c
  const changes = moveHabit({ habits, visibleIds: ['a', 'b', 'c'], id: 'c', direction: -1 });
  const applied = habits.map((h) => ({ ...h, sortOrder: changes.find((c) => c.id === h.id)?.sortOrder ?? h.sortOrder })).sort(byOrder);
  assert.deepEqual(applied.map((h) => h.id), ['a', 'c', 'b']);
  assert.equal(new Set(applied.map((h) => h.sortOrder)).size, 3);
});

test('volgorde: verplaatsen binnen een zichtbare sectie laat habits in andere secties op hun plek', () => {
  // x en y zijn gearchiveerd (niet getoond) en staan er tussenin
  const habits = list(['a', 0], ['x', 1], ['b', 2], ['y', 3], ['c', 4]);
  const changes = moveHabit({ habits, visibleIds: ['a', 'b', 'c'], id: 'c', direction: -1 });
  const applied = habits.map((h) => ({ ...h, sortOrder: changes.find((c) => c.id === h.id)?.sortOrder ?? h.sortOrder })).sort(byOrder);
  const visibleOrder = applied.filter((h) => ['a', 'b', 'c'].includes(h.id)).map((h) => h.id);
  assert.deepEqual(visibleOrder, ['a', 'c', 'b']);
  assert.deepEqual(applied.map((h) => h.id).filter((id) => ['x', 'y'].includes(id)), ['x', 'y']);
});

test('overzicht: vandaag zonder iets gedaan is "open" (niet rood) tot er iets gedaan is, daarna telt het mee', () => {
  const strip = buildWeekStrip({ snapshot: snapshot({ habits: two }), date: TODAY, today: TODAY });
  assert.equal(strip.find((d) => d.isToday).state, 'open');
  const o = buildPeriodOverview({ snapshot: snapshot({ habits: two }), today: TODAY, period: 'week', anchor: TODAY });
  const today = o.days.find((d) => d.isToday);
  assert.equal(today.level, -1);
  const doneOne = buildPeriodOverview({ snapshot: snapshot({ habits: two, checkIns: [done('a', TODAY)] }), today: TODAY, period: 'week', anchor: TODAY });
  assert.equal(doneOne.days.find((d) => d.isToday).level, 2);
  assert.equal(buildWeekStrip({ snapshot: snapshot({ habits: two, checkIns: [done('a', TODAY)] }), date: TODAY, today: TODAY }).find((d) => d.isToday).state, 'some');
});
