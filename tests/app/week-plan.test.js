// "Plan je week": de rijen per flexibele taak en het voorstel dat de ontbrekende keren verdeelt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekPlan, planningStart, suggestPlan } from '../../src/app/week-plan.js';
import { lastChanceThisWeek, neededInWindow } from '../../src/domain/planning.js';
import { applyHabitForm, setPlanSkip } from '../../src/app/actions.js';
import { validateHabit } from '../../src/domain/habit.js';
import { testRepo, validHabit } from './helpers.js';

const THURSDAY = '2026-10-15';
const flexible = (id, count = 2, period = 'week', over = {}) => validHabit({
  id, name: `Taak ${id}`, startDate: '2026-09-01', schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'times_per_period', period, count } }], ...over,
});
const snap = ({ habits, checkIns = [], dayPlans = [], pauses = [] }) => ({ habits, checkIns, dayPlans, pauses });
const row = (rows, id) => rows.find((r) => r.habit.id === id);
const states = (r) => r.days.map((d) => `${d.date.slice(8)}:${d.state}`).join(' ');

test('alleen flexibele taken krijgen een rij; vaste dagen en een dag van de maand niet', () => {
  const fixed = validHabit({ id: 'v' });
  const monthDay = validHabit({ id: 'd', schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'day_of_month', day: 25 } }], startDate: '2026-09-01' });
  const rows = buildWeekPlan({ snapshot: snap({ habits: [fixed, monthDay, flexible('a')] }), today: THURSDAY });
  assert.deepEqual(rows.map((r) => r.habit.id), ['a']);
});

test('een rij toont de week vanaf maandag en zeven dagen vooruit, en wat er al gedaan of gepland is', () => {
  const rows = buildWeekPlan({
    snapshot: snap({
      habits: [flexible('a')],
      checkIns: [{ habitId: 'a', date: THURSDAY, status: 'done' }, { habitId: 'a', date: '2026-10-13', status: 'done' }],
      dayPlans: [{ habitId: 'a', date: '2026-10-17' }],
    }),
    today: THURSDAY,
  });
  const a = row(rows, 'a');
  assert.equal(a.days.length, 11, 'maandag t/m vandaag, en zeven dagen vooruit (PLAN_AHEAD_DAYS)');
  assert.equal(states(a).startsWith('12:past 13:done 14:past 15:done 16:free 17:planned 18:free'), true, states(a));
  assert.deepEqual(a.days.map((d) => d.inUnit), [true, true, true, true, true, true, true, false, false, false, false], 'tot en met zondag hoort bij deze week');
  assert.deepEqual([a.unit.count, a.unit.target, a.planned, a.missing], [2, 2, 1, 0], 'twee gedaan en één gepland: de afspraak is dekkend');
});

test('wat nog ontbreekt, gepauzeerde en overgeslagen dagen en een taak die dreigt te falen', () => {
  const rows = buildWeekPlan({
    snapshot: snap({
      habits: [flexible('a'), flexible('b', 1)],
      checkIns: [{ habitId: 'a', date: '2026-10-16', status: 'skipped' }],
      pauses: [{ habitId: 'b', from: '2026-10-17', to: '2026-10-18' }],
    }),
    today: THURSDAY,
  });
  assert.equal(row(rows, 'a').missing, 2);
  assert.equal(row(rows, 'a').urgent, true, 'donderdag 0 van 2 is krap');
  assert.equal(row(rows, 'a').days[4].state, 'blocked');
  assert.deepEqual(row(rows, 'b').days.slice(5, 7).map((d) => d.state), ['blocked', 'blocked']);
});

test('voorstel: donderdag 0 van 2 geeft donderdag en zondag (zo ver mogelijk uit elkaar), en niets buiten de week', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(rows), [{ habitId: 'a', date: '2026-10-15' }, { habitId: 'a', date: '2026-10-18' }]);
});

