import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayView } from '../../src/app/day-view.js';
import {
  formatDateLong, formatDateShort, formatSchedule, relativeDayLabel, datesBetween, greetingFor, localHour,
} from '../../src/app/format.js';
import { validHabit, TODAY } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const weekly = (count) => ({ type: 'times_per_period', period: 'week', count });
const habit = (id, over = {}) => validHabit({
  id, name: id, startDate: '2026-10-01',
  schedules: [{ effectiveFrom: '2026-10-01', schedule: daily }], ...over,
});
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ...over });
const names = (list) => list.map((e) => e.habit.name);

test('groepeert per dagdeel in vaste volgorde en laat lege groepen weg', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [
        habit('Avondwandeling', { daypart: 'evening' }),
        habit('Water', { daypart: 'morning', sortOrder: 1 }),
        habit('Lezen', { daypart: 'morning', sortOrder: 0 }),
      ],
    }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(view.groups.map((g) => g.daypart), ['morning', 'evening']);
  assert.deepEqual(names(view.groups[0].entries), ['Lezen', 'Water']);
});

test('voortgang telt gedaan en minimaal, en laat overgeslagen buiten het totaal', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [habit('A'), habit('B'), habit('C'), habit('D')],
      checkIns: [
        { habitId: 'A', date: TODAY, status: 'done' },
        { habitId: 'B', date: TODAY, status: 'minimal' },
        { habitId: 'C', date: TODAY, status: 'skipped' },
      ],
    }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(view.progress, { done: 2, total: 3 });
});

test('de stapel: sorteert open/risico eerst en klaar onderaan; ingepland verhuist naar de dag', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [
        habit('Klaar', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(1) }] }),
        habit('Rustig', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(1) }] }),
        habit('Meegenomen', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(1) }] }),
      ],
      checkIns: [{ habitId: 'Klaar', date: '2026-10-13', status: 'done' }],
      dayPlans: [{ habitId: 'Meegenomen', date: TODAY }],
    }),
    date: TODAY, today: TODAY,
  });
  assert.deepEqual(names(view.pool), ['Rustig', 'Klaar']);
  assert.equal(view.pool[1].satisfied, true);
  assert.deepEqual(names(view.groups.flatMap((g) => g.entries)), ['Meegenomen']);
});

test('modus en rechten: verleden, vandaag, toekomst en te lang geleden', () => {
  const base = { snapshot: snapshot({ habits: [habit('A')] }), today: TODAY };
  const today = buildDayView({ ...base, date: TODAY });
  assert.deepEqual([today.mode, today.canLog, today.canPlan], ['today', true, true]);
  const past = buildDayView({ ...base, date: '2026-10-12' });
  assert.deepEqual([past.mode, past.canLog, past.canPlan], ['past', true, false]);
  const edge = buildDayView({ ...base, date: '2026-10-01' });
  assert.equal(edge.canLog, true);
  const old = buildDayView({ ...base, date: '2026-09-30' });
  assert.deepEqual([old.mode, old.canLog], ['past', false]);
  const future = buildDayView({ ...base, date: '2026-10-17' });
  assert.deepEqual([future.mode, future.canLog, future.canPlan], ['future', false, true]);
});

test('een eerdere dag toont wat toen gepland stond, inclusief eerdere check-ins', () => {
  const view = buildDayView({
    snapshot: snapshot({
      habits: [habit('A')],
      checkIns: [{ habitId: 'A', date: '2026-10-12', status: 'done' }],
    }),
    date: '2026-10-12', today: TODAY,
  });
  assert.equal(view.groups[0].entries[0].doneToday, true);
  assert.deepEqual(view.progress, { done: 1, total: 1 });
});

test('hasHabits en een lege dag', () => {
  assert.equal(buildDayView({ snapshot: snapshot(), date: TODAY, today: TODAY }).hasHabits, false);
  const empty = buildDayView({ snapshot: snapshot({ habits: [habit('A', { status: 'archived' })] }), date: TODAY, today: TODAY });
  assert.deepEqual([empty.hasHabits, empty.groups, empty.pool], [true, [], []]);
});

// --- opmaak -----------------------------------------------------------------------------------

test('datums in het Nederlands', () => {
  assert.equal(formatDateLong('2026-10-15'), 'donderdag 15 oktober');
  assert.equal(formatDateShort('2026-10-15'), 'do 15 okt');
  assert.equal(formatDateShort('2026-12-01'), 'di 1 dec');
});

