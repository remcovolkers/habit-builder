// De Supabase-kant van vrienden en ranglijst: welke functies met welke argumenten worden aangeroepen, en hoe fouten worden vertaald.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialRemote, SERVER_CODES, SocialError, toSocialError } from '../../src/data/social-remote.js';

/** Een nagebootste Supabase-client: onthoudt de aanroepen en geeft per functie het ingestelde antwoord. */
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      const response = responses[fn];
      const value = typeof response === 'function' ? response(args) : response;
      if (value instanceof Error) throw value;
      return value ?? { data: null, error: null };
    },
  };
}
const ok = (data) => ({ data, error: null });
const failure = (error) => ({ data: null, error });

test('elke functie roept de juiste serverfunctie aan met de juiste argumenten', async () => {
  const client = fakeClient({
    social_me: ok({ username: 'remco', display_name: 'Remco', enabled: true }),
    social_enable: ok({ username: 'remco', display_name: 'Remco', enabled: true }),
    social_find: ok([{ id: 'u2', username: 'anna', display_name: 'Anna', relation: 'none' }]),
    friend_request: ok({ status: 'pending' }),
    friend_respond: ok({ status: 'accepted' }),
    friend_cancel: ok(true),
    friend_remove: ok(false),
    friend_list: ok([{ user_id: 'u2' }]),
    invite_create: ok({ id: 'i1', code: 'c'.repeat(64), expires_at: '2026-10-22T00:00:00Z' }),
    invite_list: ok([{ id: 'i1' }]),
    invite_revoke: ok(true),
    invite_redeem: ok({ status: 'ok' }),
    invite_peek: ok({ status: 'ok', display_name: 'Anna' }),
    leaderboard: ok([{ user_id: 'u1' }]),
  });
  const remote = createSocialRemote(async () => client);

  assert.deepEqual(await remote.me(), { username: 'remco', display_name: 'Remco', enabled: true });
  await remote.enable('remco', 'Remco');
  assert.deepEqual(await remote.find('anna'), { id: 'u2', username: 'anna', display_name: 'Anna', relation: 'none' });
  assert.deepEqual(await remote.request('u2'), { status: 'pending' });
  assert.deepEqual(await remote.respond('u2', true), { status: 'accepted' });
  assert.equal(await remote.cancel('u2'), true);
  assert.equal(await remote.remove('u2'), false);
  assert.deepEqual(await remote.friends(), [{ user_id: 'u2' }]);
  assert.equal((await remote.createInvite()).code.length, 64);
  assert.deepEqual(await remote.invites(), [{ id: 'i1' }]);
  assert.equal(await remote.revokeInvite('i1'), true);
  assert.deepEqual(await remote.redeemInvite('abc'), { status: 'ok' });
  await remote.publish({ p_points: 1 });
  assert.deepEqual(await remote.leaderboard(), [{ user_id: 'u1' }]);
  await remote.disable();
  assert.deepEqual(await remote.peekInvite('abc'), { status: 'ok', display_name: 'Anna' });

  assert.deepEqual(client.calls, [
    ['social_me', {}],
    ['social_enable', { p_username: 'remco', p_display_name: 'Remco' }],
    ['social_find', { p_username: 'anna' }],
    ['friend_request', { p_user: 'u2' }],
    ['friend_respond', { p_user: 'u2', p_accept: true }],
    ['friend_cancel', { p_user: 'u2' }],
    ['friend_remove', { p_user: 'u2' }],
    ['friend_list', {}],
    ['invite_create', {}],
    ['invite_list', {}],
    ['invite_revoke', { p_id: 'i1' }],
    ['invite_redeem', { p_code: 'abc' }],
    ['publish_summary', { p_points: 1 }],
    ['leaderboard', {}],
    ['social_disable', {}],
    ['invite_peek', { p_code: 'abc' }],
  ]);
});

