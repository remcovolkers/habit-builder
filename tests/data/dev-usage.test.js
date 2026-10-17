// De teller voor de ontwikkelaar aan de kant van de app: een antwoord wordt netjes vertaald, al het andere wordt null en gooit nooit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDevUsage } from '../../src/data/dev-usage.js';

const client = (result) => async () => ({ rpc: async (fn) => { assert.equal(fn, 'dev_usage'); return result; } });

test('een antwoord van de server wordt { users, activeToday }', async () => {
  assert.deepEqual(await fetchDevUsage(client({ data: { users: 12, active_today: 5 }, error: null })), { users: 12, activeToday: 5 });
  assert.deepEqual(await fetchDevUsage(client({ data: { users: 0, active_today: 0 }, error: null })), { users: 0, activeToday: 0 });
});

test('geen beheerder (null), een fout of onzin in het antwoord: null', async () => {
  assert.equal(await fetchDevUsage(client({ data: null, error: null })), null);
  assert.equal(await fetchDevUsage(client({ data: null, error: { code: 'PGRST202' } })), null);
  assert.equal(await fetchDevUsage(client({ data: { users: 'veel', active_today: 1 }, error: null })), null);
  assert.equal(await fetchDevUsage(client({ data: { users: 1 }, error: null })), null);
});

test('geen verbinding of een client die niet te laden is: null, geen fout', async () => {
  assert.equal(await fetchDevUsage(async () => ({ rpc: async () => { throw new TypeError('Failed to fetch'); } })), null);
  assert.equal(await fetchDevUsage(async () => { throw new Error('SDK niet te laden'); }), null);
});
