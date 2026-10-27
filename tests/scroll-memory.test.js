import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScrollMemory } from '../src/ui/scroll-memory.js';

const counter = () => { let n = 0; return () => `id${++n}`; };

test('een nieuwe ingang krijgt een id en begint bovenaan (niets om te herstellen)', () => {
  const memory = createScrollMemory({ makeId: counter() });
  assert.deepEqual(memory.enter(null), { id: 'id1', isNew: true, restore: null });
});

test('terug naar een ingang herstelt de plek die erbij hoorde', () => {
  const memory = createScrollMemory({ makeId: counter() });
  const first = memory.enter(null);
  memory.save({ page: 420, outlet: 0 });
  memory.enter(null); // een nieuwe pagina: begint bovenaan
  memory.save({ page: 10, outlet: 0 });
  const back = memory.enter({ hbEntry: first.id });
  assert.equal(back.isNew, false);
  assert.deepEqual(back.restore, { page: 420, outlet: 0 });
});

test('de plek van de ene ingang wordt nooit voor een andere gebruikt', () => {
  const memory = createScrollMemory({ makeId: counter() });
  const a = memory.enter(null);
  memory.save({ page: 100, outlet: 5 });
  const b = memory.enter(null);
  memory.save({ page: 200, outlet: 6 });
  assert.deepEqual(memory.enter({ hbEntry: a.id }).restore, { page: 100, outlet: 5 });
  assert.deepEqual(memory.enter({ hbEntry: b.id }).restore, { page: 200, outlet: 6 });
});

test('een id uit een vorige sessie (na herladen) herstelt niets, maar blijft hetzelfde id', () => {
  const memory = createScrollMemory({ makeId: counter() });
  const result = memory.enter({ hbEntry: 'oud-van-gisteren' });
  assert.deepEqual(result, { id: 'oud-van-gisteren', isNew: false, restore: null });
});

test('een history.state zonder id (door een replaceState elders) telt als een nieuwe ingang', () => {
  const memory = createScrollMemory({ makeId: counter() });
  assert.equal(memory.enter({ iets: 'anders' }).isNew, true);
  assert.equal(memory.enter({ hbEntry: 42 }).isNew, true); // geen tekst: dat hebben wij niet geschreven
});

test('opslaan vóór de eerste ingang doet niets', () => {
  const memory = createScrollMemory();
  assert.doesNotThrow(() => memory.save({ page: 1, outlet: 1 }));
});

test('hoogstens 100 ingangen: de oudste valt eruit, de rest blijft', () => {
  const memory = createScrollMemory({ makeId: counter() });
  const first = memory.enter(null);
  memory.save({ page: 1, outlet: 0 });
  for (let i = 0; i < 100; i++) { memory.enter(null); memory.save({ page: i, outlet: 0 }); }
  assert.equal(memory.enter({ hbEntry: first.id }).restore, null);
  assert.notEqual(memory.enter({ hbEntry: 'id101' }).restore, null);
});
