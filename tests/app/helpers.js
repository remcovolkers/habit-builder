import { createMemoryStore } from '../../src/data/memory-store.js';
import { createRepository } from '../../src/data/repository.js';
import { ALL_WEEKDAYS } from '../../src/domain/schedule.js';

export const TODAY = '2026-10-15'; // donderdag

/** Repository op een geheugenstore met een vaste klok en voorspelbare id's. */
export function testRepo() {
  let tick = 0;
  let nextId = 0;
  const store = createMemoryStore();
  const repo = createRepository({
    store,
    now: () => `2026-10-15T08:00:${String(tick++).padStart(2, '0')}.000Z`,
    uuid: () => `id-${++nextId}`,
    timezone: () => 'Europe/Amsterdam',
  });
  return { repo, store };
}

export const validHabit = (over = {}) => ({
  name: 'Lezen',
  icon: '📖',
  color: 'c1',
  daypart: 'morning',
  status: 'active',
  startDate: '2026-10-01',
  endDate: null,
  cue: null,
  why: null,
  minimalVersion: null,
  sortOrder: 0,
  schedules: [{ effectiveFrom: '2026-10-01', schedule: { type: 'weekdays', weekdays: [...ALL_WEEKDAYS] } }],
  ...over,
});
