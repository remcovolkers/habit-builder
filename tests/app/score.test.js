// De weekpunten voor de ranglijst (docs/SOCIAAL.md §4): basis per taak, opbouwbonus, startbonus en minpunten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBonus, buildScoreSummary, scoreWindow } from '../../src/app/score.js';
import { addDays } from '../../src/domain/dates.js';
import {
  BUILD_BONUS_BUILDING, BUILD_BONUS_STARTING, MISS_GRACE, MISS_PENALTY, START_BONUS, START_BONUS_MAX, TASK_POINTS,
} from '../../src/domain/constants.js';

const TODAY = '2026-10-15'; // donderdag; het venster is 9 t/m 15 oktober
const ALL_DAYS = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const FLEX = { type: 'times_per_period', period: 'week', count: 2 };

/** Een habit van lang geleden: geen opbouwbonus meer. Met `early(id)` ook een eerste afvinkactie lang voor het venster (geen startbonus). */
const habit = (id, schedule = ALL_DAYS, extra = {}) => {
  const startDate = extra.startDate ?? '2025-01-01';
  return { id, name: id, icon: 'x', color: 'c1', daypart: 'anytime', status: 'active', startDate, endDate: null, sortOrder: 0, maintenance: false,
    schedules: [{ effectiveFrom: startDate, schedule }], ...extra };
};
const done = (habitId, date, status = 'done') => ({ habitId, date, status });
const early = (habitId, date = '2025-01-02') => done(habitId, date);
const days = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const summary = ({ habits = [], checkIns = [], pauses = [] } = {}, today = TODAY) =>
  buildScoreSummary({ snapshot: { habits, checkIns, pauses, dayPlans: [], ratings: [] }, today });
const WEEK = days('2026-10-09', TODAY);
const without = (list, ...skip) => list.filter((d) => !skip.includes(d));

test('het venster is de laatste 7 dagen, vandaag meegerekend', () => {
  assert.deepEqual(scoreWindow(TODAY), WEEK);
});

// ---- basis ---------------------------------------------------------------------------------------------------------------

test('elke afgeronde taak levert een vast aantal punten op', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...WEEK.map((d) => done('a', d))] });
  assert.equal(s.done, 7);
  assert.deepEqual(s.breakdown, { tasks: 7 * TASK_POINTS, bonus: 0, start: 0, penalty: 0 });
  assert.equal(s.points, 70);
});

test('afvinken vandaag geeft meteen punten', () => {
  const base = { habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, TODAY).map((d) => done('a', d))] };
  const before = summary(base);
  const after = summary({ ...base, checkIns: [...base.checkIns, done('a', TODAY)] });
  assert.equal(after.points - before.points, TASK_POINTS);
});

test('minimale versie telt als afgerond; overslaan levert niets op en kost niets', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-12', '2026-10-13').map((d) => done('a', d)), done('a', '2026-10-12', 'minimal'), done('a', '2026-10-13', 'skipped')] });
  assert.equal(s.done, 6);
  assert.equal(s.breakdown.penalty, 0);
  assert.equal(s.points, 60);
});

test('taken buiten het venster en in de toekomst tellen niet mee', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), done('a', '2026-10-08'), done('a', '2026-10-09'), done('a', '2026-10-16')] });
  assert.equal(s.done, 1);
});

test('een afgevinkte taak van een habit die niet meer bestaat telt niet mee', () => {
  assert.equal(summary({ habits: [habit('a')], checkIns: [early('a'), done('weg', '2026-10-14')] }).done, 0);
});

test('alles op één dag doen levert evenveel basispunten op als het over de week verspreiden', () => {
  const habits = ['a', 'b', 'c'].map((id) => habit(id, FLEX));
  const same = summary({ habits, checkIns: [...habits.map((h) => early(h.id)), ...habits.map((h) => done(h.id, '2026-10-14'))] });
  const spread = summary({ habits, checkIns: [...habits.map((h) => early(h.id)), done('a', '2026-10-11'), done('b', '2026-10-13'), done('c', '2026-10-15')] });
  assert.equal(same.breakdown.tasks, 3 * TASK_POINTS);
  assert.equal(spread.breakdown.tasks, same.breakdown.tasks);
});

