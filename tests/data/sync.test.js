import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/data/memory-store.js';
import { createRepository } from '../../src/data/repository.js';
import { createSyncEngine, readMeta, SYNC_PAGE } from '../../src/data/sync.js';
import { adoptUser, bindUser, countPending, markAllPending, unlinkAccount, wipeLocalData } from '../../src/data/account-link.js';
import { createSupabaseRemote } from '../../src/data/supabase-remote.js';
import { hasStoredSession, isAuthCallback, sessionStorageKey } from '../../src/data/auth.js';
import { validHabit } from '../app/helpers.js';

// --- een nagebootste server (zoals public.records: seq loopt op bij elke schrijfactie) ----------------

function createFakeServer() {
  const rows = new Map();
  let seq = 0;
  const server = {
    rows,
    pushCalls: 0,
    pullCalls: 0,
    rejectIds: new Set(), // ids die de server als onverwerkbaar afwijst (permanent)
    failNext: null, // een fout die de eerstvolgende push of pull gooit
    onPush: null, // hook: draait tijdens een push (voor "wijziging tijdens het versturen")
    onPull: null, // hook: draait tijdens een pull, vóór de rijen terugkomen
    remote() {
      return {
        push: async (incoming) => {
          server.pushCalls += 1;
          if (server.failNext) {
            const error = server.failNext;
            server.failNext = null;
            throw error;
          }
          if (incoming.some((row) => server.rejectIds.has(row.id))) {
            const error = new Error('constraint');
            error.permanent = true;
            throw error;
          }
          for (const row of incoming) {
            seq += 1;
            rows.set(`${row.collection}|${row.id}`, { ...structuredClone(row), seq });
          }
          await server.onPush?.();
        },
        pull: async (cursor, limit) => {
          server.pullCalls += 1;
          if (server.failNext) {
            const error = server.failNext;
            server.failNext = null;
            throw error;
          }
          const result = [...rows.values()].filter((row) => row.seq > cursor).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => structuredClone(r));
          const hook = server.onPull;
          server.onPull = null;
          await hook?.();
          return result;
        },
      };
    },
    seed(collection, id, data, deleted_at = null) {
      seq += 1;
      rows.set(`${collection}|${id}`, { collection, id, data, deleted_at, seq });
    },
  };
  return server;
}

let uuidCounter = 0;
function device(server, name = 'x') {
  const store = createMemoryStore();
  const repo = createRepository({
    store,
    now: () => new Date().toISOString(),
    uuid: () => `${name}-${++uuidCounter}`,
    timezone: () => 'Europe/Amsterdam',
  });
  const engine = createSyncEngine({ store, remote: server.remote() });
  return { store, repo, engine };
}

const day = '2026-10-14';

// --- outbox in de repository ------------------------------------------------------------------------

test('elke schrijfactie komt in de outbox; opnieuw schrijven geeft dezelfde regel een nieuwe rev', async () => {
  const { repo, store } = device(createFakeServer());
  const habit = await repo.saveHabit(validHabit());
  await repo.setCheckIn({ habitId: habit.id, date: day, status: 'done' });
  let outbox = await store.getAll('outbox');
  assert.deepEqual(outbox.map((e) => e.id).sort(), [`checkIns|${habit.id}|${day}`, `habits|${habit.id}`].sort());

  const before = (await store.get('outbox', `habits|${habit.id}`)).rev;
  await repo.saveHabit({ ...habit, name: 'Anders' });
  const after = (await store.get('outbox', `habits|${habit.id}`)).rev;
  assert.notEqual(before, after);
  outbox = await store.getAll('outbox');
  assert.equal(outbox.length, 2);

  await repo.clearCheckIn(habit.id, day); // zacht verwijderen wordt ook gesynct
  assert.equal((await store.get('outbox', `checkIns|${habit.id}|${day}`)).collection, 'checkIns');
});

