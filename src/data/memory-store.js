// Opslag in het geheugen. Gebruikt in tests en als vangnet wanneer IndexedDB niet beschikbaar is
// (bv. sommige privévensters). Zelfde interface als idb-store.js.
export const COLLECTIONS = Object.freeze(['settings', 'habits', 'checkIns', 'pauses', 'dayPlans', 'achievements', 'ratings', 'reviews']);

export function createMemoryStore() {
  const data = new Map(COLLECTIONS.map((name) => [name, new Map()]));
  const coll = (name) => {
    const found = data.get(name);
    if (!found) throw new Error(`Onbekende collectie: ${name}`);
    return found;
  };
  return {
    kind: 'memory',
    async getAll(name) {
      return [...coll(name).values()].map((r) => structuredClone(r));
    },
    async get(name, id) {
      const record = coll(name).get(id);
      return record === undefined ? null : structuredClone(record);
    },
    async put(name, record) {
      coll(name).set(record.id, structuredClone(record));
    },
    async delete(name, id) {
      coll(name).delete(id);
    },
    async clear(name) {
      coll(name).clear();
    },
  };
}