test('begroeting: morgen, middag en avond; het uur volgt de tijdzone', () => {
  assert.equal(greetingFor(0), 'Goedemorgen');
  assert.equal(greetingFor(11), 'Goedemorgen');
  assert.equal(greetingFor(12), 'Goedemiddag');
  assert.equal(greetingFor(17), 'Goedemiddag');
  assert.equal(greetingFor(18), 'Goedenavond');
  assert.equal(greetingFor(23), 'Goedenavond');
  const now = new Date('2026-10-15T20:00:00Z');
  assert.equal(localHour(now, 'Europe/Amsterdam'), 22); // CEST
  assert.equal(localHour(now, 'Pacific/Auckland'), 9);
  assert.equal(localHour(new Date('2026-10-15T22:30:00Z'), 'Europe/Amsterdam'), 0); // middernacht is 0, niet 24
});

test('relatieve dagen', () => {
  assert.equal(relativeDayLabel('2026-10-15', TODAY), 'Vandaag');
  assert.equal(relativeDayLabel('2026-10-14', TODAY), 'Gisteren');
  assert.equal(relativeDayLabel('2026-10-16', TODAY), 'Morgen');
  assert.equal(relativeDayLabel('2026-10-20', TODAY), 'di 20 okt');
});

test('schema-omschrijvingen', () => {
  assert.equal(formatSchedule({ type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }), 'Elke dag');
  assert.equal(formatSchedule({ type: 'weekdays', weekdays: [4, 3, 2, 1, 0] }), 'Werkdagen');
  assert.equal(formatSchedule({ type: 'weekdays', weekdays: [4, 0, 2] }), 'Ma, wo, vr');
  assert.equal(formatSchedule(weekly(2)), '2× per week');
  assert.equal(formatSchedule({ type: 'times_per_period', period: 'month', count: 3 }), '3× per maand');
  assert.equal(formatSchedule({ type: 'day_of_month', day: 15 }), 'Dag 15 van de maand');
});

test('datesBetween is inclusief', () => {
  assert.deepEqual(datesBetween('2026-10-30', '2026-11-01'), ['2026-10-30', '2026-10-31', '2026-11-01']);
});

// --- automatisme na het afvinken van een taak die niet vaak voorkomt -----------------------------------------------------

test('een afgevinkte taak 2× per maand vraagt om een cijfer, tot het voor die week is gegeven', () => {
  const rare = habit('Tuin', { schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period: 'month', count: 2 } }] });
  const base = { habits: [rare], checkIns: [{ habitId: 'Tuin', date: TODAY, status: 'done' }] };
  const entry = (extra = {}) => buildDayView({ snapshot: snapshot({ ...base, ...extra }), date: TODAY, today: TODAY }).groups[0].entries[0];

  assert.deepEqual(entry().automaticity, { score: null });
  assert.deepEqual(entry({ ratings: [{ habitId: 'Tuin', weekStart: '2026-10-12', score: 4 }] }).automaticity, { score: 4 });
  assert.deepEqual(entry({ ratings: [{ habitId: 'Tuin', weekStart: '2026-10-05', score: 4 }] }).automaticity, { score: null }); // een andere week telt niet
});

test('geen automatisme-vraag voor een dagelijkse taak, een taak die nog open staat of een ingeburgerde taak', () => {
  const view = (h, checkIns) => buildDayView({ snapshot: snapshot({ habits: [h], checkIns }), date: TODAY, today: TODAY });
  const doneToday = [{ habitId: 'A', date: TODAY, status: 'done' }];
  assert.equal(view(habit('A'), doneToday).groups[0].entries[0].automaticity, undefined);

  const rare = { schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'day_of_month', day: 3 } }] };
  assert.equal(view(habit('A', rare), []).groups[0].entries[0].automaticity, undefined); // nog niet gedaan
  assert.equal(view(habit('A', { ...rare, status: 'graduated', maintenance: true }), doneToday).groups[0].entries[0].automaticity, undefined);
});

test('een vaste dag in de maand die voorbij is en nog niet gedaan, staat als "te laat" (voor de uitleg op de kaart)', () => {
  const late = habit('Rekening', { schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'day_of_month', day: 3 } }] });
  const entry = buildDayView({ snapshot: snapshot({ habits: [late] }), date: TODAY, today: TODAY }).groups[0].entries[0];
  assert.equal(entry.overdue, true);
  assert.equal(entry.unit.due, '2026-10-03');
});

// --- "Niet in deze week" (Plan je week) -------------------------------------------------------------------------------------------------

