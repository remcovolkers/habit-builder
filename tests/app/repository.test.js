import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../src/data/repository.js';
import { createMemoryStore } from '../../src/data/memory-store.js';
import { testRepo, validHabit } from './helpers.js';

test('memory-store geeft kopieën terug: aanpassen van het resultaat verandert de opslag niet', async () => {
  const store = createMemoryStore();
  await store.put('habits', { id: 'a', name: 'x' });
  const copy = await store.get('habits', 'a');
  copy.name = 'veranderd';
  assert.equal((await store.get('habits', 'a')).name, 'x');
  assert.equal(await store.get('habits', 'bestaat-niet'), null);
});

test('instellingen: standaardwaarden, bewaren en validatie', async () => {
  const { repo } = testRepo();
  const defaults = await repo.getSettings();
  assert.equal(defaults.timezone, 'Europe/Amsterdam');
  assert.equal(defaults.dayStartHour, 4);

  await repo.saveSettings({ dayStartHour: 2 });
  assert.equal((await repo.getSettings()).dayStartHour, 2);
  assert.equal((await repo.getSettings()).timezone, 'Europe/Amsterdam');

  await assert.rejects(() => repo.saveSettings({ dayStartHour: 9 }), ValidationError);
  assert.equal((await repo.getSettings()).dayStartHour, 2); // mislukte opslag verandert niets
});

test('habits: id wordt gegenereerd, naam getrimd, timestamps gezet', async () => {
  const { repo } = testRepo();
  const saved = await repo.saveHabit(validHabit({ name: '  Lezen  ' }));
  assert.equal(saved.id, 'id-1');
  assert.equal(saved.name, 'Lezen');
  assert.ok(saved.createdAt && saved.updatedAt);
  assert.equal(saved.deletedAt, null);
});

test('habits: bijwerken behoudt createdAt en ververst updatedAt', async () => {
  const { repo } = testRepo();
  const first = await repo.saveHabit(validHabit());
  const second = await repo.saveHabit({ ...first, name: 'Meer lezen' });
  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.notEqual(second.updatedAt, first.updatedAt);
  assert.equal((await repo.getHabit(first.id)).name, 'Meer lezen');
});

test('habits: ongeldige invoer wordt geweigerd en niet opgeslagen', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => repo.saveHabit(validHabit({ name: '' })), (e) => e instanceof ValidationError && e.errors[0].field === 'name');
  assert.deepEqual(await repo.listHabits(), []);
});

test('habits: gesorteerd op sortOrder; zacht verwijderen verbergt maar bewaart', async () => {
  const { repo, store } = testRepo();
  const b = await repo.saveHabit(validHabit({ name: 'B', sortOrder: 1 }));
  const a = await repo.saveHabit(validHabit({ name: 'A', sortOrder: 0 }));
  assert.deepEqual((await repo.listHabits()).map((h) => h.name), ['A', 'B']);

  assert.equal(await repo.deleteHabit(a.id), true);
  assert.equal(await repo.deleteHabit(a.id), false); // al weg
  assert.deepEqual((await repo.listHabits()).map((h) => h.id), [b.id]);
  assert.equal(await repo.getHabit(a.id), null);
  assert.equal((await store.getAll('habits')).length, 2); // blijft voor sync
  assert.ok((await store.get('habits', a.id)).deletedAt);
});

test('check-ins: een per habit en datum; opnieuw zetten overschrijft', async () => {
  const { repo } = testRepo();
  await repo.setCheckIn({ habitId: 'h', date: '2026-10-15', status: 'skipped', note: 'ziek' });
  await repo.setCheckIn({ habitId: 'h', date: '2026-10-15', status: 'done' });
  const all = await repo.listCheckIns();
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].status, all[0].note], ['done', null]);
  assert.deepEqual(await repo.getCheckIn('h', '2026-10-15'), all[0]);
});

test('check-ins: wissen en terugzetten; filter per habit', async () => {
  const { repo } = testRepo();
  await repo.setCheckIn({ habitId: 'a', date: '2026-10-14', status: 'done' });
  await repo.setCheckIn({ habitId: 'b', date: '2026-10-14', status: 'done' });
  assert.equal(await repo.clearCheckIn('a', '2026-10-14'), true);
  assert.equal(await repo.getCheckIn('a', '2026-10-14'), null);
  assert.deepEqual((await repo.listCheckIns('b')).length, 1);
  assert.equal((await repo.listCheckIns('a')).length, 0);
  await repo.setCheckIn({ habitId: 'a', date: '2026-10-14', status: 'minimal' }); // revive
  assert.equal((await repo.getCheckIn('a', '2026-10-14')).status, 'minimal');
});

test('check-ins: ongeldige invoer wordt geweigerd', async () => {
  const { repo } = testRepo();
  await assert.rejects(() => repo.setCheckIn({ habitId: 'h', date: '2026-02-30', status: 'done' }), ValidationError);
  await assert.rejects(() => repo.setCheckIn({ habitId: 'h', date: '2026-10-15', status: 'gedaan' }), ValidationError);
  await assert.rejects(() => repo.setCheckIn({ habitId: '', date: '2026-10-15', status: 'done' }), ValidationError);
});

test('pauzes: toevoegen, afsluiten, verwijderen en validatie', async () => {
  const { repo } = testRepo();
  const pause = await repo.addPause({ habitId: 'h', from: '2026-10-10' });
  assert.equal(pause.to, null);
  assert.equal((await repo.updatePause(pause.id, { to: '2026-10-12' })).to, '2026-10-12');
  await assert.rejects(() => repo.updatePause(pause.id, { to: '2026-10-01' }), ValidationError);
  await assert.rejects(() => repo.addPause({ habitId: 'h', from: '2026-10-10', to: '2026-10-09' }), ValidationError);
  assert.equal(await repo.removePause(pause.id), true);
  assert.deepEqual(await repo.listPauses('h'), []);
  assert.equal(await repo.updatePause('bestaat-niet', { to: '2026-10-12' }), null);
});

test('dagplannen: zetten is idempotent; wissen en validatie', async () => {
  const { repo } = testRepo();
  await repo.setDayPlan({ habitId: 'h', date: '2026-10-15' });
  await repo.setDayPlan({ habitId: 'h', date: '2026-10-15' });
  assert.equal((await repo.listDayPlans()).length, 1);
  await repo.clearDayPlan('h', '2026-10-15');
  assert.deepEqual(await repo.listDayPlans(), []);
  await assert.rejects(() => repo.setDayPlan({ habitId: 'h', date: 'nope' }), ValidationError);
});

test('snapshot bevat alle collecties', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(validHabit());
  await repo.setCheckIn({ habitId: habit.id, date: '2026-10-14', status: 'done' });
  await repo.addPause({ habitId: habit.id, from: '2026-10-10', to: '2026-10-11' });
  await repo.setDayPlan({ habitId: habit.id, date: '2026-10-15' });
  const snap = await repo.snapshot();
  assert.deepEqual(
    [snap.habits.length, snap.checkIns.length, snap.pauses.length, snap.dayPlans.length, snap.settings.dayStartHour],
    [1, 1, 1, 1, 4],
  );
});