test('replaceAll: alles uit de import in de outbox, en grafstenen voor wat verdwijnt', async () => {
  const { repo, store } = device(createFakeServer());
  const oud = await repo.saveHabit(validHabit({ name: 'Oud' }));
  await store.clear('outbox');
  await repo.replaceAll({ habits: [{ ...validHabit({ name: 'Nieuw' }), id: 'nieuw-1' }], checkIns: [], pauses: [], dayPlans: [], achievements: [], ratings: [], reviews: [] });

  assert.deepEqual((await repo.listHabits()).map((h) => h.id), ['nieuw-1']);
  const tombstone = await store.get('habits', oud.id);
  assert.ok(tombstone.deletedAt);
  const ids = (await store.getAll('outbox')).map((e) => e.id);
  assert.ok(ids.includes('habits|nieuw-1') && ids.includes(`habits|${oud.id}`));
});

// --- de motor -------------------------------------------------------------------------------------------

test('push: records gaan naar de server en de outbox wordt leeg', async () => {
  const server = createFakeServer();
  const a = device(server);
  const habit = await a.repo.saveHabit(validHabit({ name: 'Lezen' }));
  await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'done', value: null });

  const result = await a.engine.request();
  assert.equal(result.pushed, 2);
  assert.equal(await countPending(a.store), 0);
  const row = server.rows.get(`habits|${habit.id}`);
  assert.equal(row.data.name, 'Lezen');
  assert.equal(row.deleted_at, null);
  assert.ok(server.rows.has(`checkIns|${habit.id}|${day}`));
});

test('twee apparaten komen op hetzelfde uit: aanmaken, wijzigen en verwijderen reizen mee', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  const b = device(server, 'b');

  const habit = await a.repo.saveHabit(validHabit({ name: 'Lezen' }));
  await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'done' });
  await a.engine.request();
  await b.engine.request();
  assert.deepEqual((await b.repo.listHabits()).map((h) => h.name), ['Lezen']);
  assert.equal((await b.repo.getCheckIn(habit.id, day)).status, 'done');

  await b.repo.setCheckIn({ habitId: habit.id, date: day, status: 'minimal' });
  await b.repo.saveHabit({ ...(await b.repo.getHabit(habit.id)), name: 'Meer lezen' });
  await b.engine.request();
  await a.engine.request();
  assert.equal((await a.repo.getCheckIn(habit.id, day)).status, 'minimal');
  assert.equal((await a.repo.getHabit(habit.id)).name, 'Meer lezen');

  await a.repo.clearCheckIn(habit.id, day);
  await a.repo.deleteHabit(habit.id);
  await a.engine.request();
  await b.engine.request();
  assert.equal(await b.repo.getCheckIn(habit.id, day), null);
  assert.deepEqual(await b.repo.listHabits(), []);
});

test('offline werken: wijzigingen blijven in de outbox en gaan mee zodra er weer verbinding is', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  const habit = await a.repo.saveHabit(validHabit());
  server.failNext = Object.assign(new Error('Failed to fetch'), { status: 0 });
  await assert.rejects(() => a.engine.request(), /Failed to fetch/);
  assert.equal(a.engine.status.state, 'error');
  assert.equal(await countPending(a.store), 1);

  await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'done' });
  assert.equal(await countPending(a.store), 2);
  await a.engine.request();
  assert.equal(await countPending(a.store), 0);
  assert.equal(a.engine.status.state, 'idle');
  assert.ok(a.engine.status.lastSyncAt);
  assert.equal(server.rows.size, 2);
});

test('een wijziging tijdens het versturen gaat niet verloren: ze gaat in een vervolgronde mee', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  const habit = await a.repo.saveHabit(validHabit());
  await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'skipped' });

  server.onPush = async () => {
    server.onPush = null;
    await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'done' }); // gebruiker tikt midden in de sync
  };
  await a.engine.request();
  assert.equal((await a.repo.getCheckIn(habit.id, day)).status, 'done');
  assert.equal(server.rows.get(`checkIns|${habit.id}|${day}`).data.status, 'done');
  assert.equal(await countPending(a.store), 0);
});