test('lege antwoorden worden netjes: geen profiel is null, geen resultaat is null, geen lijst is een lege lijst', async () => {
  const remote = createSocialRemote(async () => fakeClient({ social_me: ok(null), social_find: ok([]), friend_list: ok(null), leaderboard: ok(null), invite_list: ok(null) }));
  assert.equal(await remote.me(), null);
  assert.equal(await remote.find('niemand'), null);
  assert.deepEqual(await remote.friends(), []);
  assert.deepEqual(await remote.leaderboard(), []);
  assert.deepEqual(await remote.invites(), []);
});

test('de client wordt pas gevraagd bij de eerste aanroep (de SDK laadt niet voor wie sociaal nooit gebruikt)', async () => {
  let asked = 0;
  const remote = createSocialRemote(async () => { asked++; return fakeClient({ social_me: ok(null) }); });
  assert.equal(asked, 0);
  await remote.me();
  assert.equal(asked, 1);
});

test('stabiele foutcodes van de server komen door als SocialError met die code', async () => {
  for (const code of SERVER_CODES) {
    const remote = createSocialRemote(async () => fakeClient({ social_find: failure({ message: code, code: 'P0001' }) }));
    await assert.rejects(remote.find('x'), (error) => error instanceof SocialError && error.code === code && error.message === code, code);
  }
});

test('een functie die de server niet kent (migratie niet uitgevoerd) is "unavailable"', () => {
  assert.equal(toSocialError({ code: 'PGRST202', message: 'Could not find the function public.social_me without parameters in the schema cache' }).code, 'unavailable');
  assert.equal(toSocialError({ code: '42883', message: 'function does not exist' }).code, 'unavailable');
  assert.equal(toSocialError({ status: 404, message: 'Not Found' }).code, 'unavailable');
});

test('geen verbinding is "offline", ook als de SDK de fout inpakt of gooit', async () => {
  for (const error of [{ message: 'TypeError: Failed to fetch' }, { message: 'NetworkError when attempting to fetch resource.' }, { message: 'Load failed' }, new TypeError('fetch failed')]) {
    assert.equal(toSocialError(error).code, 'offline', String(error.message));
  }
  const thrown = createSocialRemote(async () => ({ rpc: async () => { throw new TypeError('Failed to fetch'); } }));
  await assert.rejects(thrown.me(), (e) => e.code === 'offline');
  const returned = createSocialRemote(async () => fakeClient({ social_me: failure({ message: 'TypeError: Failed to fetch', code: '' }) }));
  await assert.rejects(returned.me(), (e) => e.code === 'offline');
  const noClient = createSocialRemote(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(noClient.me(), (e) => e.code === 'offline', 'ook als de SDK zelf niet geladen kan worden');
});

test('niet ingelogd, te veel verzoeken en onbekende fouten', () => {
  assert.equal(toSocialError({ status: 401, message: 'x' }).code, 'not_authenticated');
  assert.equal(toSocialError({ code: '28000', message: 'weird' }).code, 'not_authenticated');
  assert.equal(toSocialError({ message: 'JWT expired' }).code, 'not_authenticated');
  assert.equal(toSocialError({ status: 429, message: 'slow down' }).code, 'too_many_requests');
  assert.equal(toSocialError({ message: 'iets heel anders', code: 'XX000' }).code, 'unknown');
  assert.equal(toSocialError(undefined).code, 'unknown');
  const own = new SocialError('invalid');
  assert.equal(toSocialError(own), own, 'een SocialError blijft zoals hij is');
});

test('een foreign-key-fout (het account van deze sessie bestaat niet meer, 409) wordt "not_authenticated": opnieuw inloggen lost het op', () => {
  const error = { code: '23503', status: 409, message: 'insert or update on table "social_profiles" violates foreign key constraint "social_profiles_user_id_fkey"' };
  assert.equal(toSocialError(error).code, 'not_authenticated');
  assert.equal(toSocialError({ status: 409, message: 'duplicate key value violates unique constraint' }).code, 'unknown', 'een ander 409 is geen sessieprobleem');
});
