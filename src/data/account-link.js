// De koppeling tussen de lokale database en een account. Zonder account bestaat alleen de lokale kopie;
// met een account is er daarnaast een kopie op de server. meta.userId onthoudt van wie de lokale data is.
import { DATA_COLLECTIONS, INTERNAL_COLLECTIONS } from './memory-store.js';
import { readMeta } from './sync.js';

let adoptCounter = 0;

/** Zet alle lokale records (ook grafstenen) in de outbox: ze gaan allemaal naar de server. */
export async function markAllPending(store) {
  for (const collection of DATA_COLLECTIONS) {
    for (const record of await store.getAll(collection)) {
      await store.put('outbox', { id: `${collection}|${record.id}`, collection, recordId: record.id, rev: `adopt-${Date.now()}-${++adoptCounter}` });
    }
  }
}

export const countPending = async (store) => (await store.getAll('outbox')).length;

/** Wist alle lokale gegevens en de sync-status (bv. bij uitloggen of een ander account). */
export async function wipeLocalData(store) {
  for (const collection of [...DATA_COLLECTIONS, ...INTERNAL_COLLECTIONS]) await store.clear(collection);
}

/** Maakt de lokale data weer "anoniem": de data blijft, de koppeling met een account verdwijnt (bv. na account verwijderen). */
export async function unlinkAccount(store) {
  await store.clear('outbox');
  await store.clear('meta');
}

/**
 * Wat te doen als `userId` inlogt?
 *   'same'           dit apparaat hoort al bij dit account: gewoon syncen
 *   'adopted-local'  er was alleen anonieme lokale data: die wordt van dit account (alles gaat naar de server)
 *   'other-account'  er staat data van een ánder account: de aanroeper beslist (meestal wissen) en roept daarna bindUser aan
 * Voert alleen 'adopted-local' en 'same' zelf uit; bij 'other-account' verandert er niets.
 */
export async function adoptUser({ store, userId }) {
  const meta = await readMeta(store);
  if (meta.userId === userId) return { action: 'same', pending: await countPending(store) };
  if (!meta.userId) {
    await markAllPending(store);
    await bindUser(store, userId);
    return { action: 'adopted-local', pending: await countPending(store) };
  }
  return { action: 'other-account', pending: await countPending(store) };
}

/** Legt vast dat de lokale data van dit account is; de cursor begint bij 0 (alles ophalen). */
export async function bindUser(store, userId) {
  const meta = await readMeta(store);
  await store.put('meta', { ...meta, userId, cursor: 0, lastSyncAt: null });
}