test('zonder habits: nul punten en een lege samenvatting', () => {
  assert.deepEqual(summary(), { asOf: TODAY, points: 0, done: 0, streak: 0, activeHabits: 0, lastActive: null, breakdown: { tasks: 0, bonus: 0, start: 0, penalty: 0 } });
});

// ---- minpunten -----------------------------------------------------------------------------------------------------------

test('een enkele gemiste dag kost niets: een misser is toegestaan', () => {
  assert.equal(MISS_GRACE, 1);
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-12').map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, 0);
  assert.equal(s.points, 6 * TASK_POINTS);
});

test('twee dagen achter elkaar missen kost minpunten, vanaf de tweede', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-11', '2026-10-12').map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, MISS_PENALTY); // de 11e is gratis, de 12e kost
  assert.equal(s.points, 5 * TASK_POINTS - MISS_PENALTY);
});

test('een rij van drie missers kost twee keer; elke misser die direct op een misser volgt telt', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-11', '2026-10-12', '2026-10-13').map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, 2 * MISS_PENALTY);
});

test('na een afgeronde dag is de misser weer gratis: misser, gedaan, misser kost niets', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-10', '2026-10-12').map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, 0);
});

test('gedaan, misser, misser, gedaan, misser, misser: elke rij kost één keer', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), done('a', '2026-10-09'), done('a', '2026-10-12'), done('a', TODAY)] });
  // 10, 11 gemist (11 kost), 12 gedaan, 13, 14 gemist (14 kost)
  assert.equal(s.breakdown.penalty, 2 * MISS_PENALTY);
});

test('een misser vlak voor het venster telt mee als "de vorige keer"', () => {
  // de 8e en de 9e gemist: de 9e is de tweede achter elkaar en kost
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), done('a', '2026-10-07'), ...days('2026-10-10', TODAY).map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, MISS_PENALTY);
  // de 8e wel gedaan, de 9e gemist: gratis
  const lone = summary({ habits: [habit('a')], checkIns: [early('a'), done('a', '2026-10-08'), ...days('2026-10-10', TODAY).map((d) => done('a', d))] });
  assert.equal(lone.breakdown.penalty, 0);
});

test('overslaan tussen twee missers maakt ze niet los van elkaar: het onderbreekt de rij niet', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), done('a', '2026-10-11', 'skipped'), ...without(WEEK, '2026-10-10', '2026-10-11', '2026-10-12').map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, MISS_PENALTY); // 10 gemist (gratis), 11 overgeslagen, 12 gemist (kost)
});

test('de rij loopt per eenheid van de habit: bij vaste weekdagen zijn dat de geplande dagen, niet de dagen op de kalender', () => {
  const h = habit('w', { type: 'weekdays', weekdays: [0, 2, 4] }); // ma, wo, vr
  // in het venster: vr 9, ma 12, wo 14. Vr gedaan, ma en wo gemist: twee geplande dagen achter elkaar
  const s = summary({ habits: [h], checkIns: [early('w'), done('w', '2026-10-09')] });
  assert.equal(s.breakdown.penalty, MISS_PENALTY);
  // alleen ma gemist: gratis
  const lone = summary({ habits: [h], checkIns: [early('w'), done('w', '2026-10-09'), done('w', '2026-10-14')] });
  assert.equal(lone.breakdown.penalty, 0);
});

test('de ruimte geldt per habit: een misser bij twee verschillende habits op dezelfde dag kost niets', () => {
  const habits = [habit('a'), habit('b')];
  const checkIns = habits.flatMap((h) => [early(h.id), ...without(WEEK, '2026-10-12').map((d) => done(h.id, d))]);
  assert.equal(summary({ habits, checkIns }).breakdown.penalty, 0);
});

test('vandaag kost nooit minpunten: de dag is nog niet voorbij', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, TODAY).map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, 0);
  assert.equal(s.points, 60);
});

