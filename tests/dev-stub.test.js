// Het gevulde testaccount (tools/lib/stub-data.mjs) moet echt elke toestand bevatten, op elke dag van het jaar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttention } from '../src/app/attention.js';
import { buildDayView } from '../src/app/day-view.js';
import { buildHabitDetail } from '../src/app/habit-detail.js';
import { createMemoryStore } from '../src/data/memory-store.js';
import { createRepository } from '../src/data/repository.js';
import { fillStubAccount } from '../tools/lib/stub-data.mjs';

async function stub(today) {
  const repo = createRepository({ store: createMemoryStore(), timezone: () => 'Europe/Amsterdam' });
  const created = await fillStubAccount(repo, today);
  const snapshot = await repo.snapshot();
  const byName = (name) => snapshot.habits.find((habit) => habit.name === name);
  return { snapshot, created, byName };
}

test('het stub-account heeft een habit voor elke toestand', async () => {
  const today = '2026-10-16';
  const { snapshot, created, byName } = await stub(today);
  assert.equal(created.length, 13);
  assert.equal(snapshot.habits.length, 13);
  assert.equal(snapshot.settings.displayName, 'Remco (stub)');
  assert.equal(snapshot.reviews.length, 2);

  const statuses = Object.fromEntries(snapshot.habits.map((h) => [h.name, h.status]));
  assert.deepEqual([statuses.Dagboek, statuses['Spaans leren'], statuses.Zwemmen], ['graduated', 'archived', 'planned']);
  assert.equal(snapshot.pauses.length, 1);

  const attention = Object.fromEntries(buildAttention({ snapshot, today }).map((item) => [item.habit.name, item]));
  assert.deepEqual([attention['Bed opmaken'].signal.kind, attention['Bed opmaken'].handled], ['silent', false]);
  assert.deepEqual([attention['Gordijnen wassen'].signal.kind, attention['Gordijnen wassen'].handled], ['silent', true]);
  assert.deepEqual([attention['Rekening betalen'].signal.kind, attention.Meditatie.signal.kind], ['late', 'failed']);

  const view = buildDayView({ snapshot, date: today, today });
  assert.ok(view.groups.flatMap((g) => g.entries).some((e) => e.habit.name === 'Rekening betalen' && e.overdue));
  assert.ok(view.pool.some((e) => e.habit.name === 'Gitaar spelen'));
  // Tandenpoetsen staat in twee dagdelen: de ochtend is gedaan, de avond staat open
  const teeth = view.groups.flatMap((g) => g.entries.filter((e) => e.habit.name === 'Tandenpoetsen').map((e) => [g.daypart, e.partDone]));
  assert.deepEqual(teeth, [['morning', true], ['evening', false]]);

  const detail = (name) => buildHabitDetail({ habit: byName(name), snapshot, today });
  assert.equal(detail('Water drinken').canGraduate, true);
  assert.deepEqual(detail('Bed opmaken').progress, { unit: 'times', value: 4, total: 8 });
  assert.equal(detail('Bed opmaken').automaticityRequired, true);
  assert.equal(detail('Lezen').stats.phase.phase, 'starting');
  assert.equal(detail('Hardlopen').stats.phase.phase, 'building');
});

test('het stub-account laat zich op elke dag aanmaken, ook de 1e en de laatste van de maand en rond de jaarwisseling', async () => {
  for (const today of ['2026-11-01', '2026-10-31', '2026-02-28', '2027-01-01', '2026-03-29']) {
    const { snapshot } = await stub(today);
    assert.equal(snapshot.habits.length, 13, today);
  }
});