test('voorstel: één keer gedaan op maandag en één nodig geeft donderdag (drie dagen later), niet de laatste dag', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')], checkIns: [{ habitId: 'a', date: '2026-10-12', status: 'done' }] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(rows), [{ habitId: 'a', date: '2026-10-15' }]);
});

test('voorstel: twee taken die elk één keer nodig hebben komen niet op dezelfde dag', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a', 1), flexible('b', 1)] }), today: THURSDAY });
  const picks = suggestPlan(rows);
  assert.equal(picks.length, 2);
  assert.notEqual(picks[0].date, picks[1].date);
});

test('voorstel: wat al gepland of gedaan is wordt niet nog eens voorgesteld, en een taak die klaar is krijgt niets', () => {
  const done = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')], checkIns: [{ habitId: 'a', date: '2026-10-12', status: 'done' }, { habitId: 'a', date: '2026-10-13', status: 'done' }] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(done), []);
  const planned = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')], dayPlans: [{ habitId: 'a', date: '2026-10-16' }, { habitId: 'a', date: '2026-10-18' }] }), today: THURSDAY });
  assert.deepEqual(suggestPlan(planned), []);
});

test('voorstel: met minder vrije dagen dan nodig komt er alleen op wat vrij is', () => {
  const rows = buildWeekPlan({
    snapshot: snap({ habits: [flexible('a', 3)], checkIns: [{ habitId: 'a', date: '2026-10-16', status: 'skipped' }, { habitId: 'a', date: '2026-10-17', status: 'skipped' }] }),
    today: THURSDAY,
  });
  const picks = suggestPlan(rows);
  assert.deepEqual(picks.map((p) => p.date).sort(), ['2026-10-15', '2026-10-18']);
});

test('een taak per maand: de dagen van deze week tellen mee voor de maand', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('m', 2, 'month')] }), today: THURSDAY });
  const m = row(rows, 'm');
  assert.equal(m.unit.span, 'month');
  assert.equal(m.days.every((d) => d.inUnit), true);
  assert.equal(m.missing, 1, '2× per maand en nog 17 dagen over: nu alleen je deel van het venster (1), de tweede plan je later');
  assert.equal(suggestPlan(rows).length, 1);
});

test('een gepauzeerde taak heeft geen rij: niet in het blad, niet meegeteld en niet voorgesteld', () => {
  const habits = [flexible('a'), flexible('p')];
  const rows = buildWeekPlan({ snapshot: snap({ habits, pauses: [{ habitId: 'p', from: '2026-10-14', to: null }] }), today: THURSDAY });
  assert.deepEqual(rows.map((r) => r.habit.id), ['a']);
  assert.deepEqual(suggestPlan(rows).map((p) => p.habitId), ['a', 'a']);
});

test('een pauze die al verlopen is telt niet; een pauze die later in de week begint laat de rij staan met geblokkeerde dagen', () => {
  const habits = [flexible('x'), flexible('y')];
  const rows = buildWeekPlan({
    snapshot: snap({ habits, pauses: [{ habitId: 'x', from: '2026-10-05', to: '2026-10-09' }, { habitId: 'y', from: '2026-10-17', to: null }] }),
    today: THURSDAY,
  });
  assert.deepEqual(rows.map((r) => r.habit.id), ['x', 'y']);
  assert.deepEqual(row(rows, 'y').days.slice(5).map((d) => d.state).every((s) => s === 'blocked'), true);
  assert.equal(row(rows, 'y').free, 2, 'donderdag en vrijdag zijn nog vrij');
  assert.equal(row(rows, 'x').free, 4);
});

test('de teller telt alleen taken die nog dagen nodig hebben en waarvoor nog een vrije dag is', () => {
  const rows = buildWeekPlan({
    snapshot: snap({ habits: [flexible('a'), flexible('b')], checkIns: [{ habitId: 'b', date: '2026-10-16', status: 'skipped' }, { habitId: 'b', date: '2026-10-17', status: 'skipped' }, { habitId: 'b', date: '2026-10-18', status: 'skipped' }, { habitId: 'b', date: THURSDAY, status: 'skipped' }] }),
    today: THURSDAY,
  });
  assert.deepEqual(rows.filter((r) => r.missing > 0 && r.free > 0).map((r) => r.habit.id), ['a'], 'b heeft in deze week geen vrije dag meer');
});

