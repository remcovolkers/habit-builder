import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttention, buildWeekReview, forToday, nudgesOn } from '../../src/app/attention.js';
import { recordReason } from '../../src/app/actions.js';
import { buildExport, parseImport } from '../../src/app/backup.js';
import { ValidationError } from '../../src/data/repository.js';
import { SLIP_REASONS } from '../../src/domain/attention.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const perMonth = (count) => ({ type: 'times_per_period', period: 'month', count });
const habit = (id, schedule, over = {}) => validHabit({ id, name: id, startDate: '2026-08-01', schedules: [{ effectiveFrom: '2026-08-01', schedule }], ...over });
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ratings: [], reasons: [], ...over });
const done = (habitId, date) => ({ habitId, date, status: 'done' });

// 2× per maand, voor het laatst gedaan op 20 augustus: op 15 oktober al ruim 7 weken stil
const bed = habit('Bed', perMonth(2));
const base = { habits: [bed], checkIns: [done('Bed', '2026-08-20')] };

test('een stille taak komt in de aandachtslijst, met zijn belangrijkste signaal', () => {
  const [item] = buildAttention({ snapshot: snapshot(base), today: TODAY });
  assert.deepEqual([item.habit.id, item.signal.kind, item.handled, item.reason], ['Bed', 'silent', false, null]);
  assert.equal(item.signal.detail.days, 56);
});

test('een reden op of na de dag waarop het signaal begon, dekt het; een reden ervoor niet', () => {
  const since = buildAttention({ snapshot: snapshot(base), today: TODAY })[0].signal.since; // 2026-09-11 + 15 per stap
  const before = { habitId: 'Bed', date: addDaysIso(since, -1), reason: 'no_time', note: null };
  const onDay = { habitId: 'Bed', date: since, reason: 'forgot', note: 'druk' };
  assert.equal(buildAttention({ snapshot: snapshot({ ...base, reasons: [before] }), today: TODAY })[0].handled, false);
  const [handled] = buildAttention({ snapshot: snapshot({ ...base, reasons: [before, onDay] }), today: TODAY });
  assert.deepEqual([handled.handled, handled.reason.reason, handled.reason.note], [true, 'forgot', 'druk']);
});

test('na een reactie komt hetzelfde signaal bij de volgende stap opnieuw (elke 15 dagen bij 2× per maand, gerekend vanaf de laatste keer)', () => {
  // laatst gedaan 20 augustus, grens na 22 dagen, daarna elke 15 dagen: 11 oktober, 26 oktober, ...
  const reasons = [{ habitId: 'Bed', date: TODAY, reason: 'no_time', note: null }];
  assert.equal(buildAttention({ snapshot: snapshot({ ...base, reasons }), today: '2026-10-25' })[0].handled, true);
  assert.equal(buildAttention({ snapshot: snapshot({ ...base, reasons }), today: '2026-10-26' })[0].handled, false);
});

test('Vandaag toont alleen wat open staat en stil of mislukt is; "te laat" heeft zijn eigen blokje op de kaart', () => {
  const late = habit('Rekening', { type: 'day_of_month', day: 3 });
  const everyDay = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
  const reading = habit('Lezen', everyDay, { startDate: '2026-09-01' });
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14'];
  const checkIns = [done('Rekening', '2026-09-04'), done('Bed', '2026-08-20'), ...week.map((d) => done('Lezen', d))]; // Lezen: alleen de 13e gemist
  const items = buildAttention({ snapshot: snapshot({ habits: [bed, late, reading], checkIns }), today: TODAY });
  assert.deepEqual(items.map((i) => [i.habit.id, i.signal.kind]), [['Rekening', 'late'], ['Bed', 'silent'], ['Lezen', 'failed']]);
  assert.equal(items[2].signal.detail.span, 'day');
  assert.deepEqual(forToday(items).map((i) => i.habit.id), ['Bed']); // de gemiste dag van Lezen hoort in de weekreview, niet op Vandaag
  const answered = [{ habitId: 'Bed', date: TODAY, reason: 'no_time', note: null }];
  assert.deepEqual(forToday(buildAttention({ snapshot: snapshot({ habits: [bed], checkIns: [done('Bed', '2026-08-20')], reasons: answered }), today: TODAY })), []);
});

