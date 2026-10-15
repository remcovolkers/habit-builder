import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHabit } from '../../src/domain/habit.js';
import { defaultSettings, isValidTimeZone, validateSettings } from '../../src/app/settings.js';
import { validHabit } from './helpers.js';

const codes = (errors) => errors.map((e) => `${e.field}.${e.code}`);

test('validateHabit: een geldige habit heeft geen fouten', () => {
  assert.deepEqual(validateHabit(validHabit()), []);
});

test('validateHabit: naam is verplicht en maximaal 60 tekens (na trimmen)', () => {
  assert.deepEqual(codes(validateHabit(validHabit({ name: '   ' }))), ['name.required']);
  assert.deepEqual(codes(validateHabit(validHabit({ name: 'x'.repeat(61) }))), ['name.too_long']);
  assert.deepEqual(validateHabit(validHabit({ name: ` ${'x'.repeat(60)} ` })), []);
});

test('validateHabit: icoon, kleur, dagdeel, status en datums', () => {
  const bad = validHabit({ icon: '', color: 'zwart', daypart: 'nacht', status: 'weg', startDate: '2026-02-30', endDate: 'morgen' });
  assert.deepEqual(codes(validateHabit(bad)).sort(), [
    'color.invalid', 'daypart.invalid', 'endDate.invalid', 'icon.required', 'startDate.invalid', 'status.invalid',
  ]);
});

test('validateHabit: tekstvelden maximaal 200 tekens; graduationDays 7–365', () => {
  const long = 'x'.repeat(201);
  assert.deepEqual(codes(validateHabit(validHabit({ cue: long, why: long, minimalVersion: long }))).sort(), [
    'cue.too_long', 'minimalVersion.too_long', 'why.too_long',
  ]);
  assert.deepEqual(codes(validateHabit(validHabit({ graduationDays: 6 }))), ['graduationDays.invalid']);
  assert.deepEqual(codes(validateHabit(validHabit({ graduationDays: 366 }))), ['graduationDays.invalid']);
  assert.deepEqual(validateHabit(validHabit({ graduationDays: 100 })), []);
});

test('validateHabit: schema-fouten komen met detail; schema mag niet na de startdatum beginnen', () => {
  const invalid = validateHabit(validHabit({ schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'weekdays', weekdays: [] } }] }));
  assert.deepEqual(codes(invalid), ['schedule.invalid']);
  assert.ok(invalid[0].detail);
  const late = validateHabit(validHabit({ schedules: [{ effectiveFrom: '2026-10-05', schedule: { type: 'day_of_month', day: 3 } }] }));
  assert.deepEqual(codes(late), ['schedule.starts_after_habit']);
  assert.deepEqual(codes(validateHabit(validHabit({ schedules: [] }))), ['schedule.invalid']);
});

test('instellingen: standaard dagwissel is 04:00', () => {
  assert.deepEqual(defaultSettings('Europe/Amsterdam'), { id: 'user', timezone: 'Europe/Amsterdam', dayStartHour: 4 });
});

test('instellingen: tijdzone- en dagwisselvalidatie', () => {
  assert.equal(isValidTimeZone('Europe/Amsterdam'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
  assert.equal(isValidTimeZone(''), false);
  assert.deepEqual(validateSettings({ timezone: 'Europe/Amsterdam', dayStartHour: 0 }), []);
  assert.deepEqual(validateSettings({ timezone: 'Europe/Amsterdam', dayStartHour: 6 }), []);
  assert.deepEqual(codes(validateSettings({ timezone: 'Europe/Amsterdam', dayStartHour: 7 })), ['dayStartHour.invalid']);
  assert.deepEqual(codes(validateSettings({ timezone: 'Europe/Amsterdam', dayStartHour: 3.5 })), ['dayStartHour.invalid']);
  assert.deepEqual(codes(validateSettings({ timezone: 'nope', dayStartHour: 4 })), ['timezone.invalid']);
});