// --- "Niet in deze week" -----------------------------------------------------------------------------------------------------------

test('"Niet in deze week": de taak blijft in het blad (met skipped), maar telt niet mee voor de herinnering en krijgt geen voorstel', () => {
  const habits = [flexible('a'), flexible('later', 2, 'month', { noPlanWeek: '2026-10-12' })];
  const rows = buildWeekPlan({ snapshot: snap({ habits }), today: THURSDAY });
  assert.deepEqual(rows.map((r) => [r.habit.id, r.skipped]), [['a', false], ['later', true]]);
  assert.equal(row(rows, 'later').missing, 1, 'de afspraak zelf verandert niet: er moet nog steeds iets gebeuren (voor deze week: 1 van de 2 per maand)');
  assert.deepEqual(rows.filter((r) => r.missing > 0 && r.free > 0 && !r.skipped).map((r) => r.habit.id), ['a'], 'wat countToPlan telt');
  assert.deepEqual(suggestPlan(rows).map((p) => p.habitId), ['a', 'a'], 'ook "Verdeel voor mij" slaat de taak over');
});

test('"Niet in deze week" geldt alleen voor die week: een oudere markering telt niet meer', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('a', 2, 'week', { noPlanWeek: '2026-10-05' })] }), today: THURSDAY });
  assert.equal(row(rows, 'a').skipped, false, 'vorige week gekozen: deze week weer aan de beurt');
  assert.equal(suggestPlan(rows).length, 2);
  const next = buildWeekPlan({ snapshot: snap({ habits: [flexible('a', 2, 'month', { noPlanWeek: '2026-10-12' })] }), today: '2026-10-19' });
  assert.equal(row(next, 'a').skipped, false, 'maandag 19 oktober: een nieuwe week');
});

test('"Niet in deze week" blijft de hele week staan, ook op zondag', () => {
  const habits = [flexible('a', 2, 'week', { noPlanWeek: '2026-10-12' })];
  for (const today of ['2026-10-17', '2026-10-18']) assert.equal(row(buildWeekPlan({ snapshot: snap({ habits }), today }), 'a').skipped, true, today);
  assert.equal(row(buildWeekPlan({ snapshot: snap({ habits }), today: '2026-10-19' }), 'a').skipped, false, 'maandag: een nieuwe week');
});

test('op zondag plan je met de dag van de volgende week voor ogen: die week begint zonder slotje en met een eigen keuze', () => {
  const SUNDAY = '2026-10-25';
  const habits = [flexible('a', 2, 'week', { noPlanWeek: '2026-10-19' })]; // "niet in deze week" gekozen voor de week van 19 oktober
  const now = row(buildWeekPlan({ snapshot: snap({ habits }), today: SUNDAY }), 'a');
  assert.equal(now.skipped, true, 'zondag zelf: het slotje geldt nog');
  const next = buildWeekPlan({ snapshot: snap({ habits }), today: SUNDAY, date: '2026-10-26' });
  const a = row(next, 'a');
  assert.equal(a.skipped, false, 'maandag 26 oktober bekeken: geen slotje');
  assert.deepEqual([a.unit.start, a.unit.end, a.missing, a.free], ['2026-10-26', '2026-11-01', 2, 7], 'de volgende week, volledig te plannen');
  assert.equal(states(a), '26:free 27:free 28:free 29:free 30:free 31:free 01:free', 'alleen de dagen van die week, niets voorbij');
  assert.deepEqual(suggestPlan(next).every((p) => p.date >= '2026-10-26'), true);
  // en daar kan je opnieuw "niet in deze week" kiezen: de markering hoort bij de maandag van die week
  const marked = [flexible('a', 2, 'week', { noPlanWeek: '2026-10-26' })];
  assert.equal(row(buildWeekPlan({ snapshot: snap({ habits: marked }), today: SUNDAY, date: '2026-10-26' }), 'a').skipped, true);
  assert.equal(row(buildWeekPlan({ snapshot: snap({ habits: marked }), today: SUNDAY }), 'a').skipped, false, 'en de lopende week blijft er buiten');
});

