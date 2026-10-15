// IndexedDB-opslag: de lokale bron van waarheid (offline-first). Zelfde interface als memory-store.js.
import { COLLECTIONS } from './memory-store.js';

const DB_NAME = 'habit-builder';
const DB_VERSION = 3; // v2: achievements, ratings, reviews; v3: outbox, meta (sync)

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transactie afgebroken'));
  });
}

export function openIdbStore(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error('IndexedDB is niet beschikbaar'));
      return;
    }
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Database is geblokkeerd door een ander tabblad'));
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      resolve({
        kind: 'indexeddb',
        async getAll(name) {
          return request(db.transaction(name, 'readonly').objectStore(name).getAll());
        },
        async get(name, id) {
          const record = await request(db.transaction(name, 'readonly').objectStore(name).get(id));
          return record ?? null;
        },
        async put(name, record) {
          const tx = db.transaction(name, 'readwrite');
          tx.objectStore(name).put(record);
          await done(tx);
        },
        async delete(name, id) {
          const tx = db.transaction(name, 'readwrite');
          tx.objectStore(name).delete(id);
          await done(tx);
        },
        async clear(name) {
          const tx = db.transaction(name, 'readwrite');
          tx.objectStore(name).clear();
          await done(tx);
        },
      });
    };
  });
}
