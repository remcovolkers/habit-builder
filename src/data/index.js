// Kiest de opslag: IndexedDB, met geheugen als vangnet (dan gaat data verloren bij sluiten; de UI waarschuwt).
import { createMemoryStore } from './memory-store.js';
import { openIdbStore } from './idb-store.js';
import { createRepository } from './repository.js';

export async function openRepository() {
  try {
    return createRepository({ store: await openIdbStore() });
  } catch (error) {
    console.warn('IndexedDB niet beschikbaar, tijdelijk geheugen gebruikt:', error);
    return createRepository({ store: createMemoryStore() });
  }
}
