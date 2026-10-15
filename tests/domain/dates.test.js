import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, dayOfMonth, daysInMonth, diffDays, eachDay, endOfMonth, endOfWeek,
  isValidDate, startOfMonth, startOfWeek, todayFor, weekday,
} from '../../src/domain/dates.js';

test('isValidDate: schrikkeljaar en onzin', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-1'), false);
  assert.equal(isValidDate(20261015), false);
});

test('addDays en diffDays over maand- en jaargrenzen', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(diffDays('2026-10-15', '2026-10-12'), 3);
  assert.equal(diffDays('2026-10-12', '2026-10-15'), -3);
  assert.equal(diffDays('2027-01-01', '2026-01-01'), 365);
});

test('addDays werkt over zomertijdwissels heen (rekent in UTC-dagen)', () => {
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(diffDays('2026-03-30', '2026-03-28'), 2);
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
});

test('weekday: maandag is 0, zondag is 6', () => {
  assert.equal(weekday('2026-10-12'), 0);
  assert.equal(weekday('2026-10-15'), 3);
  assert.equal(weekday('2026-10-18'), 6);
});

test('startOfWeek / endOfWeek: week loopt maandag t/m zondag, ook over jaargrens', () => {
  assert.equal(startOfWeek('2026-10-18'), '2026-10-12');
  assert.equal(endOfWeek('2026-10-12'), '2026-10-18');
  assert.equal(startOfWeek('2027-01-01'), '2026-12-28');
  assert.equal(endOfWeek('2027-01-01'), '2027-01-03');
});

test('maandlengtes 28/29/30/31', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 10), 31);
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(endOfMonth('2028-02-01'), '2028-02-29');
  assert.equal(startOfMonth('2026-10-15'), '2026-10-01');
  assert.equal(dayOfMonth('2026-10-05'), 5);
});

test('addMonths geeft de eerste van de maand, ook over jaargrens', () => {
  assert.equal(addMonths('2026-10-15', 1), '2026-11-01');
  assert.equal(addMonths('2026-12-31', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', -1), '2025-12-01');
  assert.equal(addMonths('2026-01-31', 0), '2026-01-01');
});

test('eachDay is inclusief en leeg bij omgekeerd bereik', () => {
  assert.deepEqual(eachDay('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(eachDay('2026-10-02', '2026-10-01'), []);
});

test('ongeldige datum gooit een fout', () => {
  assert.throws(() => addDays('2026-02-30', 1), RangeError);
});

const AMS = 'Europe/Amsterdam';

test('todayFor: dagwissel 04:00 — om 03:30 hoort het nog bij gisteren', () => {
  // 2026-10-15 01:30Z = 03:30 CEST
  assert.equal(todayFor(new Date('2026-10-15T01:30:00Z'), AMS, 4), '2026-10-14');
  // 02:30Z = 04:30 CEST
  assert.equal(todayFor(new Date('2026-10-15T02:30:00Z'), AMS, 4), '2026-10-15');
});

test('todayFor: dagwissel 0 gebruikt gewoon de lokale kalenderdag', () => {
  // 22:30Z = 00:30 CEST op 16 oktober
  assert.equal(todayFor(new Date('2026-10-15T22:30:00Z'), AMS, 0), '2026-10-16');
  assert.equal(todayFor(new Date('2026-10-15T21:30:00Z'), AMS, 0), '2026-10-15');
});

test('todayFor: zomertijd naar wintertijd (25 okt 2026) — beide 02:30-momenten zijn nog 24 okt', () => {
  assert.equal(todayFor(new Date('2026-10-25T00:30:00Z'), AMS, 4), '2026-10-24'); // 02:30 CEST
  assert.equal(todayFor(new Date('2026-10-25T01:30:00Z'), AMS, 4), '2026-10-24'); // 02:30 CET
  assert.equal(todayFor(new Date('2026-10-25T03:30:00Z'), AMS, 4), '2026-10-25'); // 04:30 CET
});

test('todayFor: wintertijd naar zomertijd (29 mrt 2026)', () => {
  assert.equal(todayFor(new Date('2026-03-29T01:30:00Z'), AMS, 4), '2026-03-28'); // 03:30 CEST
  assert.equal(todayFor(new Date('2026-03-29T02:30:00Z'), AMS, 4), '2026-03-29'); // 04:30 CEST
});

test('todayFor: tijdzone bepaalt de lokale dag (zelfde moment, andere dag)', () => {
  const now = new Date('2026-10-15T20:00:00Z');
  assert.equal(todayFor(now, 'Europe/Amsterdam', 4), '2026-10-15'); // 22:00
  assert.equal(todayFor(now, 'Pacific/Auckland', 4), '2026-10-16'); // 09:00 de volgende dag
});

test('todayFor: ongeldig dagwissel-uur wordt geweigerd', () => {
  assert.throws(() => todayFor(new Date(), AMS, 7), RangeError);
  assert.throws(() => todayFor(new Date(), AMS, -1), RangeError);
  assert.throws(() => todayFor(new Date(), AMS, 3.5), RangeError);
});