test('een wijziging tijdens het ophalen wordt niet door de binnenkomende (oudere) versie overschreven', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  const habit = await a.repo.saveHabit(validHabit());
  await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'skipped' });
  await a.engine.request(); // server en lokaal hebben nu "skipped"

  server.onPull = async () => {
    await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'done' }); // tikken terwijl de pull loopt
  };
  await a.engine.resetCursor(); // forceer dat de server-versie ("skipped") terugkomt
  await a.engine.request();
  assert.equal((await a.repo.getCheckIn(habit.id, day)).status, 'done', 'lokale wijziging blijft staan');
  assert.equal(server.rows.get(`checkIns|${habit.id}|${day}`).data.status, 'done', 'en gaat alsnog naar de server');
});

test('wie het laatst synct wint per record (laatste schrijver)', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  const b = device(server, 'b');
  const habit = await a.repo.saveHabit(validHabit({ name: 'Start' }));
  await a.engine.request();
  await b.engine.request();

  await a.repo.saveHabit({ ...(await a.repo.getHabit(habit.id)), name: 'Van A' });
  await b.repo.saveHabit({ ...(await b.repo.getHabit(habit.id)), name: 'Van B' });
  await a.engine.request();
  await b.engine.request(); // B pusht als laatste
  await a.engine.request();
  assert.equal((await a.repo.getHabit(habit.id)).name, 'Van B');
  assert.equal((await b.repo.getHabit(habit.id)).name, 'Van B');
});

test('pull: pagina\'s, cursor en onbekende collecties', async () => {
  const server = createFakeServer();
  for (let i = 0; i < SYNC_PAGE + 250; i += 1) {
    server.seed('checkIns', `h|2026-01-${i}`, { id: `h|2026-01-${i}`, habitId: 'h', date: '2026-01-01', status: 'done' });
  }
  server.seed('toekomst', 'x', { id: 'x' }); // een nieuwere app-versie kent meer collecties
  const a = device(server);
  const result = await a.engine.request();
  assert.equal(result.pulled, SYNC_PAGE + 250);
  assert.equal((await a.store.getAll('checkIns')).length, SYNC_PAGE + 250);
  assert.equal((await readMeta(a.store)).cursor, SYNC_PAGE + 251);

  const pullsBefore = server.pullCalls;
  await a.engine.request();
  assert.equal(server.pullCalls - pullsBefore, 1); // niets nieuws: één lege pull
});

test('een onverwerkbaar record blokkeert de rest niet en wordt losgelaten', async () => {
  const server = createFakeServer();
  const a = device(server);
  const good1 = await a.repo.saveHabit(validHabit({ name: 'Goed 1' }));
  const bad = await a.repo.saveHabit(validHabit({ name: 'Slecht', sortOrder: 1 }));
  const good2 = await a.repo.saveHabit(validHabit({ name: 'Goed 2', sortOrder: 2 }));
  server.rejectIds.add(bad.id);

  const result = await a.engine.request();
  assert.equal(result.dropped, 1);
  assert.ok(server.rows.has(`habits|${good1.id}`) && server.rows.has(`habits|${good2.id}`));
  assert.ok(!server.rows.has(`habits|${bad.id}`));
  assert.equal(await countPending(a.store), 0);
  assert.ok(await a.repo.getHabit(bad.id), 'lokaal blijft het record gewoon bestaan');
});

test('een tijdelijke fout (geen permanente) laat alles in de outbox staan', async () => {
  const server = createFakeServer();
  const a = device(server);
  await a.repo.saveHabit(validHabit());
  server.failNext = Object.assign(new Error('server error'), { status: 503 });
  await assert.rejects(() => a.engine.request(), /server error/);
  assert.equal(await countPending(a.store), 1);
});

test('één sync tegelijk; een verzoek tijdens een sync geeft direct een vervolgronde', async () => {
  const server = createFakeServer();
  const a = device(server);
  await a.repo.saveHabit(validHabit());
  const first = a.engine.request();
  const second = a.engine.request();
  assert.equal(first, second); // dezelfde belofte
  await first;
  assert.ok(server.pullCalls >= 2); // de tweede aanvraag zorgde voor een extra ronde
  assert.equal(a.engine.status.state, 'idle');
});

