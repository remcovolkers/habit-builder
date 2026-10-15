import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatmap } from '../../src/domain/heatmap.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';
import { checks, habit, perWeek, weekdaysSchedule } from './helpers.js';

const daily = weekdaysSchedule(ALL_WEEKDAYS);
const TODAY = '2026-10-15'; // donderdag; huidige week 12–18 okt
const flat = (map) => map.weeks.flat();
const cell = (map, date) => flat(map).find((c) => c.date === date);

test('raster: 6 weken van ma t/m zo, laatste week is de huidige', () => {
  const map = buildHeatmap({ habit: habit(daily, '2026-08-01'), today: TODAY });
  assert.equal(map.weeks.length, 6);
  assert.ok(map.weeks.every((w) => w.length === 7));
  assert.equal(map.weeks[0][0].date, '2026-09-07'); // maandag, 5 weken voor 12 okt
  assert.equal(map.weeks[5][0].date, '2026-10-12');
  assert.equal(map.weeks[5][6].date, '2026-10-18');
  assert.equal(flat(map).filter((c) => c.today).length, 1);
  assert.equal(cell(map, TODAY).today, true);
});

test('staten: gedaan, minimaal, overgeslagen, gemist, open en toekomst', () => {
  const map = buildHeatmap({
    habit: habit(daily, '2026-10-01'),
    checkIns: checks(['2026-10-12', 'done'], ['2026-10-13', 'minimal'], ['2026-10-14', 'skipped']),
    today: TODAY,
  });
  assert.equal(cell(map, '2026-10-12').state, 'done');
  assert.equal(cell(map, '2026-10-13').state, 'minimal');
  assert.equal(cell(map, '2026-10-14').state, 'skipped');
  assert.equal(cell(map, '2026-10-11').state, 'missed');
  assert.equal(cell(map, TODAY).state, 'open');
  assert.equal(cell(map, '2026-10-16').state, 'future');
});

test('dagen vóór de start en na het einde zijn "none"; pauze is "paused"', () => {
  const map = buildHeatmap({
    habit: habit(daily, '2026-10-05', { endDate: '2026-10-13' }),
    pauses: [{ from: '2026-10-07', to: '2026-10-08' }],
    today: TODAY,
  });
  assert.equal(cell(map, '2026-10-04').state, 'none');
  assert.equal(cell(map, '2026-10-07').state, 'paused');
  assert.equal(cell(map, '2026-10-13').state, 'missed');
  assert.equal(cell(map, '2026-10-14').state, 'none'); // na einddatum
});

test('vaste weekdagen: niet-geplande dagen zijn "none", maar een logging op zo\'n dag telt wel', () => {
  const map = buildHeatmap({
    habit: habit(weekdaysSchedule([0, 2, 4]), '2026-10-01'), // ma, wo, vr
    checkIns: checks(['2026-10-13']), // dinsdag, niet gepland
    today: TODAY,
  });
  assert.equal(cell(map, '2026-10-13').state, 'done');
  assert.equal(cell(map, '2026-10-10').state, 'none'); // zaterdag
  assert.equal(cell(map, '2026-10-09').state, 'missed'); // vrijdag, gepland en niet gedaan
});

test('flexibele habit: alleen gedane dagen kleuren, de rest is "none"', () => {
  const map = buildHeatmap({
    habit: habit(perWeek(2), '2026-10-01'),
    checkIns: checks(['2026-10-06'], ['2026-10-13']),
    today: TODAY,
  });
  assert.equal(cell(map, '2026-10-06').state, 'done');
  assert.equal(cell(map, '2026-10-07').state, 'none');
  assert.equal(cell(map, '2026-10-14').state, 'none');
});

test('eigen aantal weken', () => {
  const map = buildHeatmap({ habit: habit(daily, '2026-10-01'), today: TODAY, weeks: 2 });
  assert.equal(map.weeks.length, 2);
  assert.equal(map.weeks[0][0].date, '2026-10-05');
});