test('"Niet in deze week": de taak staat die week niet in de stapel (en telt als weggehaald), de volgende week wel weer', () => {
  const flex = (id, over = {}) => habit(id, { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(2) }], ...over });
  const snap = snapshot({ habits: [flex('Blijft'), flex('Later', { noPlanWeek: '2026-10-12' })] }); // TODAY is donderdag 15 oktober; de week begint op 12 oktober
  const view = buildDayView({ snapshot: snap, date: TODAY, today: TODAY });
  assert.deepEqual(names(view.pool), ['Blijft']);
  assert.equal(view.poolSkipped, 1);
  assert.equal(buildDayView({ snapshot: snap, date: '2026-10-18', today: TODAY }).poolSkipped, 1, 'zondag is nog dezelfde week');
  const next = buildDayView({ snapshot: snap, date: '2026-10-19', today: TODAY });
  assert.deepEqual(names(next.pool).sort(), ['Blijft', 'Later'], 'maandag: een nieuwe week');
  assert.equal(next.poolSkipped, 0);
});

test('"Niet in deze week": een taak die al op een dag is ingepland of gedaan staat gewoon bij die dag', () => {
  const later = habit('Later', { schedules: [{ effectiveFrom: '2026-10-01', schedule: weekly(2) }], noPlanWeek: '2026-10-12' });
  const planned = buildDayView({ snapshot: snapshot({ habits: [later], dayPlans: [{ habitId: 'Later', date: TODAY }] }), date: TODAY, today: TODAY });
  assert.deepEqual(names(planned.groups.flatMap((g) => g.entries)), ['Later']);
  assert.equal(planned.poolSkipped, 0);
  const done = buildDayView({ snapshot: snapshot({ habits: [later], checkIns: [{ habitId: 'Later', date: TODAY, status: 'done' }] }), date: TODAY, today: TODAY });
  assert.deepEqual(names(done.groups.flatMap((g) => g.entries)), ['Later']);
});

// --- al ingepland op een andere dag (stapel op Vandaag) -----------------------------------------------------------------------------------

const flexHabit = (id, count = 2, period = 'week', over = {}) => habit(id, { schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period, count } }], ...over });
const poolOf = (snap, date = TODAY, today = TODAY) => buildDayView({ snapshot: snap, date, today }).pool;
const plan = (habitId, date) => ({ habitId, date });

test('een taak die al op een andere dag is ingepland weet wanneer, en is "covered" als alles een dag heeft', () => {
  // TODAY is donderdag 15 oktober
  const open = poolOf(snapshot({ habits: [flexHabit('A', 1)] }))[0];
  assert.deepEqual([open.plannedDates, open.missingToPlan, open.covered], [[], 1, false]);

  const one = poolOf(snapshot({ habits: [flexHabit('A', 1)], dayPlans: [plan('A', '2026-10-16')] }))[0];
  assert.deepEqual([one.plannedDates, one.missingToPlan, one.covered, one.urgent], [['2026-10-16'], 0, true, false]);

  const half = poolOf(snapshot({ habits: [flexHabit('A', 2)], dayPlans: [plan('A', '2026-10-18')] }))[0];
  assert.deepEqual([half.plannedDates, half.missingToPlan, half.covered], [['2026-10-18'], 1, false], 'twee keer nodig, één ingepland: "eerste keer ingepland"');

  const both = poolOf(snapshot({ habits: [flexHabit('A', 2)], dayPlans: [plan('A', '2026-10-18'), plan('A', '2026-10-16')] }))[0];
  assert.deepEqual([both.plannedDates, both.covered], [['2026-10-16', '2026-10-18'], true], 'gesorteerd, en alles gedekt');
});

test('een plan telt alleen vanaf de echte vandaag, in dezelfde week of maand en op een dag zonder check-in', () => {
  const snap = snapshot({
    habits: [flexHabit('A', 3)],
    dayPlans: [plan('A', '2026-10-13'), plan('A', '2026-10-16'), plan('A', '2026-10-17'), plan('A', '2026-10-20')],
    checkIns: [{ habitId: 'A', date: '2026-10-17', status: 'done' }],
  });
  const entry = poolOf(snap)[0];
  assert.deepEqual(entry.plannedDates, ['2026-10-16'], 'een plan van dinsdag (voorbij), een gelogde dag en een dag in de volgende week tellen niet');
  assert.equal(entry.count, 1);
  assert.equal(entry.missingToPlan, 1, '3 nodig, 1 gedaan, 1 ingepland');
});

