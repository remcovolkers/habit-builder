import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTENTION_KINDS, attentionFor, firstFullPeriodStart } from '../../src/domain/attention.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { checks, habit, onDay, perMonth, perWeek, weekdaysSchedule } from './helpers.js';

const signals = (h, checkIns, today, pauses = []) => attentionFor({ habit: h, checkIns, pauses, today });
const kinds = (list) => list.map((s) => s.kind);
const only = (kind, list) => list.filter((s) => s.kind === kind);
const daily = weekdaysSchedule(ALL_WEEKDAYS);

test('volgorde van belang: te laat, stil, mislukt, loopt achter', () => {
  assert.deepEqual(ATTENTION_KINDS, ['late', 'silent', 'failed', 'behind']);
});

test('de eerste volledige periode: de eerste van de maand of week, anders de volgende', () => {
  assert.equal(firstFullPeriodStart('2026-10-01', 'month'), '2026-10-01');
  assert.equal(firstFullPeriodStart('2026-10-15', 'month'), '2026-11-01');
  assert.equal(firstFullPeriodStart('2026-12-20', 'month'), '2027-01-01');
  assert.equal(firstFullPeriodStart('2026-10-12', 'week'), '2026-10-12'); // maandag
  assert.equal(firstFullPeriodStart('2026-10-14', 'week'), '2026-10-19');
});

// --- stil -----------------------------------------------------------------------------------------

test('stil: 2× per maand wordt na 22 dagen zonder afvinken een signaal (1,5 × de tussentijd van 15 dagen)', () => {
  const h = habit(perMonth(2), '2026-10-01');
  assert.deepEqual(signals(h, [], '2026-10-22'), []); // 21 dagen
  const [silent] = signals(h, [], '2026-10-23');
  assert.deepEqual([silent.kind, silent.since, silent.detail.days, silent.detail.threshold], ['silent', '2026-10-23', 22, 22]);
});

test('de eerste, aangebroken periode telt niet mee: begin je op de 15e, dan komt er niets op de 16e en pas na een volle maand', () => {
  const h = habit(perMonth(2), '2026-10-15');
  assert.deepEqual(signals(h, [], '2026-10-16'), []);
  assert.deepEqual(signals(h, [], '2026-10-31'), []);
  assert.deepEqual(signals(h, [], '2026-11-02'), []); // oktober is niet mislukt: dat was de eerste periode
  assert.deepEqual(signals(h, [], '2026-11-22'), []);
  assert.deepEqual(kinds(signals(h, [], '2026-11-23')), ['silent']);
});

test('de eerste periode telt ook niet mee als je er iets in deed: de stilte telt vanaf de eerste volle periode', () => {
  const h = habit(perMonth(2), '2026-10-15');
  assert.deepEqual(signals(h, checks(['2026-10-16']), '2026-11-22'), []);
  assert.deepEqual(kinds(signals(h, checks(['2026-10-16']), '2026-11-23')), ['silent']);
});

test('na een keer afvinken telt de stilte vanaf die dag', () => {
  const h = habit(perMonth(2), '2026-09-01');
  const done = checks(['2026-10-10']);
  assert.deepEqual(signals(h, done, '2026-10-31').filter((s) => s.kind === 'silent'), []);
  const [silent] = signals(h, done, '2026-11-01');
  assert.deepEqual([silent.kind, silent.since, silent.detail.lastDone], ['silent', '2026-11-01', '2026-10-10']);
});

test('gepauzeerde dagen tellen niet mee voor de stilte; tijdens een pauze is er geen signaal', () => {
  const h = habit(perMonth(2), '2026-10-01');
  const pauses = [{ from: '2026-10-05', to: '2026-10-14' }]; // 10 dagen
  assert.deepEqual(only('silent', signals(h, [], '2026-11-01', pauses)), []); // 31 dagen sinds de start, 21 actief
  assert.deepEqual(kinds(only('silent', signals(h, [], '2026-11-02', pauses))), ['silent']);
  assert.deepEqual(signals(h, [], '2026-11-02', [{ from: '2026-10-20', to: null }]), []);
});