test('de minpunten van een dag komen pas als die dag voorbij is, en een nieuwe dag laat de rest staan', () => {
  // 9 t/m 13 gedaan, de 14e en 15e niet
  const state = { habits: [habit('a')], checkIns: [early('a'), ...days('2026-10-09', '2026-10-13').map((d) => done('a', d))] };
  assert.equal(summary(state, '2026-10-15').points, 50); // de 14e is de eerste misser (gratis), de 15e is nog open
  assert.equal(summary(state, '2026-10-16').points, 4 * TASK_POINTS - MISS_PENALTY); // de 15e is nu de tweede misser; de 9e schuift eruit
});

test('overslaan en pauze kosten niets', () => {
  const skipped = summary({ habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-12').map((d) => done('a', d)), done('a', '2026-10-12', 'skipped')] });
  assert.equal(skipped.breakdown.penalty, 0);
  const paused = summary({
    habits: [habit('a')], checkIns: [early('a'), ...days('2026-10-12', TODAY).map((d) => done('a', d))],
    pauses: [{ id: 'p', habitId: 'a', from: '2026-10-09', to: '2026-10-11' }],
  });
  assert.equal(paused.breakdown.penalty, 0);
});

test('terugwerkend invullen herstelt de minpunten: de gemiste dag levert punten op en kost niets meer', () => {
  const state = { habits: [habit('a')], checkIns: [early('a'), ...without(WEEK, '2026-10-11', '2026-10-12').map((d) => done('a', d))] };
  const fixed = { ...state, checkIns: [...state.checkIns, done('a', '2026-10-12')] };
  assert.equal(summary(fixed).points - summary(state).points, TASK_POINTS + MISS_PENALTY);
});

test('het totaal gaat nooit onder nul', () => {
  const s = summary({ habits: [habit('a'), habit('b')], checkIns: [early('a'), early('b')] });
  assert.equal(s.breakdown.penalty, 2 * 6 * MISS_PENALTY);
  assert.equal(s.points, 0);
});

test('een flexibele habit kost minpunten als de week eindigt zonder dat het doel gehaald is, per ontbrekende keer', () => {
  // de week 5 t/m 11 oktober eindigt in het venster; 2× per week was het doel
  const none = summary({ habits: [habit('f', FLEX)], checkIns: [early('f')] });
  assert.equal(none.breakdown.penalty, 2 * MISS_PENALTY);
  const one = summary({ habits: [habit('f', FLEX)], checkIns: [early('f'), done('f', '2026-10-07')] });
  assert.equal(one.breakdown.penalty, MISS_PENALTY);
  const met = summary({ habits: [habit('f', FLEX)], checkIns: [early('f'), done('f', '2026-10-07'), done('f', '2026-10-08')] });
  assert.equal(met.breakdown.penalty, 0);
});

test('een flexibele habit krijgt voor de lopende week nog niets te verwijten', () => {
  const s = summary({ habits: [habit('f', FLEX)], checkIns: [early('f'), done('f', '2026-10-05'), done('f', '2026-10-06')] });
  assert.equal(s.breakdown.penalty, 0); // vorige week gehaald, deze week loopt nog
});

test('een flexibele habit: een enkele gemiste week is gratis, twee weken achter elkaar niet', () => {
  // de week 5 t/m 11 oktober eindigt in het venster. De week ervoor (28 sep t/m 4 okt) was gehaald: deze misser is de eerste
  const previousMet = [early('f'), done('f', '2026-09-29'), done('f', '2026-09-30')];
  assert.equal(summary({ habits: [habit('f', FLEX)], checkIns: previousMet }).breakdown.penalty, 0);
  // ook die week gemist: twee weken achter elkaar, en het tekort van de tweede kost
  assert.equal(summary({ habits: [habit('f', FLEX)], checkIns: [early('f')] }).breakdown.penalty, 2 * MISS_PENALTY);
});

test('een gearchiveerde habit levert geen minpunten meer op, zijn taken tellen wel', () => {
  const archived = habit('a', ALL_DAYS, { status: 'archived', endDate: '2026-10-10' });
  const s = summary({ habits: [archived], checkIns: [early('a'), done('a', '2026-10-09'), done('a', '2026-10-10')] });
  assert.equal(s.breakdown.penalty, 0);
  assert.equal(s.done, 2);
});

// ---- teller ------------------------------------------------------------------------------------------------------------

test('een teller die je half haalde levert de helft op en kost geen minpunten', () => {
  const s = summary({ habits: [habit('w')], checkIns: [early('w'), ...without(WEEK, '2026-10-12').map((d) => done('w', d)), done('w', '2026-10-12', 'partial')] });
  assert.equal(s.done, 6);
  assert.equal(s.breakdown.tasks, 6 * TASK_POINTS + TASK_POINTS / 2);
  assert.equal(s.breakdown.penalty, 0);
});

test('een half gehaalde teller telt ook als geleverd werk (laatst actief)', () => {
  const s = summary({ habits: [habit('w')], checkIns: [early('w'), done('w', '2026-10-14', 'partial')] });
  assert.equal(s.lastActive, '2026-10-14');
});

// ---- opbouwbonus ---------------------------------------------------------------------------------------------------------

test('de opbouwbonus: een habit van 15 dagen oud geeft in de eerste 21 dagen extra per taak', () => {
  const h = habit('n', ALL_DAYS, { startDate: '2026-10-01' });
  const s = summary({ habits: [h], checkIns: [early('n', '2026-10-02'), ...WEEK.map((d) => done('n', d))] });
  assert.equal(s.breakdown.bonus, 7 * BUILD_BONUS_STARTING);
  assert.equal(s.points, 7 * (TASK_POINTS + BUILD_BONUS_STARTING));
});

test('de opbouwbonus wordt kleiner na dag 21 en verdwijnt bij dag 66', () => {
  const building = habit('b', ALL_DAYS, { startDate: '2026-08-20' }); // 51–57 dagen oud in het venster
  const a = summary({ habits: [building], checkIns: [early('b', '2026-08-21'), ...WEEK.map((d) => done('b', d))] });
  assert.equal(a.breakdown.bonus, 7 * BUILD_BONUS_BUILDING);
  const old = habit('o', ALL_DAYS, { startDate: '2026-06-01' }); // ouder dan 66 dagen
  const b = summary({ habits: [old], checkIns: [early('o', '2026-06-02'), ...WEEK.map((d) => done('o', d))] });
  assert.equal(b.breakdown.bonus, 0);
});

test('de overgang van "start" naar "opbouw" gaat per dag, niet per habit', () => {
  // start 25 september: 17 oktober is dag 23. Venster 11 t/m 17 oktober: de 11e t/m 15e (dag 17–21) tellen +4, de 16e en 17e (dag 22, 23) +2
  const h = habit('m', ALL_DAYS, { startDate: '2026-09-25' });
  const s = summary({ habits: [h], checkIns: [early('m', '2026-09-26'), ...days('2026-10-11', '2026-10-17').map((d) => done('m', d))] }, '2026-10-17');
  assert.equal(s.breakdown.bonus, 5 * BUILD_BONUS_STARTING + 2 * BUILD_BONUS_BUILDING);
});

test('gepauzeerde dagen tellen niet mee voor de leeftijd van de habit', () => {
  const h = habit('p', ALL_DAYS, { startDate: '2026-09-01' }); // 45 dagen oud, maar 30 gepauzeerd: dag 15 → startfase
  const pauses = [{ id: 'p', habitId: 'p', from: '2026-09-05', to: '2026-10-04' }];
  assert.equal(buildBonus({ habit: h, pauses, date: TODAY }), BUILD_BONUS_STARTING);
});

test('een ingeburgerd verklaarde habit geeft geen opbouwbonus meer, ook niet voor de dagen daarna', () => {
  const h = habit('g', ALL_DAYS, { startDate: '2026-09-15', status: 'graduated', graduatedAt: '2026-10-01', maintenance: true });
  const s = summary({ habits: [h], checkIns: [early('g', '2026-09-16'), ...WEEK.map((d) => done('g', d))] });
  assert.equal(s.breakdown.bonus, 0);
});

test('een habit met een eigen ingeburgerd-grens (graduationDays) volgt die grens', () => {
  const h = habit('s', ALL_DAYS, { startDate: '2026-09-01', graduationDays: 30 }); // 45 dagen oud, grens 30
  assert.equal(buildBonus({ habit: h, pauses: [], date: TODAY }), 0);
});

// ---- startbonus ----------------------------------------------------------------------------------------------------------

test('een nieuwe habit geeft een startbonus bij de eerste afgeronde taak, hoogstens drie per venster', () => {
  assert.equal(START_BONUS_MAX, 3);
  const habits = ['a', 'b', 'c', 'd'].map((id) => habit(id, ALL_DAYS, { startDate: '2026-10-13' }));
  const s = summary({ habits, checkIns: habits.flatMap((h) => days('2026-10-13', TODAY).map((d) => done(h.id, d))) });
  assert.equal(s.breakdown.start, START_BONUS_MAX * START_BONUS); // de vierde habit krijgt niets meer
  assert.equal(s.breakdown.tasks, 12 * TASK_POINTS);
  assert.equal(s.breakdown.bonus, 12 * BUILD_BONUS_STARTING);
});

test('twee nieuwe habits geven twee startbonussen', () => {
  const habits = ['a', 'b'].map((id) => habit(id, ALL_DAYS, { startDate: '2026-10-13' }));
  const s = summary({ habits, checkIns: habits.flatMap((h) => days('2026-10-13', TODAY).map((d) => done(h.id, d))) });
  assert.equal(s.breakdown.start, 2 * START_BONUS);
});

test('aanmaken zonder afvinken geeft geen startbonus', () => {
  const s = summary({ habits: [habit('a', ALL_DAYS, { startDate: '2026-10-13' })] });
  assert.equal(s.breakdown.start, 0);
});

test('een habit die al eerder is afgevinkt geeft geen startbonus meer', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), done('a', '2026-10-14')] });
  assert.equal(s.breakdown.start, 0);
});

