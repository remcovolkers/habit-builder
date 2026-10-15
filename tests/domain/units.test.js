import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUnits, isClosed, isPositive } from '../../src/domain/units.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { checks, habit, onDay, perMonth, perWeek, statuses, weekdaysSchedule } from './helpers.js';

const daily = weekdaysSchedule(ALL_WEEKDAYS);

// --- Vaste weekdagen -------------------------------------------------------------------------

test('dagelijks: gedaan, overgeslagen, gemist en open', () => {
  const units = computeUnits({
    habit: habit(daily, '2026-10-12'),
    checkIns: checks(['2026-10-12'], ['2026-10-13', 'skipped']),
    today: '2026-10-15',
  });
  assert.deepEqual(statuses(units), ['done', 'skipped', 'missed', 'open']);
  assert.deepEqual(units.map((u) => u.start), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
});

test('minimale versie telt als gedaan en wordt als minimaal bewaard', () => {
  const [unit] = computeUnits({
    habit: habit(daily, '2026-10-12'),
    checkIns: checks(['2026-10-12', 'minimal']),
    today: '2026-10-12',
  });
  assert.equal(unit.status, 'minimal');
  assert.equal(isPositive(unit), true);
  assert.equal(unit.minimalCount, 1);
});

test('gepauzeerde dag zonder check-in is paused; een check-in op een gepauzeerde dag telt gewoon', () => {
  const units = computeUnits({
    habit: habit(daily, '2026-10-12'),
    checkIns: checks(['2026-10-14']),
    pauses: [{ from: '2026-10-13', to: '2026-10-14' }],
    today: '2026-10-15',
  });
  assert.deepEqual(statuses(units), ['missed', 'paused', 'done', 'open']);
});

test('open pauze: vandaag is niet "open" maar paused', () => {
  const units = computeUnits({
    habit: habit(daily, '2026-10-12'),
    pauses: [{ from: '2026-10-13', to: null }],
    today: '2026-10-15',
  });
  assert.deepEqual(statuses(units), ['missed', 'paused', 'paused', 'paused']);
});

test('check-in op een niet-geplande dag levert geen eenheid op', () => {
  const units = computeUnits({
    habit: habit(weekdaysSchedule([0, 2, 4]), '2026-10-12'), // ma, wo, vr
    checkIns: checks(['2026-10-13']), // dinsdag
    today: '2026-10-16',
  });
  assert.deepEqual(units.map((u) => u.start), ['2026-10-12', '2026-10-14', '2026-10-16']);
  assert.deepEqual(statuses(units), ['missed', 'missed', 'open']);
});

test('startdatum in de toekomst of na einddatum geeft geen eenheden', () => {
  assert.deepEqual(computeUnits({ habit: habit(daily, '2026-10-20'), today: '2026-10-15' }), []);
});

test('bij dubbele check-ins op één datum telt de laatste', () => {
  const [unit] = computeUnits({
    habit: habit(daily, '2026-10-12'),
    checkIns: checks(['2026-10-12', 'skipped'], ['2026-10-12', 'done']),
    today: '2026-10-12',
  });
  assert.equal(unit.status, 'done');
});

test('einddatum: eenheden stoppen bij de einddatum, daarna nooit meer "missed"', () => {
  const units = computeUnits({
    habit: habit(daily, '2026-10-12', { endDate: '2026-10-13' }),
    today: '2026-10-20',
  });
  assert.deepEqual(units.map((u) => u.start), ['2026-10-12', '2026-10-13']);
});

// --- N× per week ----------------------------------------------------------------------------

test('2× per week: gehaald, nog open en gemist', () => {
  const units = computeUnits({
    habit: habit(perWeek(2), '2026-10-05'),
    checkIns: checks(['2026-10-06'], ['2026-10-08'], ['2026-10-13']),
    today: '2026-10-15',
  });
  assert.deepEqual(statuses(units), ['done', 'open']);
  assert.equal(units[0].target, 2);
  assert.equal(units[0].count, 2);
  assert.equal(units[1].count, 1);
  assert.equal(units[1].remainingDays, 4); // do, vr, za, zo
  assert.equal(units[1].atRisk, false);
});

test('2× per week: te weinig check-ins in een afgesloten week = missed', () => {
  const units = computeUnits({
    habit: habit(perWeek(2), '2026-10-05'),
    checkIns: checks(['2026-10-06']),
    today: '2026-10-15',
  });
  assert.deepEqual(statuses(units), ['missed', 'open']);
});

test('atRisk: op zondag met 0 van 2 kan het niet meer halen', () => {
  const [unit] = computeUnits({ habit: habit(perWeek(2), '2026-10-12'), today: '2026-10-18' });
  assert.equal(unit.status, 'open');
  assert.equal(unit.remainingDays, 1);
  assert.equal(unit.atRisk, true);
});

test('quota eerder gehaald in de week = done, ook als de week nog loopt', () => {
  const [unit] = computeUnits({
    habit: habit(perWeek(1), '2026-10-12'),
    checkIns: checks(['2026-10-12']),
    today: '2026-10-14',
  });
  assert.equal(unit.status, 'done');
});

test('starten midden in de week: quota is begrensd door de resterende dagen', () => {
  const thursday = computeUnits({ habit: habit(perWeek(3), '2026-10-15'), today: '2026-10-16' });
  assert.equal(thursday.length, 1);
  assert.equal(thursday[0].target, 3); // do, vr, za, zo = 4 beschikbaar

  const saturday = computeUnits({
    habit: habit(perWeek(3), '2026-10-17'),
    checkIns: checks(['2026-10-17'], ['2026-10-18']),
    today: '2026-10-18',
  });
  assert.equal(saturday[0].target, 2); // za, zo
  assert.equal(saturday[0].status, 'done');
});

test('pauze verkleint de beschikbare dagen; hele week gepauzeerd = paused', () => {
  const partial = computeUnits({
    habit: habit(perWeek(3), '2026-10-05'),
    checkIns: checks(['2026-10-05']),
    pauses: [{ from: '2026-10-06', to: '2026-10-11' }],
    today: '2026-10-14',
  });
  assert.equal(partial[0].target, 1); // alleen maandag beschikbaar
  assert.equal(partial[0].status, 'done');

  const whole = computeUnits({
    habit: habit(perWeek(3), '2026-10-05'),
    pauses: [{ from: '2026-10-05', to: '2026-10-11' }],
    today: '2026-10-14',
  });
  assert.equal(whole[0].status, 'paused');
  assert.equal(isClosed(whole[0]), false);
});

test('overgeslagen dagen tellen niet als beschikbaar; alles overgeslagen = skipped', () => {
  const skips = (...dates) => dates.map((date) => ({ date, status: 'skipped' }));
  const some = computeUnits({
    habit: habit(perWeek(3), '2026-10-05'),
    checkIns: [...skips('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'), ...checks(['2026-10-10'], ['2026-10-11'])],
    today: '2026-10-14',
  });
  assert.equal(some[0].target, 2); // alleen za en zo over
  assert.equal(some[0].status, 'done');

  const all = computeUnits({
    habit: habit(perWeek(3), '2026-10-05'),
    checkIns: skips('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'),
    today: '2026-10-14',
  });
  assert.equal(all[0].status, 'skipped');
});

test('gearchiveerd halverwege een onvolledige periode: die periode verdwijnt; een gehaalde blijft', () => {
  const unmet = computeUnits({
    habit: habit(perWeek(3), '2026-10-05', { endDate: '2026-10-14' }),
    today: '2026-10-20',
  });
  assert.equal(unmet.length, 1); // week 5 okt (gemist), week 12 okt bestaat niet

  const met = computeUnits({
    habit: habit(perWeek(1), '2026-10-05', { endDate: '2026-10-14' }),
    checkIns: checks(['2026-10-13']),
    today: '2026-10-20',
  });
  assert.deepEqual(statuses(met), ['missed', 'done']);
});

// --- N× per maand en dag van de maand -----------------------------------------------------------

test('2× per maand: afgesloten maand gemist, lopende maand gehaald', () => {
  const units = computeUnits({
    habit: habit(perMonth(2), '2026-09-01'),
    checkIns: checks(['2026-10-02'], ['2026-10-05']),
    today: '2026-10-15',
  });
  assert.deepEqual(statuses(units), ['missed', 'done']);
  assert.deepEqual(units.map((u) => u.span), ['month', 'month']);
  assert.equal(units[1].days, 31);
});

test('starten op de laatste dag van de maand: quota begrensd tot 1 beschikbare dag', () => {
  const [unit] = computeUnits({ habit: habit(perMonth(2), '2026-10-31'), today: '2026-10-31' });
  assert.equal(unit.target, 1);
});

test('dag 31 in korte maanden valt terug op de laatste dag; toekomstige maand heeft nog geen eenheid', () => {
  const units = computeUnits({
    habit: habit(onDay(31), '2026-01-01'),
    checkIns: checks(['2026-01-31']),
    today: '2026-03-01',
  });
  assert.deepEqual(statuses(units), ['done', 'missed']);
  assert.deepEqual(units.map((u) => u.due), ['2026-01-31', '2026-02-28']);
});

test('dag 31 in een schrikkeljaar: 29 februari', () => {
  const [, feb] = computeUnits({
    habit: habit(onDay(31), '2028-01-01'),
    checkIns: checks(['2028-02-29']),
    today: '2028-03-15',
  });
  assert.equal(feb.due, '2028-02-29');
  assert.equal(feb.status, 'done');
});

test('dag van de maand: te laat blijft open tot einde maand en late afronding telt', () => {
  const base = { habit: habit(onDay(15), '2026-10-01') };
  const open = computeUnits({ ...base, today: '2026-10-20' })[0];
  assert.equal(open.status, 'open');
  assert.equal(open.overdue, true);

  const notYetDue = computeUnits({ ...base, today: '2026-10-10' });
  assert.deepEqual(notYetDue, []);

  const late = computeUnits({ ...base, checkIns: checks(['2026-10-20']), today: '2026-10-20' })[0];
  assert.equal(late.status, 'done');

  const tooEarly = computeUnits({ ...base, checkIns: checks(['2026-10-14']), today: '2026-10-20' })[0];
  assert.equal(tooEarly.status, 'open'); // vóór de vervaldatum telt niet

  const missed = computeUnits({ ...base, today: '2026-11-02' })[0];
  assert.equal(missed.status, 'missed');
});

test('dag van de maand: gestart na de vervaldatum = die maand geen eenheid', () => {
  const units = computeUnits({ habit: habit(onDay(15), '2026-10-20'), today: '2026-11-16' });
  assert.deepEqual(units.map((u) => u.due), ['2026-11-15']);
});

// --- Cadence-wijzigingen ----------------------------------------------------------------------

test('wijziging halverwege een week geldt voor de hele week; eerdere dagen blijven dagen', () => {
  const h = {
    id: 'h1',
    status: 'active',
    startDate: '2026-10-05',
    schedules: [
      { effectiveFrom: '2026-10-05', schedule: weekdaysSchedule([0, 1, 2, 3, 4]) },
      { effectiveFrom: '2026-10-14', schedule: perWeek(2) }, // woensdag
    ],
  };
  const units = computeUnits({ habit: h, checkIns: checks(['2026-10-13']), today: '2026-10-18' });
  // week van 5 okt: vijf losse werkdagen (gemist); week van 12 okt: één weekeenheid
  assert.deepEqual(units.map((u) => u.kind), ['day', 'day', 'day', 'day', 'day', 'period']);
  assert.equal(units[5].target, 2);
  assert.equal(units[5].count, 1);
  assert.equal(units[5].status, 'open');
});

test('quotum verlagen schrijft de geschiedenis niet om', () => {
  const h = {
    id: 'h1',
    status: 'active',
    startDate: '2026-10-05',
    schedules: [
      { effectiveFrom: '2026-10-05', schedule: perWeek(3) },
      { effectiveFrom: '2026-10-14', schedule: perWeek(1) },
    ],
  };
  const units = computeUnits({
    habit: h,
    checkIns: checks(['2026-10-06'], ['2026-10-08'], ['2026-10-13']),
    today: '2026-10-18',
  });
  assert.deepEqual(units.map((u) => [u.target, u.status]), [[3, 'missed'], [1, 'done']]);
});

test('van week- naar maandschema: de maand claimt alle dagen, geen dubbele eenheden', () => {
  const h = {
    id: 'h1',
    status: 'active',
    startDate: '2026-10-05',
    schedules: [
      { effectiveFrom: '2026-10-05', schedule: perWeek(1) },
      { effectiveFrom: '2026-10-20', schedule: perMonth(2) },
    ],
  };
  const units = computeUnits({ habit: h, checkIns: checks(['2026-10-06'], ['2026-10-13']), today: '2026-10-15' });
  assert.equal(units.length, 1);
  assert.equal(units[0].span, 'month');
  assert.equal(units[0].count, 2);
  assert.equal(units[0].status, 'done');
});

test('weekdag-schema vóór de ingangsdatum van het eerste schema levert niets op', () => {
  const h = {
    id: 'h1',
    status: 'active',
    startDate: '2026-10-12',
    schedules: [{ effectiveFrom: '2026-10-14', schedule: daily }],
  };
  const units = computeUnits({ habit: h, today: '2026-10-15' });
  assert.deepEqual(units.map((u) => u.start), ['2026-10-14', '2026-10-15']);
});