test('planningStart: vandaag, of de maandag van de week van de bekeken dag als die later begint', () => {
  assert.equal(planningStart({ today: '2026-10-25' }), '2026-10-25');
  assert.equal(planningStart({ today: '2026-10-25', date: '2026-10-25' }), '2026-10-25');
  assert.equal(planningStart({ today: '2026-10-22', date: '2026-10-24' }), '2026-10-22', 'zelfde week: vandaag');
  assert.equal(planningStart({ today: '2026-10-22', date: '2026-10-28' }), '2026-10-26', 'volgende week: maandag');
});

test('dagen die al geweest zijn: gedaan staat er als gedaan, de rest als voorbij, en ze doen niet mee in het voorstel', () => {
  const rows = buildWeekPlan({
    snapshot: snap({
      habits: [flexible('a', 3)],
      checkIns: [{ habitId: 'a', date: '2026-10-13', status: 'done' }, { habitId: 'a', date: '2026-10-14', status: 'skipped' }],
      dayPlans: [{ habitId: 'a', date: '2026-10-12' }],
    }),
    today: THURSDAY,
  });
  const a = row(rows, 'a');
  assert.equal(states(a).startsWith('12:past 13:done 14:past 15:free'), true, states(a));
  assert.deepEqual([a.planned, a.free, a.missing], [0, 4, 2], 'een geplande dag in het verleden telt niet meer als gepland');
  assert.equal(suggestPlan(rows).every((p) => p.date >= THURSDAY), true, 'het voorstel kiest nooit een dag die voorbij is');
  const monday = buildWeekPlan({ snapshot: snap({ habits: [flexible('a')] }), today: '2026-10-12' });
  assert.equal(states(row(monday, 'a')).startsWith('12:free'), true, 'op maandag is er niets voorbij');
});

test('setPlanSkip: zet de markering op de maandag van deze week en haalt hem weer weg; de rest van de taak blijft ongemoeid', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(flexible(undefined, 2, 'month', { id: undefined }));
  const done = await setPlanSkip(repo, { habitId: habit.id, skipped: true }, '2026-10-17'); // zaterdag
  assert.deepEqual(done.noPlanWeeks, ['2026-10-12']);
  assert.deepEqual([done.name, done.schedules], [habit.name, habit.schedules]);
  assert.deepEqual((await repo.getHabit(habit.id)).noPlanWeeks, ['2026-10-12']);
  const back = await setPlanSkip(repo, { habitId: habit.id, skipped: false }, '2026-10-17');
  assert.equal('noPlanWeeks' in back, false);
  assert.equal(await setPlanSkip(repo, { habitId: 'bestaat-niet', skipped: true }, '2026-10-17'), null);
  // de markering komt ook door een export en import heen en een ongeldige waarde wordt geweigerd
  assert.deepEqual(validateHabit({ ...habit, noPlanWeeks: ['2026-10-12'] }), []);
  assert.deepEqual(validateHabit({ ...habit, noPlanWeek: 'volgende week' }), [{ field: 'noPlanWeek', code: 'invalid' }]);
  assert.deepEqual(validateHabit({ ...habit, noPlanWeek: '2026-10-12' }), [], 'het oudere veld blijft geldig');
});

