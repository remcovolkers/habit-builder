// Wat er lokaal van de sociale kant wordt bewaard: de laatst opgehaalde vrienden en ranglijst (alleen om offline te tonen) en een
// uitnodigingscode die nog moet worden ingewisseld. Bewust niet in IndexedDB en niet via de sync-motor: het is niet van jou alleen
// en kent andere regels (zie docs/SOCIAAL.md §5.4). De cache hoort bij één gebruiker: een ander account ziet hem nooit.

const CACHE_KEY = 'hb-social';
const INVITE_KEY = 'hb-social-invite';
const INVITER_KEY = 'hb-social-inviter'; // de naam van wie je uitnodigde, om op het inlogscherm te kunnen tonen
const OWN_INVITES_KEY = 'hb-social-own-invites'; // de links die jij maakte, zodat je ze opnieuw kunt tonen (de server bewaart alleen een hash)

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
      drop(INVITER_KEY);
      drop(OWN_INVITES_KEY);
    },
    rememberInvite: (code) => set(INVITE_KEY, String(code)),
    readInvite: () => get(INVITE_KEY),
    forgetInvite() {
      drop(INVITE_KEY);
      drop(INVITER_KEY);
    },
    rememberInviter: (name) => set(INVITER_KEY, String(name ?? '')),
    readInviter: () => get(INVITER_KEY) ?? '',

    /** Jouw eigen links van dit apparaat: { [id]: code } voor deze gebruiker. */
    readOwnInvites(userId) {
      try {
        const data = JSON.parse(get(OWN_INVITES_KEY));
        return data && typeof data === 'object' && data.userId === userId && data.links && typeof data.links === 'object' ? data.links : {};
      } catch {
        return {};
      }
    },
    rememberOwnInvite(userId, id, code) {
      const links = { ...this.readOwnInvites(userId), [id]: code };
      set(OWN_INVITES_KEY, JSON.stringify({ userId, links }));
    },
    forgetOwnInvite(userId, id) {
      const { [id]: _gone, ...links } = this.readOwnInvites(userId);
      set(OWN_INVITES_KEY, JSON.stringify({ userId, links }));
    },
  };
}