test('elke dag een nieuwe habit starten en één keer afvinken loont nauwelijks: de gemiste dagen na de eerste misser trekken het af', () => {
  const farm = WEEK.map((d, i) => habit(`farm${i}`, ALL_DAYS, { startDate: d }));
  const s = summary({ habits: farm, checkIns: farm.map((h, i) => done(h.id, WEEK[i])) });
  const honest = summary({ habits: [habit('a')], checkIns: [early('a'), ...WEEK.map((d) => done('a', d))] });
  assert.equal(s.breakdown.penalty, 10 * MISS_PENALTY); // per habit is de eerste misser gratis, de rest kost
  assert.equal(s.breakdown.start, START_BONUS_MAX * START_BONUS);
  // met een startbonus voor drie habits levert knoeien een paar punten meer op dan trouw één habit doen; meer dan dat niet
  assert.ok(s.points <= honest.points + START_BONUS, `${s.points} is meer dan ${honest.points} + ${START_BONUS}`);
});

// ---- rest van de samenvatting --------------------------------------------------------------------------------------------

test('het aantal actieve habits telt wie vandaag meetelt (geen gearchiveerde, geen toekomstige)', () => {
  const habits = [habit('a'), habit('b', ALL_DAYS, { status: 'archived' }), habit('c', ALL_DAYS, { startDate: '2026-10-20' })];
  assert.equal(summary({ habits }).activeHabits, 1);
});