test('setPlanSkip: de keuze voor de volgende week overschrijft die van de lopende week niet (en andersom)', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(flexible(undefined, 2, 'week', { id: undefined }));
  const SUNDAY = '2026-10-25';
  const MONDAY = '2026-10-26';
  await setPlanSkip(repo, { habitId: habit.id, skipped: true }, planningStart({ today: SUNDAY, date: SUNDAY }));
  await setPlanSkip(repo, { habitId: habit.id, skipped: true }, planningStart({ today: SUNDAY, date: MONDAY }));
  const saved = await repo.getHabit(habit.id);
  assert.deepEqual(saved.noPlanWeeks, ['2026-10-19', '2026-10-26']);
  const skippedOn = (date) => row(buildWeekPlan({ snapshot: snap({ habits: [saved] }), today: SUNDAY, date }), habit.id).skipped;
  assert.deepEqual([skippedOn(SUNDAY), skippedOn(MONDAY)], [true, true], 'terug naar 25 oktober: de keuze staat er nog');
  await setPlanSkip(repo, { habitId: habit.id, skipped: false }, MONDAY);
  const back = await repo.getHabit(habit.id);
  assert.deepEqual(back.noPlanWeeks, ['2026-10-19'], 'alleen de volgende week is teruggezet');
  assert.deepEqual(validateHabit(back), []);
  await setPlanSkip(repo, { habitId: habit.id, skipped: false }, SUNDAY);
  assert.equal('noPlanWeeks' in (await repo.getHabit(habit.id)), false, 'niets meer over: het veld verdwijnt');
});

test('setPlanSkip ruimt oude weken op en neemt het oudere veld noPlanWeek over', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(flexible(undefined, 2, 'week', { id: undefined, noPlanWeek: '2026-10-19' }));
  await setPlanSkip(repo, { habitId: habit.id, skipped: true }, '2026-10-26');
  const saved = await repo.getHabit(habit.id);
  assert.deepEqual([saved.noPlanWeeks, 'noPlanWeek' in saved], [['2026-10-19', '2026-10-26'], false], 'de oude keuze blijft voor de lopende week');
  await setPlanSkip(repo, { habitId: habit.id, skipped: true }, '2026-11-09');
  assert.deepEqual((await repo.getHabit(habit.id)).noPlanWeeks, ['2026-11-09'], 'de weken van 19 en 26 oktober zijn voorbij en worden opgeruimd');
  assert.deepEqual(validateHabit({ ...saved, noPlanWeeks: ['morgen'] }), [{ field: 'noPlanWeeks', code: 'invalid' }]);
});

test('de markering blijft staan als je de habit bewerkt (applyHabitForm)', async () => {
  const habit = flexible('a', 2, 'month', { noPlanWeek: '2026-10-12' });
  const next = applyHabitForm({ existing: habit, values: { name: 'Anders', icon: habit.icon, color: habit.color, daypart: habit.daypart, schedule: habit.schedules[0].schedule }, today: THURSDAY });
  assert.equal(next.noPlanWeek, '2026-10-12');
});

// --- taken die in het venster starten ----------------------------------------------------------------------------------------------------

test('een taak die morgen start staat in Plan je week, maar alleen te plannen vanaf zijn startdatum', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('nieuw', 2, 'week', { startDate: '2026-10-16' })] }), today: THURSDAY });
  const nieuw = row(rows, 'nieuw');
  assert.ok(nieuw, 'er is een rij');
  assert.equal(nieuw.startsOn, '2026-10-16');
  assert.equal(states(nieuw).startsWith('12:past 13:past 14:past 15:blocked 16:free 17:free 18:free'), true, states(nieuw));
  assert.deepEqual([nieuw.unit.count, nieuw.unit.target, nieuw.missing, nieuw.free], [0, 2, 2, 3], 'de week telt vanaf de start: vrijdag, zaterdag en zondag');
  assert.deepEqual(suggestPlan(rows).map((p) => p.date).sort(), ['2026-10-16', '2026-10-18'], 'het voorstel begint niet voor de start');
});