test('de stapel van morgen: wat al op vrijdag of zondag staat toont wanneer in plaats van een plusknop; wat voor morgen zelf is gepland staat bij de dag', () => {
  const snap = snapshot({ habits: [flexHabit('A', 1), flexHabit('B', 1), flexHabit('C', 1)], dayPlans: [plan('A', '2026-10-18'), plan('B', '2026-10-16')] });
  const tomorrow = buildDayView({ snapshot: snap, date: '2026-10-16', today: TODAY });
  assert.deepEqual(names(tomorrow.pool), ['C', 'A'], 'open eerst, dan wat al is ingepland');
  assert.deepEqual(tomorrow.pool.map((e) => e.covered), [false, true]);
  assert.deepEqual(names(tomorrow.groups.flatMap((g) => g.entries)), ['B'], 'B is voor morgen zelf ingepland');
});

test('een volledig ingeplande taak dreigt niet te falen en zakt onder de rest, maar boven wat klaar is', () => {
  // 7× per week op donderdag: dreigt te falen, tenzij alles al een dag heeft
  const risky = flexHabit('Dreigt', 3, 'week', { sortOrder: 0 });
  const snap = (plans) => snapshot({ habits: [risky, flexHabit('Rustig', 1, 'month', { sortOrder: 1 }), flexHabit('Klaar', 1, 'month', { sortOrder: 2 })], checkIns: [{ habitId: 'Klaar', date: '2026-10-05', status: 'done' }], dayPlans: plans });
  const open = poolOf(snap([]));
  assert.equal(open[0].habit.name, 'Dreigt');
  assert.equal(open[0].urgent, true);
  const planned = poolOf(snap([plan('Dreigt', '2026-10-16'), plan('Dreigt', '2026-10-17'), plan('Dreigt', '2026-10-18')]));
  assert.deepEqual(names(planned), ['Rustig', 'Dreigt', 'Klaar'], 'open, dan ingepland, dan klaar');
  const dreigt = planned.find((e) => e.habit.name === 'Dreigt');
  assert.deepEqual([dreigt.covered, dreigt.urgent, dreigt.atRisk], [true, false, false]);
});

test('"Niet in deze week" gaat voor: zo\'n taak (ook 2× per maand) heeft geen kaart en dus geen "＋ Vandaag", tot de volgende week', () => {
  const monthly = flexHabit('Maand', 2, 'month', { noPlanWeek: '2026-10-12' });
  const snap = snapshot({ habits: [monthly] });
  assert.deepEqual(names(poolOf(snap)), [], 'donderdag');
  assert.deepEqual(names(poolOf(snap, '2026-10-16')), [], 'morgen kijken: nog dezelfde week');
  assert.deepEqual(names(poolOf(snap, '2026-10-19')), ['Maand'], 'maandag: weer een gewone kaart');
});

test('2× per maand, nog veel dagen over: één dag ingepland is genoeg ("ingepland"), de tweede plan je later; aan het eind van de maand niet', () => {
  const monthly = flexHabit('WC', 2, 'month');
  const one = buildDayView({ snapshot: snapshot({ habits: [monthly], dayPlans: [plan('WC', '2026-10-17')] }), date: TODAY, today: TODAY }).pool[0];
  assert.deepEqual([one.covered, one.missingToPlan], [true, 0]);
  const late = buildDayView({ snapshot: snapshot({ habits: [monthly], dayPlans: [plan('WC', '2026-10-30')] }), date: '2026-10-27', today: '2026-10-27' }).pool[0];
  assert.deepEqual([late.covered, late.missingToPlan], [false, 1], 'nog 5 dagen: beide moeten nu een dag');
});

test('"Dreigt te falen" voor een taak die halverwege de maand begint telt vanaf zijn start', () => {
  // 2× per maand, begonnen op de 19e: op de 19e is 100% van zijn periode over, niet 13 van 31 dagen
  const fresh = flexHabit('Nieuw', 2, 'month', { startDate: '2026-10-19' });
  const entry = buildDayView({ snapshot: snapshot({ habits: [fresh] }), date: '2026-10-19', today: '2026-10-19' }).pool[0];
  assert.equal(entry.urgent, false);
  const old = flexHabit('Oud', 2, 'month', { startDate: '2026-09-01' });
  assert.equal(buildDayView({ snapshot: snapshot({ habits: [old] }), date: '2026-10-19', today: '2026-10-19' }).pool[0].urgent, true, 'een taak die al de hele maand liep is wel krap');
});