test('laatst actief: de laatste afgevinkte dag; overslaan en de toekomst tellen niet', () => {
  const checkIns = [done('a', '2026-10-11'), done('a', '2026-10-13', 'skipped'), done('a', '2026-10-20')];
  assert.equal(summary({ habits: [habit('a')], checkIns }).lastActive, '2026-10-11');
  assert.equal(summary({ habits: [habit('a')] }).lastActive, null);
});

test('reeks: opeenvolgende gedane dagen; vandaag nog open breekt hem niet, een gemiste dag wel', () => {
  const run = (dates) => summary({ habits: [habit('a')], checkIns: dates.map((d) => done('a', d)) }).streak;
  assert.equal(run(['2026-10-12', '2026-10-13', '2026-10-14']), 3);
  assert.equal(run(['2026-10-12', '2026-10-13', '2026-10-14', TODAY]), 4);
  assert.equal(run(['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14']), 3);
  assert.equal(run([]), 0);
});

test('reeks: een flexibele habit geeft geen reeks in dagen', () => {
  assert.equal(summary({ habits: [habit('f', FLEX)], checkIns: [done('f', '2026-10-13'), done('f', '2026-10-14')] }).streak, 0);
});

test('de samenvatting bevat alleen getallen en datums: geen namen, notities of ids', () => {
  const s = summary({ habits: [habit('a')], checkIns: [early('a'), { ...done('a', '2026-10-14'), note: 'geheim' }] });
  assert.deepEqual(Object.keys(s).sort(), ['activeHabits', 'asOf', 'breakdown', 'done', 'lastActive', 'points', 'streak']);
  assert.ok(!JSON.stringify(s).includes('geheim'));
  assert.ok(Object.values(s.breakdown).every(Number.isFinite));
});

