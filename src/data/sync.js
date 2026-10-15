// Sync-motor (offline-first). Weet niets van Supabase: praat met een "remote" met twee functies:
//
//   remote.push(rows)          rows: [{ collection, id, data, deleted_at }]  (upsert per rij, bij fout: throw)
//   remote.pull(cursor, limit) -> [{ collection, id, data, deleted_at, seq }] met seq > cursor, oplopend op seq
//
// Werkwijze per ronde:
//   1. PUSH   alles uit de outbox naar de server. Een outbox-regel wordt pas gewist als er in de tussentijd niet
//             opnieuw naar dat record is geschreven (rev ongewijzigd), anders gaat hij in de volgende ronde mee.
//   2. PULL   alles op de server met seq > cursor. Een record waar lokaal nog een wijziging voor klaarstaat wordt
//             overgeslagen: de lokale versie is nieuwer en gaat zo meteen mee.
// Conflicten: wie het laatst pusht wint (per record). Afgeleide gegevens (reeksen, sterkte, …) worden nooit gesynct.
import { DATA_COLLECTIONS } from './memory-store.js';

export const SYNC_PAGE = 500;
export const SYNC_BATCH = 200;
const MAX_PUSH_ROUNDS = 100;
const MAX_ROUNDS = 5;

export const META_ID = 'sync';

/** JSON met gesorteerde sleutels: de server (jsonb) bewaart sleutels in een andere volgorde dan wij. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export async function readMeta(store) {
  return (await store.get('meta', META_ID)) ?? { id: META_ID, userId: null, cursor: 0, lastSyncAt: null };
}

export function createSyncEngine({ store, remote, clock = () => new Date().toISOString() }) {
  const listeners = new Set();
  const status = { state: 'idle', lastSyncAt: null, error: null };
  const emit = (patch) => {
    Object.assign(status, patch);
    for (const listener of listeners) listener({ ...status });
  };

  async function pushRound() {
    const outbox = (await store.getAll('outbox')).slice(0, SYNC_BATCH);
    if (outbox.length === 0) return { done: true, pushed: 0, dropped: 0 };

    const rows = [];
    for (const entry of outbox) {
      const record = await store.get(entry.collection, entry.recordId);
      if (record) rows.push({ collection: entry.collection, id: entry.recordId, data: record, deleted_at: record.deletedAt ?? null, entry });
    }

    let dropped = 0;
    const settled = new Set();
    const send = async (batch) => {
      if (batch.length === 0) return;
      try {
        await remote.push(batch.map(({ entry, ...row }) => row));
        for (const row of batch) settled.add(row.entry.id);
      } catch (error) {
        // Eén onverwerkbaar record (bv. te groot) mag de rest niet blokkeren: apart proberen, en dat ene loslaten.
        if (!error?.permanent) throw error;
        if (batch.length > 1) {
          for (const row of batch) await send([row]);
        } else {
          dropped += 1;
          settled.add(batch[0].entry.id);
        }
      }
    };
    await send(rows);

    for (const entry of outbox) {
      if (!rows.some((row) => row.entry.id === entry.id)) settled.add(entry.id); // record bestaat niet meer: regel opruimen
    }
    for (const entry of outbox) {
      if (!settled.has(entry.id)) continue;
      const current = await store.get('outbox', entry.id);
      if (current && current.rev === entry.rev) await store.delete('outbox', entry.id);
    }
    return { done: false, pushed: rows.length - dropped, dropped };
  }

  async function pushAll() {
    let pushed = 0;
    let dropped = 0;
    for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
      const result = await pushRound();
      if (result.done) break;
      pushed += result.pushed;
      dropped += result.dropped;
    }
    return { pushed, dropped };
  }

  async function pullAll(startCursor) {
    let cursor = startCursor;
    let pulled = 0;
    for (;;) {
      const rows = await remote.pull(cursor, SYNC_PAGE);
      if (rows.length === 0) break;
      const pending = new Set((await store.getAll('outbox')).map((entry) => entry.id));
      for (const row of rows) {
        cursor = Math.max(cursor, row.seq);
        if (!DATA_COLLECTIONS.includes(row.collection)) continue; // onbekend (nieuwere app-versie): negeren
        if (pending.has(`${row.collection}|${row.id}`)) continue;
        const incoming = { ...row.data, id: row.id, deletedAt: row.deleted_at ?? null };
        const existing = await store.get(row.collection, row.id);
        if (existing && stableStringify(existing) === stableStringify(incoming)) continue; // niets nieuws: geen schermverversing nodig
        await store.put(row.collection, incoming);
        pulled += 1;
      }
      if (rows.length < SYNC_PAGE) break;
    }
    return { cursor, pulled };
  }

  async function syncOnce() {
    const meta = await readMeta(store);
    const { pushed, dropped } = await pushAll();
    const { cursor, pulled } = await pullAll(meta.cursor ?? 0);
    const lastSyncAt = clock();
    await store.put('meta', { ...meta, cursor, lastSyncAt });
    return { pushed, pulled, dropped, lastSyncAt };
  }

  let running = null;
  let again = false;

  return {
    status,
    /** Luistert naar statuswijzigingen; geeft een functie om te stoppen. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Eén sync tegelijk; vraagt iemand er tijdens een sync nog een, dan volgt er direct een nieuwe ronde. */
    request() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        emit({ state: 'syncing', error: null });
        const total = { pushed: 0, pulled: 0, dropped: 0, lastSyncAt: null };
        try {
          let rounds = 0;
          do {
            again = false;
            const round = await syncOnce();
            rounds += 1;
            total.pushed += round.pushed;
            total.pulled += round.pulled;
            total.dropped += round.dropped;
            total.lastSyncAt = round.lastSyncAt;
            // is er tijdens de ronde nog iets lokaal gewijzigd? dan meteen nog een ronde (begrensd)
            if (!again && rounds < MAX_ROUNDS && (await store.getAll('outbox')).length > 0) again = true;
          } while (again);
          emit({ state: 'idle', lastSyncAt: total.lastSyncAt, error: null });
          return total;
        } catch (error) {
          emit({ state: 'error', error });
          throw error;
        } finally {
          running = null;
        }
      })();
      return running;
    },
    /** Opnieuw alles van de server ophalen (cursor terug naar 0). */
    async resetCursor() {
      const meta = await readMeta(store);
      await store.put('meta', { ...meta, cursor: 0 });
    },
  };
}
