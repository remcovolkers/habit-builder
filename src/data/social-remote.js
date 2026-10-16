// De Supabase-kant van vrienden en ranglijst: de functies uit supabase/migrations/0003_social.sql en 0005_invites.sql. Geen DOM, geen opslag.
// Elke aanroep geeft het resultaat of gooit een SocialError met een stabiele code (zie supabase/migrations/0003_social.sql).

/** Foutcodes uit de server (de melding van de fout) die de UI kan vertalen. */
export const SERVER_CODES = Object.freeze([
  'not_authenticated', 'not_enabled', 'invalid_username', 'invalid_display_name', 'username_taken', 'username_not_allowed',
  'username_change_too_soon', 'not_found', 'friend_limit', 'pending_limit', 'invite_limit', 'too_many_requests', 'invalid_summary',
]);

/**
 * Codes die de app zelf toevoegt: 'offline' (geen verbinding), 'unavailable' (de server kent deze functies niet, bijvoorbeeld
 * omdat de migratie nog niet is uitgevoerd) en 'unknown'.
 */
export class SocialError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'SocialError';
    this.code = code;
    this.cause = cause;
  }
}

/** Zet een fout van de Supabase-client om in een SocialError. */
export function toSocialError(error) {
  if (error instanceof SocialError) return error;
  const message = String(error?.message ?? '');
  const status = Number(error?.status ?? 0);
  if (SERVER_CODES.includes(message)) return new SocialError(message, error);
  // PostgREST kent de functie niet (de migratie is niet uitgevoerd) of het adres bestaat niet
  if (error?.code === 'PGRST202' || error?.code === '42883' || status === 404) return new SocialError('unavailable', error);
  if (status === 401 || error?.code === '28000' || /jwt/i.test(message)) return new SocialError('not_authenticated', error);
  // 23503 (foreign key): het account van deze sessie bestaat op de server niet meer; opnieuw inloggen lost het op
  if (error?.code === '23503' || /foreign key constraint/i.test(message)) return new SocialError('not_authenticated', error);
  if (status === 429) return new SocialError('too_many_requests', error);
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message) || error?.name === 'TypeError') return new SocialError('offline', error);
  return new SocialError('unknown', error);
}

/**
 * `getClient` geeft (een belofte van) de Supabase-client. De client wordt pas gevraagd als er echt iets wordt aangeroepen, zodat
 * een gebruiker die sociaal nooit gebruikt de SDK er niet voor laadt.
 */
export function createSocialRemote(getClient) {
  async function call(fn, args = {}) {
    let result;
    try {
      result = await (await getClient()).rpc(fn, args);
    } catch (error) {
      throw toSocialError(error);
    }
    if (result.error) throw toSocialError(result.error);
    return result.data;
  }
  const list = async (fn, args) => (await call(fn, args)) ?? [];

  return {
    /** { username, display_name, enabled } of null als je nog niet hebt meegedaan. */
    me: async () => (await call('social_me')) ?? null,
    enable: (username, displayName) => call('social_enable', { p_username: username, p_display_name: displayName }),
    disable: async () => { await call('social_disable'); },
    /** Hooguit één rij: { id, username, display_name, relation } met relation 'none' | 'friend' | 'incoming' | 'outgoing'. */
    find: async (username) => (await list('social_find', { p_username: username }))[0] ?? null,
    request: (userId) => call('friend_request', { p_user: userId }),
    respond: (userId, accept) => call('friend_respond', { p_user: userId, p_accept: accept }),
    cancel: async (userId) => (await call('friend_cancel', { p_user: userId })) === true,
    remove: async (userId) => (await call('friend_remove', { p_user: userId })) === true,
    friends: () => list('friend_list'),
    createInvite: () => call('invite_create'),
    invites: () => list('invite_list'),
    revokeInvite: async (id) => (await call('invite_revoke', { p_id: id })) === true,
    /** { status: 'ok', already_friends, user_id, username, display_name } of { status: 'invalid' }. */
    redeemInvite: (code) => call('invite_redeem', { p_code: code }),
    /** Zonder account te gebruiken (0005): { status: 'ok', display_name } | { status: 'own' } | { status: 'invalid' }. */
    peekInvite: (code) => call('invite_peek', { p_code: code }),
    publish: async (args) => { await call('publish_summary', args); },
    leaderboard: () => list('leaderboard'),
  };
}