test('negeer je een stil signaal, dan komt het na elke tussentijd opnieuw (de `since` schuift op)', () => {
  const h = habit(perMonth(2), '2026-10-01');
  assert.equal(signals(h, [], '2026-10-23')[0].since, '2026-10-23');
  assert.equal(signals(h, [], '2026-11-06')[0].since, '2026-10-23');
  assert.equal(signals(h, [], '2026-11-07')[0].since, '2026-11-07'); // 15 dagen later
});

test('stil heeft een ondergrens van 7 dagen en schaalt met het ritme', () => {
  // begonnen op donderdag 1 oktober: de eerste volle week begint op 5 oktober, 7 dagen stilte is de 12e
  assert.deepEqual(only('silent', signals(habit(daily, '2026-10-01'), [], '2026-10-11')), []);
  assert.equal(only('silent', signals(habit(daily, '2026-10-01'), [], '2026-10-12'))[0].detail.threshold, 7);
  const weekly = habit(perWeek(1), '2026-10-05'); // maandag; tussentijd 7 dagen, grens 10
  assert.deepEqual(only('silent', signals(weekly, [], '2026-10-14')), []);
  assert.equal(only('silent', signals(weekly, [], '2026-10-15'))[0].detail.threshold, 10);
});

// --- te laat --------------------------------------------------------------------------------------

test('te laat: een vaste dag in de maand is voorbij en niet gedaan; samen met "stil" blijft alleen "te laat"', () => {
  const h = habit(onDay(3), '2026-09-01');
  const september = checks(['2026-09-04']);
  assert.deepEqual(signals(h, september, '2026-10-03'), []); // op de dag zelf nog niet
  const list = signals(h, september, '2026-10-10');
  assert.deepEqual(kinds(list), ['late']);
  assert.deepEqual([list[0].since, list[0].detail.days], ['2026-10-03', 7]);
  assert.deepEqual(signals(h, [...september, ...checks(['2026-10-05'])], '2026-10-10'), []);
});

test('een vaste dag in de maand die na de startdatum valt telt wel mee in de eerste maand', () => {
  const h = habit(onDay(20), '2026-10-15');
  assert.deepEqual(kinds(signals(h, [], '2026-10-22')), ['late']);
  assert.deepEqual(signals(habit(onDay(3), '2026-10-15'), [], '2026-10-22'), []); // de 3e was al voorbij bij de start
});

// --- mislukt --------------------------------------------------------------------------------------

test('mislukt: een maand zonder het afgesproken aantal blijft tot de start van de vorige week zichtbaar', () => {
  const h = habit(perMonth(2), '2026-08-01');
  const done = checks(['2026-09-12']); // september: 1 van 2
  const [failed] = signals(h, done, '2026-10-02');
  assert.deepEqual([failed.kind, failed.since, failed.detail.count, failed.detail.target, failed.detail.span], ['failed', '2026-09-30', 1, 2, 'month']);
  assert.deepEqual(only('failed', signals(h, done, '2026-10-20')), []); // te lang geleden
});

test('mislukt: de eerste, aangebroken maand telt niet mee', () => {
  const h = habit(perMonth(2), '2026-10-15');
  assert.deepEqual(signals(h, [], '2026-11-02'), []);
  const [failed] = only('failed', signals(h, [], '2026-12-02'));
  assert.deepEqual([failed.kind, failed.key], ['failed', 'failed:2026-11-01']); // november wel
});

test('mislukt bij vaste weekdagen: de gemiste dagen van de week komen samen in één signaal', () => {
  const h = habit(daily, '2026-09-01');
  const done = checks(['2026-10-12'], ['2026-10-14'], ['2026-10-05'], ['2026-10-06'], ['2026-10-07'], ['2026-10-08'], ['2026-10-09'], ['2026-10-10'], ['2026-10-11']);
  const list = signals(h, done, '2026-10-15'); // donderdag; de dinsdag (13e) is gemist
  assert.deepEqual(list.map((s) => [s.kind, s.key]), [['failed', 'failed:2026-10-12']]);
  assert.deepEqual([list[0].since, list[0].detail.missed, list[0].detail.target, list[0].detail.span], ['2026-10-13', 1, 3, 'day']);
});