test('statuswijzigingen worden gemeld', async () => {
  const server = createFakeServer();
  const a = device(server);
  const seen = [];
  const stop = a.engine.subscribe((s) => seen.push(s.state));
  await a.engine.request();
  stop();
  await a.engine.request();
  assert.deepEqual(seen, ['syncing', 'idle']);
});

test('resetCursor haalt bij de volgende sync alles opnieuw op', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  await a.repo.saveHabit(validHabit());
  await a.engine.request();
  assert.ok((await readMeta(a.store)).cursor > 0);
  await a.engine.resetCursor();
  assert.equal((await readMeta(a.store)).cursor, 0);
  const same = await a.engine.request();
  assert.equal(same.pulled, 0); // alles was al identiek aanwezig: niets veranderd
  assert.ok((await readMeta(a.store)).cursor > 0);

  const [record] = await a.store.getAll('habits');
  await a.store.delete('habits', record.id); // lokaal kwijt (bv. opslag gewist)
  await a.engine.resetCursor();
  const restored = await a.engine.request();
  assert.equal(restored.pulled, 1);
  assert.equal((await a.repo.listHabits()).length, 1);
});

// --- account koppelen -------------------------------------------------------------------------------------

test('eerste inlog met alleen anonieme data: alles wordt van het account en gaat naar de server', async () => {
  const server = createFakeServer();
  const a = device(server);
  const habit = await a.repo.saveHabit(validHabit());
  await a.repo.setCheckIn({ habitId: habit.id, date: day, status: 'done' });
  await a.repo.deleteHabit('bestaat-niet'); // geen effect
  await a.store.clear('outbox'); // anoniem gebruik van vóór deze versie: geen outbox

  const result = await adoptUser({ store: a.store, userId: 'user-1' });
  assert.equal(result.action, 'adopted-local');
  assert.equal(result.pending, 2);
  assert.equal((await readMeta(a.store)).userId, 'user-1');
  await a.engine.request();
  assert.equal(server.rows.size, 2);
});

test('opnieuw inloggen met hetzelfde account verandert niets; een ander account wordt gemeld, niet uitgevoerd', async () => {
  const a = device(createFakeServer());
  await a.repo.saveHabit(validHabit());
  await adoptUser({ store: a.store, userId: 'user-1' });
  const pending = await countPending(a.store);

  assert.equal((await adoptUser({ store: a.store, userId: 'user-1' })).action, 'same');
  const other = await adoptUser({ store: a.store, userId: 'user-2' });
  assert.deepEqual([other.action, other.pending], ['other-account', pending]);
  assert.equal((await readMeta(a.store)).userId, 'user-1'); // niets is veranderd
  assert.equal((await a.repo.listHabits()).length, 1);
});

test('wisselen van account: wissen en binden geeft een schone lei met de data van het nieuwe account', async () => {
  const server = createFakeServer();
  const a = device(server, 'a');
  const b = device(server, 'b');
  await a.repo.saveHabit(validHabit({ name: 'Van oud account' }));
  await adoptUser({ store: a.store, userId: 'user-1' });

  server.rows.clear(); // de server van het andere account (eigen rijen)
  server.seed('habits', 'n1', { id: 'n1', ...validHabit({ name: 'Van nieuw account' }) });
  await wipeLocalData(a.store);
  assert.deepEqual(await a.repo.listHabits(), []);
  await bindUser(a.store, 'user-2');
  await a.engine.request();
  assert.deepEqual((await a.repo.listHabits()).map((h) => h.name), ['Van nieuw account']);
  assert.equal(await countPending(a.store), 0);
  assert.ok(b);
});

test('unlinkAccount: de data blijft, de koppeling verdwijnt', async () => {
  const a = device(createFakeServer());
  await a.repo.saveHabit(validHabit());
  await adoptUser({ store: a.store, userId: 'user-1' });
  await unlinkAccount(a.store);
  assert.equal((await a.repo.listHabits()).length, 1);
  assert.equal(await countPending(a.store), 0);
  assert.equal((await readMeta(a.store)).userId, null);
});

test('markAllPending neemt ook grafstenen mee', async () => {
  const a = device(createFakeServer());
  const habit = await a.repo.saveHabit(validHabit());
  await a.repo.deleteHabit(habit.id);
  await a.store.clear('outbox');
  await markAllPending(a.store);
  assert.equal(await countPending(a.store), 1);
});

