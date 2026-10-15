import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countActiveDays, phaseFor } from '../../src/domain/phases.js';
import { evaluateGraduation } from '../../src/domain/graduation.js';
import { canBackfill, isTracked } from '../../src/domain/rules.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { habit, weekdaysSchedule } from './helpers.js';

const daily = weekdaysSchedule(ALL_WEEKDAYS);
const h = (start, extra) => habit(daily, start, extra);

test('actieve dagen: telt vandaag mee; toekomstige start is 0', () => {
  assert.equal(countActiveDays({ habit: h('2026-10-15'), today: '2026-10-15' }), 1);
  assert.equal(countActiveDays({ habit: h('2026-10-01'), today: '2026-10-15' }), 15);
  assert.equal(countActiveDays({ habit: h('2026-10-20'), today: '2026-10-15' }), 0);
});

test('actieve dagen: gepauzeerde dagen tellen niet mee', () => {
  const today = '2026-10-15';
  assert.equal(countActiveDays({ habit: h('2026-10-01'), pauses: [{ from: '2026-10-05', to: '2026-10-07' }], today }), 12);
});

test('actieve dagen: overlappende pauzes worden niet dubbel afgetrokken', () => {
  const pauses = [
    { from: '2026-10-05', to: '2026-10-08' },
    { from: '2026-10-07', to: '2026-10-10' },
    { from: '2026-10-06', to: '2026-10-07' }, // volledig binnen de eerste
  ];
  assert.equal(countActiveDays({ habit: h('2026-10-01'), pauses, today: '2026-10-15' }), 15 - 6);
});

test('actieve dagen: open pauze, pauze vóór de start en pauze na vandaag', () => {
  const today = '2026-10-15';
  assert.equal(countActiveDays({ habit: h('2026-10-01'), pauses: [{ from: '2026-10-12', to: null }], today }), 11);
  assert.equal(countActiveDays({ habit: h('2026-10-01'), pauses: [{ from: '2026-09-20', to: '2026-10-02' }], today }), 13);
  assert.equal(countActiveDays({ habit: h('2026-10-01'), pauses: [{ from: '2026-10-20', to: '2026-10-25' }], today }), 15);
});

test('actieve dagen: stopt bij de einddatum', () => {
  assert.equal(countActiveDays({ habit: h('2026-10-01', { endDate: '2026-10-10' }), today: '2026-10-15' }), 10);
});

test('fases: planned → starting → building; established alleen na bevestiging', () => {
  assert.equal(phaseFor({ activeDays: 0 }).phase, 'planned');
  assert.equal(phaseFor({ activeDays: 1 }).phase, 'starting');
  assert.equal(phaseFor({ activeDays: 21 }).phase, 'starting');
  assert.equal(phaseFor({ activeDays: 22 }).phase, 'building');
  assert.equal(phaseFor({ activeDays: 120 }).phase, 'building'); // 66+ maar niet bevestigd
  assert.equal(phaseFor({ activeDays: 120, graduated: true }).phase, 'established');
});

test('fases: voortgang richting 66 dagen is begrensd op 0..1', () => {
  assert.equal(phaseFor({ activeDays: 33 }).progress, 0.5);
  assert.equal(phaseFor({ activeDays: 200 }).progress, 1);
  assert.equal(phaseFor({ activeDays: 50, graduationDays: 100 }).progress, 0.5);
});

test('ingeburgerd: 66 dagen en 80% consistentie', () => {
  assert.equal(evaluateGraduation({ activeDays: 66, consistencyRate: 0.8 }).eligible, true);
  assert.equal(evaluateGraduation({ activeDays: 65, consistencyRate: 1 }).eligible, false);
  assert.equal(evaluateGraduation({ activeDays: 100, consistencyRate: 0.79 }).eligible, false);
  assert.equal(evaluateGraduation({ activeDays: 100, consistencyRate: null }).eligible, false);
});

test('ingeburgerd: eigen aantal dagen per habit', () => {
  assert.equal(evaluateGraduation({ activeDays: 80, graduationDays: 100, consistencyRate: 1 }).eligible, false);
  assert.equal(evaluateGraduation({ activeDays: 100, graduationDays: 100, consistencyRate: 1 }).eligible, true);
});

test('ingeburgerd: automatisme telt alleen mee als het aan staat, en moet ≥ 4 zijn', () => {
  const base = { activeDays: 80, consistencyRate: 0.9 };
  assert.equal(evaluateGraduation({ ...base, automaticityScore: 1 }).eligible, true); // uit
  assert.equal(evaluateGraduation({ ...base, useAutomaticity: true, automaticityScore: 3 }).eligible, false);
  assert.equal(evaluateGraduation({ ...base, useAutomaticity: true, automaticityScore: 4 }).eligible, true);
  assert.equal(evaluateGraduation({ ...base, useAutomaticity: true, automaticityScore: null }).eligible, false);
  const result = evaluateGraduation({ ...base, useAutomaticity: true, automaticityScore: 3 });
  assert.deepEqual(result.criteria.map((c) => [c.key, c.met]), [['days', true], ['consistency', true], ['automaticity', false]]);
});

test('terugwerkend invullen: vandaag t/m 14 dagen terug, nooit in de toekomst', () => {
  const today = '2026-10-15';
  assert.equal(canBackfill('2026-10-15', today), true);
  assert.equal(canBackfill('2026-10-01', today), true);
  assert.equal(canBackfill('2026-09-30', today), false);
  assert.equal(canBackfill('2026-10-16', today), false);
});

test('isTracked: gearchiveerd, toekomstig, afgelopen en ingeburgerd', () => {
  const today = '2026-10-15';
  assert.equal(isTracked(h('2026-10-01'), today), true);
  assert.equal(isTracked(h('2026-10-01', { status: 'archived' }), today), false);
  assert.equal(isTracked(h('2026-10-20', { status: 'planned' }), today), false);
  assert.equal(isTracked(h('2026-10-15', { status: 'planned' }), today), true);
  assert.equal(isTracked(h('2026-10-01', { endDate: '2026-10-10' }), today), false);
  assert.equal(isTracked(h('2026-10-01', { status: 'graduated' }), today), false);
  assert.equal(isTracked(h('2026-10-01', { status: 'graduated', maintenance: true }), today), true);
});