test('een taak die pas in de volgende week begint: de eenheid is die week, en de dagen ervoor zijn niet beschikbaar', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('maandag', 2, 'week', { startDate: '2026-10-19' })] }), today: THURSDAY });
  const maandag = row(rows, 'maandag');
  assert.equal(maandag.unit.start, '2026-10-19');
  assert.equal(states(maandag).startsWith('12:past 13:past 14:past 15:blocked 16:blocked 17:blocked 18:blocked 19:free 20:free'), true, states(maandag));
  assert.equal(maandag.free, 4, 'maandag t/m donderdag liggen binnen het venster en in die week');
  assert.deepEqual(suggestPlan(rows).every((p) => p.date >= '2026-10-19'), true);
});

test('een taak die te ver weg start, of nooit meer loopt, krijgt geen rij', () => {
  const far = flexible('ver', 2, 'week', { startDate: '2026-10-24' }); // 9 dagen weg: buiten het venster van 8 dagen
  const ended = flexible('klaar', 2, 'week', { startDate: '2026-10-16', endDate: '2026-10-14' });
  const archived = flexible('archief', 2, 'week', { startDate: '2026-10-16', status: 'archived' });
  const paused = flexible('pauze', 2, 'week', { startDate: '2026-10-16' });
  const rows = buildWeekPlan({ snapshot: snap({ habits: [far, ended, archived, paused], pauses: [{ habitId: 'pauze', from: '2026-10-10', to: null }] }), today: THURSDAY });
  assert.deepEqual(rows.map((r) => r.habit.id), []);
});

test('een taak die op zondag start in een week met één dag: de afspraak telt alleen die dag; per maand telt de rest van de maand', () => {
  const weekly = buildWeekPlan({ snapshot: snap({ habits: [flexible('zondag', 2, 'week', { startDate: '2026-10-18' })] }), today: THURSDAY });
  assert.deepEqual([row(weekly, 'zondag').unit.target, row(weekly, 'zondag').missing], [1, 1]);
  const monthly = buildWeekPlan({ snapshot: snap({ habits: [flexible('maand', 2, 'month', { startDate: '2026-10-16' })] }), today: THURSDAY });
  assert.deepEqual([row(monthly, 'maand').unit.span, row(monthly, 'maand').unit.target, row(monthly, 'maand').days.every((d) => d.inUnit)], ['month', 2, true]);
});

test('de herinnering telt een taak die nog niet is gestart mee (hij is nu te plannen)', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('nieuw', 2, 'week', { startDate: '2026-10-16' })] }), today: THURSDAY });
  assert.equal(rows.filter((r) => r.missing > 0 && r.free > 0 && !r.skipped).length, 1);
});

// --- maandtaken vragen alleen om hun deel van het venster ----------------------------------------------------------------------------------

test('neededInWindow: week alles; maand je deel van het venster (minstens 1), en alles als de maand binnen het venster eindigt', () => {
  const need = (span, open, remainingDays) => neededInWindow({ span, open, remainingDays });
  assert.deepEqual([need('week', 2, 4), need('week', 0, 4)], [2, 0]);
  assert.deepEqual([need('month', 2, 13), need('month', 2, 17), need('month', 2, 31)], [1, 1, 1], '2× per maand, nog veel dagen: één nu, de rest later');
  assert.deepEqual([need('month', 2, 8), need('month', 2, 6), need('month', 3, 2)], [2, 2, 3], 'de maand eindigt binnen het venster: alles nu');
  assert.deepEqual([need('month', 8, 16), need('month', 8, 31), need('month', 4, 10)], [4, 2, 3], 'meer keren: naar verhouding');
  assert.equal(need('month', 1, 20), 1);
});