// --- de Supabase-adapter en auth-hulpjes ---------------------------------------------------------------------

function fakeClient({ upsertError = null, selectResult = { data: [], error: null } } = {}) {
  const log = { upserts: [], filters: [] };
  const chain = {
    select: (columns) => { log.filters.push(['select', columns]); return chain; },
    gt: (column, value) => { log.filters.push(['gt', column, value]); return chain; },
    order: (column, opts) => { log.filters.push(['order', column, opts]); return chain; },
    limit: (n) => { log.filters.push(['limit', n]); return Promise.resolve(selectResult); },
  };
  return {
    log,
    client: {
      from: (table) => {
        log.table = table;
        return { ...chain, upsert: (rows, options) => { log.upserts.push({ rows, options }); return Promise.resolve({ error: upsertError }); } };
      },
    },
  };
}

test('supabase-remote: upsert met user_id en conflictsleutel, in blokken', async () => {
  const { client, log } = fakeClient();
  const remote = createSupabaseRemote({ client, userId: 'u-1' });
  const rows = Array.from({ length: 450 }, (_, i) => ({ collection: 'habits', id: `h${i}`, data: { id: `h${i}` }, deleted_at: null }));
  await remote.push(rows);
  assert.equal(log.table, 'records');
  assert.deepEqual(log.upserts.map((u) => u.rows.length), [200, 200, 50]);
  assert.equal(log.upserts[0].options.onConflict, 'user_id,collection,id');
  assert.ok(log.upserts[0].rows.every((r) => r.user_id === 'u-1'));
});

test('supabase-remote: pull vraagt op seq, oplopend en met limiet; seq wordt een getal', async () => {
  const { client, log } = fakeClient({ selectResult: { data: [{ collection: 'habits', id: 'h', data: {}, deleted_at: null, seq: '7' }], error: null } });
  const remote = createSupabaseRemote({ client, userId: 'u-1' });
  const rows = await remote.pull(5, 100);
  assert.deepEqual(log.filters, [['select', 'collection,id,data,deleted_at,seq'], ['gt', 'seq', 5], ['order', 'seq', { ascending: true }], ['limit', 100]]);
  assert.equal(rows[0].seq, 7);
});

test('supabase-remote: fouten krijgen een "permanent"-vlag alleen als het record zelf onverwerkbaar is', async () => {
  const tryPush = async (error) => {
    const { client } = fakeClient({ upsertError: error });
    try { await createSupabaseRemote({ client, userId: 'u' }).push([{ collection: 'habits', id: 'h', data: {}, deleted_at: null }]); } catch (e) { return e; }
    return null;
  };
  assert.equal((await tryPush({ status: 400, code: '23514', message: 'check' })).permanent, true);
  assert.equal((await tryPush({ status: 401, message: 'jwt expired' })).permanent, false);
  assert.equal((await tryPush({ status: 503, message: 'down' })).permanent, false);
  assert.equal((await tryPush({ status: 429, message: 'rate' })).permanent, false);
});

test('auth-hulpjes: sleutel van de sessie, aanwezige sessie en terugkeer van Google', () => {
  assert.equal(sessionStorageKey('https://rbsqafttotdaakpwtjmh.supabase.co'), 'sb-rbsqafttotdaakpwtjmh-auth-token');
  const storage = (items) => ({ getItem: (k) => items[k] ?? null });
  const url = 'https://rbsqafttotdaakpwtjmh.supabase.co';
  assert.equal(hasStoredSession(storage({ 'sb-rbsqafttotdaakpwtjmh-auth-token': '{}' }), url), true);
  assert.equal(hasStoredSession(storage({}), url), false);
  assert.equal(hasStoredSession({ getItem() { throw new Error('geblokkeerd'); } }, url), false);
  assert.equal(isAuthCallback('?code=abc123'), true);
  assert.equal(isAuthCallback('?error_description=access_denied'), true);
  assert.equal(isAuthCallback(''), false);
  assert.equal(isAuthCallback('?date=2026-10-15'), false);
});