test('weekdagen: de eerste, aangebroken week telt niet mee', () => {
  const h = habit(daily, '2026-10-14'); // woensdag
  assert.deepEqual(signals(h, [], '2026-10-18'), []);
});

// --- loopt achter ---------------------------------------------------------------------------------

test('loopt achter: op de laatste dag van de week niet gehaald, of niet meer te halen', () => {
  const h = habit(perWeek(3), '2026-09-01');
  const lastWeek = checks(['2026-10-05'], ['2026-10-06'], ['2026-10-07']);
  const week = (...dates) => [...lastWeek, ...checks(...dates.map((d) => [d]))];
  assert.deepEqual(signals(h, week('2026-10-12'), '2026-10-14'), []); // woensdag, nog 5 dagen
  assert.deepEqual(signals(h, week('2026-10-12'), '2026-10-17'), []); // zaterdag: nog 2 nodig in 2 dagen, kan nog
  assert.deepEqual(kinds(only('behind', signals(h, week(), '2026-10-17'))), ['behind']); // zaterdag met niets gedaan: 3 nodig in 2 dagen
  const sunday = signals(h, week('2026-10-12', '2026-10-13'), '2026-10-18');
  assert.deepEqual([sunday[0].kind, sunday[0].detail.count, sunday[0].detail.target], ['behind', 2, 3]);
  assert.deepEqual(signals(h, week('2026-10-12', '2026-10-13', '2026-10-15'), '2026-10-18'), []);
});

// --- overig ---------------------------------------------------------------------------------------

test('geen signalen voor een gearchiveerde, nog niet gestarte of gepauzeerde habit', () => {
  assert.deepEqual(signals(habit(perMonth(2), '2026-01-01', { status: 'archived' }), [], '2026-10-15'), []);
  assert.deepEqual(signals(habit(perMonth(2), '2026-11-01', { status: 'planned' }), [], '2026-10-15'), []);
});

test('het belangrijkste signaal staat voorop', () => {
  const h = habit(perMonth(2), '2026-08-01');
  const list = signals(h, checks(['2026-09-12']), '2026-10-02');
  assert.deepEqual(kinds(list), ['failed']);
  const both = signals(habit(perMonth(2), '2026-08-01'), checks(['2026-08-20']), '2026-10-05'); // sinds 20 aug niets: stil én mislukt
  assert.deepEqual(kinds(both), ['silent', 'failed']);
});

test('een half gehaalde teller is geen gemiste dag', () => {
  const h = habit(daily, '2026-09-01');
  const all = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14'];
  const done = checks(...all.map((d) => [d]), ['2026-10-13', 'partial']); // de 13e: 5 van 8 glazen
  assert.deepEqual(signals(h, done, '2026-10-15'), []);
  assert.deepEqual(kinds(signals(h, checks(...all.map((d) => [d])), '2026-10-15')), ['failed']); // zonder iets op de 13e wel
});

test('stil: een half gehaalde teller en een bewust overgeslagen dag tellen als bezig zijn', () => {
  const h = habit(daily, '2026-10-01');
  const partial = checks(...Array.from({ length: 12 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, 'partial']));
  assert.deepEqual(only('silent', signals(h, partial, '2026-10-12')), []);
  const m = habit(perMonth(2), '2026-09-01');
  assert.deepEqual(only('silent', signals(m, checks(['2026-09-04'], ['2026-10-10', 'skipped']), '2026-10-30')), []); // 20 dagen na het overslaan
  assert.deepEqual(kinds(only('silent', signals(m, checks(['2026-09-04'], ['2026-10-10', 'skipped']), '2026-11-01'))), ['silent']); // 22 dagen
});

test('de meldmomenten beginnen op de eerste dag dat het signaal te zien is: de dag na de vaste dag, de dag na een mislukte week', () => {
  const late = habit(onDay(3), '2026-08-01');
  assert.equal(only('late', signals(late, [], '2026-10-04'))[0].episode, '2026-10-04');
  const weekly = habit(perWeek(3), '2026-09-01');
  const failed = only('failed', signals(weekly, [], '2026-10-19'))[0];
  assert.equal(failed.episode, '2026-10-19'); // de week van 12 tot en met 18 oktober
});