test('het totaal is altijd basis + bonus + start − minpunten, met een ondergrens van nul', () => {
  const s = summary({ habits: [habit('a', ALL_DAYS, { startDate: '2026-10-10' })], checkIns: [done('a', '2026-10-10'), done('a', '2026-10-11'), done('a', '2026-10-13')] });
  const b = s.breakdown;
  assert.equal(s.points, Math.max(0, b.tasks + b.bonus + b.start - b.penalty));
});

// ---- snelheid ------------------------------------------------------------------------------------------------------------

test('een jaar aan gegevens: de berekening is snel genoeg om op de achtergrond mee te lopen', () => {
  const start = addDays(TODAY, -300);
  const habits = Array.from({ length: 15 }, (_, i) => habit(`h${i}`, i % 3 === 0 ? FLEX : ALL_DAYS, { startDate: start }));
  const checkIns = habits.flatMap((h) => days(start, TODAY).filter((_, i) => i % 2 === 0).map((d) => done(h.id, d)));
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) summary({ habits, checkIns });
  const each = (performance.now() - t0) / 5;
  assert.ok(each < 200, `te traag: ${each.toFixed(0)} ms per berekening`);
});

// ---- opbouwbonus bij een taak die niet vaak voorkomt ---------------------------------------------------------------------

const TWICE_A_MONTH = { type: 'times_per_period', period: 'month', count: 2 };

test('een taak 2× per maand telt de opbouwbonus per keer: de eerste keren +4, daarna +2 tot de achtste, daarna niets', () => {
  const h = habit('m', TWICE_A_MONTH, { startDate: '2026-05-01' }); // ruim 66 dagen oud: op dagen zou er al geen bonus meer zijn
  const bonusFor = (repetition) => buildBonus({ habit: h, pauses: [], date: TODAY, repetition });
  assert.deepEqual([1, 3].map(bonusFor), [BUILD_BONUS_STARTING, BUILD_BONUS_STARTING]);
  assert.deepEqual([4, 8].map(bonusFor), [BUILD_BONUS_BUILDING, BUILD_BONUS_BUILDING]);
  assert.equal(bonusFor(9), 0);
  assert.equal(buildBonus({ habit: h, pauses: [], date: TODAY }), 0); // zonder telling: de leeftijd in dagen, zoals voorheen
});

test('in het venster telt het hoeveelste afgeronde keer het is, ook als eerdere keren buiten het venster liggen', () => {
  const h = habit('m', TWICE_A_MONTH, { startDate: '2026-05-01' });
  const first = summary({ habits: [h], checkIns: [done('m', '2026-10-10')] });
  assert.equal(first.breakdown.bonus, BUILD_BONUS_STARTING); // eerste keer
  const fourth = summary({ habits: [h], checkIns: [done('m', '2026-05-05'), done('m', '2026-06-03'), done('m', '2026-07-04'), done('m', '2026-10-10')] });
  assert.equal(fourth.breakdown.bonus, BUILD_BONUS_BUILDING);
  const tenth = summary({ habits: [h], checkIns: [...days('2026-05-01', '2026-05-09').map((d) => done('m', d)), done('m', '2026-10-10')] });
  assert.equal(tenth.breakdown.bonus, 0);
});

test('een dagelijkse habit blijft op leeftijd in dagen rekenen', () => {
  const h = habit('d', ALL_DAYS, { startDate: '2026-10-01' });
  assert.equal(buildBonus({ habit: h, pauses: [], date: TODAY, repetition: 40 }), BUILD_BONUS_STARTING);
});