test('de ochtendmelding krijgt per dag het aantal taken zonder reactie op hun meldmoment: de startdag en dan elke week', () => {
  const nudges = (date, reasons = []) => nudgesOn({ snapshot: snapshot({ ...base, reasons }), date });
  // laatst gedaan 20 augustus: het probleem begon op 11 september (22 dagen), dus elke week op dezelfde weekdag: 9, 16 en 23 oktober
  assert.deepEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-16', '2026-10-23'].map((d) => nudges(d)), [0, 1, 0, 1, 1]);
  const answered = [{ habitId: 'Bed', date: '2026-10-09', reason: 'forgot', note: null }];
  assert.equal(nudges('2026-10-09', answered), 0); // beantwoord
  assert.equal(nudges('2026-10-16', answered), 1); // een nieuw signaal (de stap van 11 oktober) komt wel weer
});

test('de weekreview geeft de uitkomst van de week en de taken die aandacht vragen, ook die al beantwoord zijn', () => {
  const reasons = [{ habitId: 'Bed', date: TODAY, reason: 'wrong_rhythm', note: null }];
  const review = buildWeekReview({ snapshot: snapshot({ ...base, reasons }), today: TODAY });
  assert.deepEqual([review.start, review.items.length, review.open, review.handled], ['2026-10-12', 1, 0, 1]);
  assert.equal(review.items[0].reason.reason, 'wrong_rhythm');
  assert.ok('done' in review.week && 'total' in review.week);
});

test('een gepauzeerde of gearchiveerde taak vraagt niets', () => {
  const paused = snapshot({ ...base, pauses: [{ id: 'p', habitId: 'Bed', from: '2026-10-01', to: null }] });
  assert.deepEqual(buildAttention({ snapshot: paused, today: TODAY }), []);
  assert.deepEqual(buildAttention({ snapshot: snapshot({ ...base, habits: [{ ...bed, status: 'archived' }] }), today: TODAY }), []);
});

// --- opslag ---------------------------------------------------------------------------------------

test('recordReason bewaart één reactie per taak per dag; opnieuw geven overschrijft', async () => {
  const { repo } = testRepo();
  await recordReason(repo, { habitId: 'h', reason: 'no_time' }, TODAY);
  await recordReason(repo, { habitId: 'h', reason: 'forgot', note: '  nieuwe maand  ' }, TODAY);
  await recordReason(repo, { habitId: 'h', reason: 'no_time' }, '2026-10-16');
  const all = await repo.listReasons('h');
  assert.equal(all.length, 2);
  const today = all.find((r) => r.date === TODAY);
  assert.deepEqual([today.id, today.reason, today.note], [`h|${TODAY}`, 'forgot', 'nieuwe maand']);
  assert.equal((await repo.snapshot()).reasons.length, 2);
  assert.equal(await repo.clearReason('h', TODAY), true);
  assert.equal((await repo.listReasons()).length, 1);
});

test('recordReason weigert een onbekende reden, een foute datum en een te lange notitie', async () => {
  const { repo } = testRepo();
  assert.deepEqual(SLIP_REASONS, ['no_time', 'forgot', 'no_motivation', 'busy_sick', 'wrong_rhythm']);
  await assert.rejects(() => recordReason(repo, { habitId: 'h', reason: 'geen-reden' }, TODAY), ValidationError);
  await assert.rejects(() => recordReason(repo, { habitId: 'h', reason: 'forgot' }, 'morgen'), ValidationError);
  await assert.rejects(() => recordReason(repo, { habitId: 'h', reason: 'forgot', note: 'x'.repeat(201) }, TODAY), ValidationError);
  await assert.rejects(() => recordReason(repo, { habitId: '', reason: 'forgot' }, TODAY), ValidationError);
});

test('redenen gaan mee in de back-up en komen er identiek uit; een ongeldige reden wordt weggelaten', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveHabit(validHabit({ name: 'Bed opmaken' }));
  await recordReason(repo, { habitId: saved.id, reason: 'busy_sick', note: 'griep' }, TODAY);
  const exported = buildExport(await repo.snapshot());
  assert.equal(exported.data.reasons.length, 1);

  const parsed = parseImport(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.warnings, []);
  const { repo: fresh } = testRepo();
  await fresh.replaceAll(parsed.data);
  const [back] = await fresh.listReasons();
  assert.deepEqual([back.habitId, back.date, back.reason, back.note], [saved.id, TODAY, 'busy_sick', 'griep']);

  const broken = structuredClone(exported);
  broken.data.reasons[0].reason = 'onzin';
  const lenient = parseImport(JSON.stringify(broken));
  assert.equal(lenient.data.reasons.length, 0);
  assert.equal(lenient.warnings.length, 1);

  // een back-up van vóór deze versie heeft geen redenen: dat is gewoon leeg
  const old = structuredClone(exported);
  delete old.data.reasons;
  assert.deepEqual(parseImport(JSON.stringify(old)).data.reasons, []);
});

function addDaysIso(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