test('2× per maand, nog 13 dagen over: één dag plannen is genoeg voor de herinnering; de tweede hoeft nog niet', () => {
  // een taak die op maandag 19 oktober begint (13 dagen over in oktober), gepland op zondag 18 oktober
  const habits = [flexible('wc', 2, 'month', { startDate: '2026-10-19' })];
  const SUNDAY = '2026-10-18';
  const none = buildWeekPlan({ snapshot: snap({ habits }), today: SUNDAY });
  assert.deepEqual([row(none, 'wc').missing, row(none, 'wc').urgent], [1, false], 'één inplannen, en een taak die net begint dreigt niet te falen');
  const one = buildWeekPlan({ snapshot: snap({ habits, dayPlans: [{ habitId: 'wc', date: '2026-10-19' }] }), today: SUNDAY });
  assert.equal(row(one, 'wc').missing, 0, 'één dag is genoeg');
  assert.equal(one.filter((r) => r.missing > 0 && r.free > 0).length, 0, 'dus geen "Nog n taken om in te plannen"');
});

test('2× per maand aan het eind van de maand: dan moeten beide nu een dag', () => {
  const rows = buildWeekPlan({ snapshot: snap({ habits: [flexible('wc', 2, 'month')] }), today: '2026-10-25' });
  assert.equal(row(rows, 'wc').missing, 2, 'nog 7 dagen over: alles moet nu');
});

// --- overslaan in de laatste kans van de maand ----------------------------------------------------------------------------------------------

test('lastChanceThisWeek: alleen voor een taak per maand waarvan wat nog moet niet meer past in de dagen na deze week', () => {
  const last = (over) => lastChanceThisWeek({ span: 'month', open: 1, planned: 0, unitEnd: '2026-10-31', weekEnd: '2026-10-25', ...over });
  assert.deepEqual(last({}), { lastChance: false, daysAfter: 6 }, 'nog 6 dagen na deze week: één keer kan daarna nog');
  assert.deepEqual(last({ weekEnd: '2026-10-31' }), { lastChance: true, daysAfter: 0 }, 'de laatste week van de maand');
  assert.deepEqual(last({ open: 2, weekEnd: '2026-10-30' }), { lastChance: true, daysAfter: 1 }, '2 keer nodig en nog 1 dag erna');
  assert.equal(last({ open: 2, weekEnd: '2026-10-29' }).lastChance, false, '2 keer nodig en nog 2 dagen erna: net aan');
  assert.equal(last({ weekEnd: '2026-10-31', planned: 1 }).lastChance, false, 'al een dag gepland: overslaan kost niets');
  assert.equal(last({ weekEnd: '2026-10-31', open: 0 }).lastChance, false, 'al gehaald');
  assert.equal(last({ span: 'week', weekEnd: '2026-10-31' }).lastChance, false, 'een taak per week: de week is zelf de periode, geen "laatste week van de maand"');
});

test('Plan je week: de rij van een taak per maand weet in de laatste week dat overslaan het doel onhaalbaar maakt', () => {
  const habits = [flexible('wc', 1, 'month'), flexible('week', 2, 'week')];
  const lastWeek = buildWeekPlan({ snapshot: snap({ habits }), today: '2026-10-28' }); // woensdag 28 oktober: de laatste week van de maand
  assert.deepEqual([row(lastWeek, 'wc').lastChance, row(lastWeek, 'wc').daysAfter, row(lastWeek, 'week').lastChance], [true, 0, false]);
  const midMonth = buildWeekPlan({ snapshot: snap({ habits }), today: THURSDAY });
  assert.deepEqual([row(midMonth, 'wc').lastChance, row(midMonth, 'wc').daysAfter], [false, 13]);
  const planned = buildWeekPlan({ snapshot: snap({ habits, dayPlans: [{ habitId: 'wc', date: '2026-10-29' }] }), today: '2026-10-28' });
  assert.equal(row(planned, 'wc').lastChance, false, 'al ingepland: overslaan kost niets');
  const skipped = buildWeekPlan({ snapshot: snap({ habits: [flexible('wc', 1, 'month', { noPlanWeek: '2026-10-26' })] }), today: '2026-10-28' });
  assert.deepEqual([row(skipped, 'wc').skipped, row(skipped, 'wc').lastChance], [true, true], 'na overslaan blijft de waarschuwing');
});
