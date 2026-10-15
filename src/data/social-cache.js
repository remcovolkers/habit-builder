// Wat er lokaal van de sociale kant wordt bewaard: de laatst opgehaalde vrienden en ranglijst (alleen om offline te tonen) en een
// uitnodigingscode die nog moet worden ingewisseld. Bewust niet in IndexedDB en niet via de sync-motor: het is niet van jou alleen
// en kent andere regels (zie docs/SOCIAAL.md §5.4). De cache hoort bij één gebruiker: een ander account ziet hem nooit.

const CACHE_KEY = 'hb-social';
const INVITE_KEY = 'hb-social-invite';

export function createSocialCache(storage = globalThis.localStorage) {
  const get = (key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const set = (key, value) => { try { storage?.setItem(key, value); } catch { /* opslag geblokkeerd of vol: de cache is een gemak */ } };
  const drop = (key) => { try { storage?.removeItem(key); } catch { /* idem */ } };

  return {
    /** De bewaarde gegevens van deze gebruiker, of null (geen cache, kapotte cache of van een ander account). */
    read(userId) {
      try {
        const data = JSON.parse(get(CACHE_KEY));
        return data && typeof data === 'object' && data.userId === userId ? data : null;
      } catch {
        return null;
      }
    },
    /** Bewaart `data` (me, friends, board, fetchedAt, …) voor deze gebruiker. */
    write(userId, data) {
      set(CACHE_KEY, JSON.stringify({ ...data, userId }));
    },
    /** Wist de cache en een onthouden uitnodiging (bij uitloggen en bij account verwijderen). */
    clear() {
      drop(CACHE_KEY);
      drop(INVITE_KEY);
    },
    rememberInvite: (code) => set(INVITE_KEY, String(code)),
    readInvite: () => get(INVITE_KEY),
    forgetInvite: () => drop(INVITE_KEY),
  };
}
