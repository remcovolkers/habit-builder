// De serverkant van vrienden en ranglijst (supabase/migrations/0003_social.sql), in een echte Postgres (PGlite) met een
// nagebootst Supabase-auth-schema en dezelfde standaardrechten als Supabase (waar nieuwe tabellen en functies automatisch voor
// anon en authenticated openstaan, tenzij de migratie ze dichtzet). Overgeslagen als PGlite niet is geïnstalleerd (npm ci).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* niet geïnstalleerd */ }
const skip = PGlite ? false : 'PGlite is niet geïnstalleerd (npm ci)';

const migration = (name) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = Object.fromEntries(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].map((name, i) => [name, id(i + 1)]));

let db = null;
let rerun0003 = null;
if (PGlite) {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    -- zoals Supabase: wat in public wordt aangemaakt staat standaard open voor anon en authenticated
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `);
  for (const name of ['0001_init.sql', '0002_push.sql', '0003_social.sql']) await db.exec(migration(name));
  // 0003 nogmaals draaien kan alleen zolang 0005 er nog niet is (die verandert de uitvoer van invite_list); daarom hier en niet in een test
  try { await db.exec(migration('0003_social.sql')); } catch (error) { rerun0003 = error; }
  for (const name of ['0004_reasons.sql', '0005_invites.sql']) await db.exec(migration(name));
  await db.exec(`insert into auth.users (id, email) values ${Object.values(U).map((u) => `('${u}', '${u}@x.nl')`).join(', ')};`);
}

/** Voert `fn` uit als deze gebruiker (of anon). */
async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid }) : ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const owner = (sql, params) => db.query(sql, params); // als eigenaar (zoals de SQL-editor): om de tijd te verzetten of iets te tellen

/** Roept een functie aan als `uid`. Geeft { ok, rows, value, code } terug; bij een fout is code de stabiele foutcode. */
async function rpc(uid, call, params = []) {
  try {
    const result = await as('authenticated', uid, () => db.query(`select * from public.${call}`, params));
    return { ok: true, rows: result.rows, value: result.rows[0] && Object.values(result.rows[0])[0], code: null };
  } catch (error) {
    return { ok: false, rows: [], value: null, code: error.message };
  }
}
const enable = (uid, username, name = '') => rpc(uid, 'social_enable($1, $2)', [username, name]);
const summary = (uid, points, extra = {}) => {
  const day = new Date().toISOString().slice(0, 10);
  const s = { asOf: day, points, done: Math.round(points / 10), streak: 2, habits: 3, lastActive: day, ...extra };
  return rpc(uid, 'publish_summary($1::date, $2, $3, $4, $5, $6::date)', [s.asOf, s.points, s.done, s.streak, s.habits, s.lastActive]);
};
const t = (name, fn) => test(name, { skip }, fn);

// ---- toegang -----------------------------------------------------------------------------------------------------------------

t('de migraties zijn idempotent: een tweede keer draaien geeft geen fout', async () => {
  assert.equal(rerun0003, null, String(rerun0003)); // 0003 is bij het opstarten twee keer gedraaid
  await db.exec(migration('0004_reasons.sql'));
  await db.exec(migration('0005_invites.sql'));
});

const FUNCTIONS = [
  'social_enable($1, $2)', 'social_disable()', 'social_me()', 'social_find($1)', 'friend_request($1::uuid)', 'friend_respond($1::uuid, true)',
  'friend_cancel($1::uuid)', 'friend_remove($1::uuid)', 'friend_list()', 'invite_create()', 'invite_list()', 'invite_revoke($1::uuid)',
  'invite_redeem($1)', 'publish_summary(current_date, 0, 0, 0, 0, null)', 'leaderboard()',
];

t('anon kan geen enkele functie aanroepen', async () => {
  for (const call of FUNCTIONS) {
    const arg = call.includes('::uuid') ? [U.one] : call.startsWith('social_enable') ? ['x', 'y'] : call.includes('$1') ? ['x'] : [];
    const result = await as('anon', null, async () => { try { await db.query(`select * from public.${call}`, arg); return 'gelukt'; } catch (e) { return e.message; } });
    assert.notEqual(result, 'gelukt', `anon mocht ${call} aanroepen`);
    assert.match(result, /permission denied/i, `${call}: ${result}`);
  }
});

t('de hulpfuncties zijn voor niemand aan te roepen', async () => {
  for (const call of ['social_uid()', `social_require_enabled('${U.one}')`, `social_rate_use('${U.one}', 'find', 20, interval '1 hour')`, `social_friend_count('${U.one}')`]) {
    for (const role of ['anon', 'authenticated']) {
      const result = await as(role, role === 'anon' ? null : U.one, async () => { try { await db.query(`select public.${call}`); return 'gelukt'; } catch (e) { return e.message; } });
      assert.match(result, /permission denied/i, `${role} ${call}: ${result}`);
    }
  }
});

t('de tabellen zijn dicht: niet te lezen en niet te schrijven, voor anon en voor ingelogde gebruikers', async () => {
  for (const table of ['social_profiles', 'friendships', 'invite_codes', 'score_summaries', 'social_rate', 'social_blocked_terms']) {
    for (const [role, uid] of [['anon', null], ['authenticated', U.one]]) {
      const read = await as(role, uid, async () => { try { await db.query(`select * from public.${table}`); return 'gelukt'; } catch (e) { return e.message; } });
      assert.match(read, /permission denied/i, `${role} las ${table}: ${read}`);
    }
  }
  const write = await as('authenticated', U.one, async () => { try { await db.exec(`insert into public.social_profiles (user_id, username) values ('${U.one}', 'direct')`); return 'gelukt'; } catch (e) { return e.message; } });
  assert.match(write, /permission denied/i);
});

t('zonder sociaal aan: zoeken, vrienden en de ranglijst geven not_enabled', async () => {
  for (const call of ['social_find($1)', 'friend_list()', 'leaderboard()', 'invite_create()']) {
    const r = await rpc(U.one, call, call.includes('$1') ? ['x'] : []);
    assert.equal(r.code, 'not_enabled', call);
  }
  assert.equal((await rpc(U.one, 'social_me()')).value, null);
});

// ---- profiel ----------------------------------------------------------------------------------------------------------------

t('gebruikersnamen: kleine letters, 3–20 tekens, geen spaties of vreemde tekens', async () => {
  for (const bad of ['ab', 'a'.repeat(21), 'a b c', 'ä-ö-ü', 'naam!', '']) {
    assert.equal((await enable(U.one, bad)).code, 'invalid_username', bad);
  }
  assert.equal((await enable(U.one, 'x'.repeat(3), 'x'.repeat(31))).code, 'invalid_display_name');
});

t('verboden woorden in een gebruikersnaam (nabootsen van de beheerder)', async () => {
  for (const bad of ['admin', 'MyAdmin1', 'habitbuilder', 'x_support_x']) assert.equal((await enable(U.one, bad)).code, 'username_not_allowed', bad);
});

t('sociaal aanzetten: de gebruikersnaam wordt kleine letters en is uniek (ook in hoofdletters)', async () => {
  const one = await enable(U.one, '  Remco ', 'Remco');
  assert.deepEqual(one.value, { username: 'remco', display_name: 'Remco', enabled: true });
  assert.equal((await enable(U.two, 'REMCO', 'x')).code, 'username_taken');
  for (const [uid, name, display] of [[U.two, 'anna', 'Anna'], [U.three, 'bram', 'Bram'], [U.four, 'cor', ''], [U.five, 'dora', 'Dora'], [U.six, 'eef', 'Eef']]) {
    assert.equal((await enable(uid, name, display)).ok, true, name);
  }
});

t('de gebruikersnaam wisselen kan hoogstens eens per 30 dagen; de weergavenaam altijd', async () => {
  assert.equal((await enable(U.one, 'remco', 'Remco V.')).ok, true); // alleen de weergavenaam
  assert.equal((await enable(U.one, 'remco2', 'Remco V.')).ok, true); // de eerste wissel mag
  assert.equal((await enable(U.one, 'remco3', 'Remco V.')).code, 'username_change_too_soon');
  await owner(`update public.social_profiles set username_changed_at = now() - interval '31 days' where user_id = '${U.one}'`);
  assert.equal((await enable(U.one, 'remco', 'Remco V.')).ok, true);
  assert.equal((await rpc(U.one, 'social_me()')).value.username, 'remco');
});

// ---- zoeken ------------------------------------------------------------------------------------------------------------------

t('zoeken: alleen de exacte naam, hooguit één resultaat, geen deelmatches of wildcards', async () => {
  const exact = await rpc(U.one, 'social_find($1)', ['ANNA']);
  assert.equal(exact.rows.length, 1);
  assert.deepEqual(Object.keys(exact.rows[0]).sort(), ['display_name', 'id', 'relation', 'username']);
  assert.equal(exact.rows[0].id, U.two);
  assert.equal(exact.rows[0].relation, 'none');
  for (const miss of ['ann', 'an%', '%', '_nna', 'anna ', '', 'bestaatniet', 'remco']) {
    const r = await rpc(U.one, 'social_find($1)', [miss]);
    assert.equal(r.rows.length, miss === 'anna ' ? 1 : 0, `"${miss}"`); // spaties aan de rand worden weggehaald
  }
});

t('zoeken vindt jezelf niet en geen gebruiker die sociaal uitzette', async () => {
  assert.equal((await rpc(U.one, 'social_find($1)', ['remco'])).rows.length, 0);
  await rpc(U.six, 'social_disable()');
  assert.equal((await rpc(U.one, 'social_find($1)', ['eef'])).rows.length, 0);
  await enable(U.six, 'eef', 'Eef');
});

// ---- verzoeken ---------------------------------------------------------------------------------------------------------------

t('een verzoek: pending, zichtbaar als uitgaand en binnenkomend, onzichtbaar voor anderen', async () => {
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.two])).value.status, 'pending');
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.two])).value.status, 'pending'); // idempotent
  assert.deepEqual((await rpc(U.two, 'friend_list()')).rows.map((r) => [r.user_id, r.state]), [[U.one, 'incoming']]);
  assert.deepEqual((await rpc(U.one, 'friend_list()')).rows.map((r) => [r.user_id, r.state]), [[U.two, 'outgoing']]);
  assert.equal((await rpc(U.three, 'friend_list()')).rows.length, 0);
  assert.equal((await rpc(U.three, 'friend_respond($1::uuid, true)', [U.one])).code, 'not_found');
  assert.equal((await rpc(U.one, 'friend_respond($1::uuid, true)', [U.two])).code, 'not_found');
});

t('een verzoek aan jezelf, een onbekende of iemand die sociaal uit heeft: not_found', async () => {
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.one])).code, 'not_found');
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [id(99)])).code, 'not_found');
  await rpc(U.six, 'social_disable()');
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.six])).code, 'not_found');
  await enable(U.six, 'eef', 'Eef');
});

t('weigeren is stil: de afzender ziet niets en kan 30 dagen niet opnieuw (hetzelfde antwoord als "niet gevonden")', async () => {
  assert.equal((await rpc(U.two, 'friend_respond($1::uuid, false)', [U.one])).value.status, 'declined');
  assert.equal((await rpc(U.one, 'social_find($1)', ['anna'])).rows.length, 0);
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.two])).code, 'not_found');
  assert.equal((await rpc(U.one, 'friend_list()')).rows.length, 0);
  assert.equal((await rpc(U.two, 'friend_list()')).rows.length, 0);
  assert.equal((await rpc(U.two, 'social_find($1)', ['remco'])).rows.length, 1, 'de weigeraar kan de afzender wel vinden');
});

t('na 30 dagen mag een geweigerd verzoek opnieuw', async () => {
  await owner(`update public.friendships set responded_at = now() - interval '31 days'`);
  assert.equal((await rpc(U.one, 'social_find($1)', ['anna'])).rows.length, 1);
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.two])).value.status, 'pending');
  assert.equal((await rpc(U.two, 'friend_respond($1::uuid, true)', [U.one])).value.status, 'accepted');
});

t('vrienden zien elkaar; nog een verzoek aan een vriend is gewoon "accepted"; verwijderen werkt wederzijds', async () => {
  assert.equal((await rpc(U.one, 'friend_list()')).rows[0].state, 'friend');
  assert.equal((await rpc(U.two, 'friend_list()')).rows[0].state, 'friend');
  assert.equal((await rpc(U.one, 'social_find($1)', ['anna'])).rows[0].relation, 'friend');
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [U.two])).value.status, 'accepted');
  assert.equal((await rpc(U.one, 'friend_remove($1::uuid)', [U.two])).value, true);
  assert.equal((await rpc(U.two, 'friend_list()')).rows.length, 0);
  assert.equal((await rpc(U.one, 'friend_remove($1::uuid)', [U.two])).value, false);
});

t('wederzijds: als beiden elkaar vragen, zijn ze meteen vrienden', async () => {
  assert.equal((await rpc(U.three, 'friend_request($1::uuid)', [U.four])).value.status, 'pending');
  assert.equal((await rpc(U.four, 'friend_request($1::uuid)', [U.three])).value.status, 'accepted');
});

t('een eigen verzoek intrekken kan, een ander verzoek niet', async () => {
  assert.equal((await rpc(U.five, 'friend_request($1::uuid)', [U.three])).value.status, 'pending');
  assert.equal((await rpc(U.three, 'friend_cancel($1::uuid)', [U.five])).value, false, 'u3 is de ontvanger, geen afzender');
  assert.equal((await rpc(U.five, 'friend_cancel($1::uuid)', [U.three])).value, true);
  assert.equal((await rpc(U.three, 'friend_list()')).rows.filter((r) => r.user_id === U.five).length, 0);
});

// ---- uitnodigingen -----------------------------------------------------------------------------------------------------------

t('een uitnodiging: lange code, in de database alleen een hash, en de lijst toont de code niet', async () => {
  const created = (await rpc(U.one, 'invite_create()')).value;
  assert.match(created.code, /^[0-9a-f]{64}$/);
  const stored = await owner('select code_hash from public.invite_codes');
  assert.equal(stored.rows.length, 1);
  assert.ok(!stored.rows[0].code_hash.includes(created.code), 'de code staat in de database');
  assert.match(stored.rows[0].code_hash, /^[0-9a-f]{64}$/);
  const list = await rpc(U.one, 'invite_list()');
  assert.deepEqual(Object.keys(list.rows[0]).sort(), ['created_at', 'expires_at', 'id', 'uses']); // wel het aantal gebruikers, nooit de code
  assert.equal(list.rows[0].uses, 0);
  globalThis.__invite = created;
});

t('de code inwisselen maakt direct vrienden, ook voor meerdere mensen; de eigen code of een verzonnen code is "invalid"', async () => {
  const { code, id: inviteId } = globalThis.__invite;
  assert.equal((await rpc(U.one, 'invite_redeem($1)', [code])).value.status, 'invalid');
  assert.equal((await rpc(U.five, 'invite_redeem($1)', ['a'.repeat(64)])).value.status, 'invalid');
  const ok = await rpc(U.five, 'invite_redeem($1)', [code.toUpperCase()]);
  assert.deepEqual([ok.value.status, ok.value.user_id, ok.value.username], ['ok', U.one, 'remco']);
  assert.equal((await rpc(U.six, 'invite_redeem($1)', [code])).value.status, 'ok');
  assert.equal((await rpc(U.five, 'invite_redeem($1)', [code])).value.status, 'ok', 'opnieuw inwisselen door een vriend');
  assert.deepEqual((await rpc(U.one, 'friend_list()')).rows.map((r) => r.state), ['friend', 'friend']);
  globalThis.__inviteId = inviteId;
});

t('een ingetrokken of verlopen code is "invalid"; een ander kan jouw code niet intrekken', async () => {
  const { code } = (await rpc(U.one, 'invite_create()')).value;
  const second = (await rpc(U.one, 'invite_list()')).rows[0].id; // de nieuwste staat bovenaan
  assert.equal((await rpc(U.two, 'invite_revoke($1::uuid)', [second])).value, false);
  assert.equal((await rpc(U.one, 'invite_revoke($1::uuid)', [globalThis.__inviteId])).value, true);
  assert.equal((await rpc(U.three, 'invite_redeem($1)', [globalThis.__invite.code])).value.status, 'invalid');
  await owner(`update public.invite_codes set expires_at = now() - interval '1 minute' where id = '${second}'`);
  assert.equal((await rpc(U.three, 'invite_redeem($1)', [code])).value.status, 'invalid');
});

t('hoogstens 5 actieve uitnodigingen tegelijk', async () => {
  let last = null;
  for (let i = 0; i < 6; i += 1) { const r = await rpc(U.two, 'invite_create()'); if (!r.ok) { last = r.code; break; } }
  assert.equal(last, 'invite_limit');
});

t('een uitnodiging van iemand die sociaal uitzette werkt niet meer', async () => {
  const { code } = (await rpc(U.four, 'invite_create()')).value;
  await rpc(U.four, 'social_disable()');
  assert.equal((await rpc(U.two, 'invite_redeem($1)', [code])).value.status, 'invalid');
  await enable(U.four, 'cor', '');
  assert.equal((await rpc(U.two, 'invite_redeem($1)', [code])).value.status, 'invalid', 'uitzetten trekt de uitnodigingen in');
});

// ---- uitnodigingen: voorvertoning, teller en plafond (0005) ---------------------------------------------------------------------

/** invite_peek als anon (rol 'anon') of als een ingelogde gebruiker. */
const peek = (code, uid = null) => as(uid ? 'authenticated' : 'anon', uid, async () => (await db.query('select public.invite_peek($1) as r', [code])).rows[0].r);

t('invite_peek: ook zonder account, alleen de weergavenaam van de uitnodiger', async () => {
  await enable(U.seven, 'zeven', 'Zoë');
  const { code } = (await rpc(U.seven, 'invite_create()')).value;
  globalThis.__peek = code;
  const ok = await peek(code);
  assert.deepEqual(ok, { status: 'ok', display_name: 'Zoë' }, 'niets anders dan de naam: geen id, geen gebruikersnaam, geen punten');
  assert.deepEqual(await peek(code.toUpperCase()), ok);
  assert.deepEqual(await peek(code, U.two), ok, 'ook voor een ingelogde gebruiker');
});

t('invite_peek: een ongeldige, verlopen, ingetrokken of verzonnen code geeft altijd hetzelfde antwoord; de eigen link heet "own"', async () => {
  const invalid = { status: 'invalid' };
  for (const bad of ['a'.repeat(64), '', 'x', null]) assert.deepEqual(await peek(bad), invalid, String(bad));

  const revoked = (await rpc(U.seven, 'invite_create()')).value;
  assert.deepEqual(await peek(revoked.code), { status: 'ok', display_name: 'Zoë' });
  await rpc(U.seven, 'invite_revoke($1::uuid)', [revoked.id]);
  assert.deepEqual(await peek(revoked.code), invalid, 'ingetrokken');

  const expired = (await rpc(U.seven, 'invite_create()')).value;
  await owner(`update public.invite_codes set expires_at = now() - interval '1 minute' where id = '${expired.id}'`);
  assert.deepEqual(await peek(expired.code), invalid, 'verlopen');

  await enable(U.eight, 'acht', 'Aaf');
  const gone = (await rpc(U.eight, 'invite_create()')).value;
  await rpc(U.eight, 'social_disable()');
  assert.deepEqual(await peek(gone.code), invalid, 'de uitnodiger doet niet meer mee');
  await enable(U.eight, 'acht', 'Aaf');

  assert.deepEqual(await peek(globalThis.__peek, U.seven), { status: 'own' }, 'je eigen link');
});

t('de teller: elke nieuwe vriend via de link telt, opnieuw inwisselen niet; de lijst toont het aantal', async () => {
  const code = globalThis.__peek;
  await enable(U.nine, 'negen', 'Nel');
  const first = (await rpc(U.eight, 'invite_redeem($1)', [code])).value;
  assert.deepEqual([first.status, first.already_friends, first.username, first.display_name], ['ok', false, 'zeven', 'Zoë']);
  const again = (await rpc(U.eight, 'invite_redeem($1)', [code])).value;
  assert.deepEqual([again.status, again.already_friends], ['ok', true], 'jullie waren al vrienden');
  assert.equal((await rpc(U.nine, 'invite_redeem($1)', [code])).value.already_friends, false);
  const row = (await rpc(U.seven, 'invite_list()')).rows.find((r) => r.uses > 0);
  assert.equal(row.uses, 2, 'twee mensen, de herhaling telt niet');
  assert.equal((await owner(`select uses from public.invite_codes where code_hash = encode(sha256(convert_to('${code}', 'utf8')), 'hex')`)).rows[0].uses, 2);
});

t('een verzoek dat openstond en daarna via de link wordt geaccepteerd telt als nieuwe vriend', async () => {
  const { code, id: inviteId } = (await rpc(U.seven, 'invite_create()')).value;
  await owner(`delete from public.friendships where '${U.nine}' in (user_low, user_high) and '${U.seven}' in (user_low, user_high)`);
  assert.equal((await rpc(U.nine, 'friend_request($1::uuid)', [U.seven])).value.status, 'pending');
  const redeemed = (await rpc(U.nine, 'invite_redeem($1)', [code])).value;
  assert.deepEqual([redeemed.status, redeemed.already_friends], ['ok', false]);
  assert.equal((await owner(`select uses from public.invite_codes where id = '${inviteId}'`)).rows[0].uses, 1);
});

t('plafond: hoogstens 25 mensen per link; wie al vriend is behoudt "al vrienden", een nieuwe krijgt "invalid"; de voorvertoning ook', async () => {
  const { code, id: inviteId } = (await rpc(U.seven, 'invite_create()')).value;
  await rpc(U.eight, 'invite_redeem($1)', [code]); // al vriend
  await owner(`update public.invite_codes set uses = 24 where id = '${inviteId}'`);
  assert.equal((await rpc(U.four, 'invite_redeem($1)', [code])).value.status, 'ok', 'de 25e persoon past nog');
  assert.equal((await owner(`select uses from public.invite_codes where id = '${inviteId}'`)).rows[0].uses, 25);
  assert.deepEqual(await peek(code), { status: 'invalid' }, 'vol: de voorvertoning zegt hetzelfde als bij een verzonnen code');
  assert.equal((await rpc(U.three, 'invite_redeem($1)', [code])).value.status, 'invalid', 'de 26e krijgt niets');
  assert.deepEqual((await rpc(U.eight, 'invite_redeem($1)', [code])).value.already_friends, true, 'een bestaande vriend merkt er niets van');
});

// ---- begrenzing ---------------------------------------------------------------------------------------------------------------

t('raden loont niet: elke poging telt, ook een mislukte (20 per uur), daarna volgt een fout', async () => {
  const results = [];
  for (let i = 0; i < 24; i += 1) results.push(await rpc(U.six, 'invite_redeem($1)', [String(i).padStart(64, 'f')]));
  // u6 wisselde eerder al 1 keer in (ok), dus 19 foute pogingen passen er nog in
  const invalid = results.filter((r) => r.ok && r.value.status === 'invalid').length;
  const limited = results.filter((r) => r.code === 'too_many_requests').length;
  assert.equal(invalid, 19);
  assert.equal(limited, 5);
  const counted = await owner(`select count(*)::int as n from public.social_rate where user_id = '${U.six}' and action = 'redeem'`);
  assert.equal(counted.rows[0].n, 20, 'ook de mislukte pogingen staan geteld (de rij blijft staan, het gaat niet in een rollback)');
});

t('zoeken is begrensd op 20 per uur', async () => {
  const results = [];
  for (let i = 0; i < 22; i += 1) results.push(await rpc(U.five, 'social_find($1)', [`gok${i}`]));
  assert.equal(results.filter((r) => r.ok).length, 20);
  assert.equal(results.filter((r) => r.code === 'too_many_requests').length, 2);
});

t('hoogstens 20 openstaande verzoeken en 50 vrienden', async () => {
  const many = [];
  for (let i = 0; i < 70; i += 1) many.push(id(1000 + i));
  await owner(`insert into auth.users (id, email) select u::uuid, u || '@x.nl' from unnest($1::text[]) as u`, [many]);
  await owner(`insert into public.social_profiles (user_id, username) select u::uuid, 'gebruiker' || row_number() over () from unnest($1::text[]) as u`, [many]);
  // 20 openstaande verzoeken van u1 aan anderen
  await owner(`insert into public.friendships (user_low, user_high, requested_by) select least($1::uuid, u::uuid), greatest($1::uuid, u::uuid), $1::uuid from unnest($2::text[]) as u`, [U.one, many.slice(0, 20)]);
  assert.equal((await rpc(U.one, 'friend_request($1::uuid)', [many[30]])).code, 'pending_limit');
  await owner(`delete from public.friendships where requested_by = '${U.one}' and status = 'pending'`);
  // 50 vrienden van u2
  await owner(`insert into public.friendships (user_low, user_high, requested_by, status) select least($1::uuid, u::uuid), greatest($1::uuid, u::uuid), u::uuid, 'accepted' from unnest($2::text[]) as u`, [U.two, many.slice(0, 50)]);
  assert.equal((await rpc(U.two, 'friend_request($1::uuid)', [many[60]])).code, 'friend_limit');
  assert.equal((await rpc(U.three, 'friend_request($1::uuid)', [U.two])).value.status, 'pending', 'het verzoek aan iemand met een volle lijst mag, accepteren niet');
  assert.equal((await rpc(U.two, 'friend_respond($1::uuid, true)', [U.three])).code, 'friend_limit');
  const { code } = (await rpc(U.three, 'invite_create()')).value;
  assert.equal((await rpc(U.two, 'invite_redeem($1)', [code])).code, 'friend_limit');
  await owner(`delete from auth.users where id::text = any($1::text[])`, [many]); // opruimen (cascade)
  assert.equal((await owner('select count(*)::int as n from public.friendships where user_low::text = any($1::text[]) or user_high::text = any($1::text[])', [many])).rows[0].n, 0);
});

// ---- de ranglijst ------------------------------------------------------------------------------------------------------------

t('een ongeldige samenvatting wordt geweigerd', async () => {
  const bad = [
    { points: -5 }, { points: 10_000_000 }, { done: 99999 }, { streak: -1 }, { habits: 9999 },
    { asOf: '2020-01-01', lastActive: '2020-01-01' }, { lastActive: '2099-01-01' },
  ];
  for (const extra of bad) assert.equal((await summary(U.one, 50, extra)).code, 'invalid_summary', JSON.stringify(extra));
});

t('de ranglijst toont jou en je geaccepteerde vrienden, niet de rest, en alleen de samenvattingsvelden', async () => {
  // vriendschappen: u1–u5, u1–u6 (via de uitnodiging), u3–u4. u2 is niet (meer) bevriend met u1
  for (const [uid, points] of [[U.one, 240], [U.two, 180], [U.three, 120], [U.four, 90], [U.five, 300], [U.six, 60]]) assert.equal((await summary(uid, points)).ok, true, String(uid));
  const one = await rpc(U.one, 'leaderboard()');
  assert.deepEqual(one.rows.map((r) => r.user_id).sort(), [U.one, U.five, U.six].sort());
  assert.equal(one.rows.filter((r) => r.is_me).length, 1);
  assert.deepEqual(Object.keys(one.rows[0]).sort(), ['active_habits', 'as_of', 'display_name', 'done', 'is_me', 'last_active', 'points', 'streak', 'user_id', 'username']);
  const three = await rpc(U.three, 'leaderboard()');
  assert.deepEqual(three.rows.map((r) => r.user_id).sort(), [U.three, U.four].sort(), 'een niet-vriend van u1 ziet u1 niet');
});

t('opnieuw publiceren werkt de rij bij (er is één rij per gebruiker)', async () => {
  assert.equal((await summary(U.five, 310)).ok, true);
  assert.equal((await owner(`select count(*)::int as n from public.score_summaries where user_id = '${U.five}'`)).rows[0].n, 1);
  assert.equal((await rpc(U.one, 'leaderboard()')).rows.find((r) => r.user_id === U.five).points, 310);
});

t('sociaal uitzetten wist je samenvatting en haalt je uit lijsten; de vriendschap blijft bewaard', async () => {
  await rpc(U.five, 'social_disable()');
  assert.equal((await owner(`select count(*)::int as n from public.score_summaries where user_id = '${U.five}'`)).rows[0].n, 0);
  assert.ok(!(await rpc(U.one, 'leaderboard()')).rows.some((r) => r.user_id === U.five));
  assert.ok(!(await rpc(U.one, 'friend_list()')).rows.some((r) => r.user_id === U.five));
  await enable(U.five, 'dora', 'Dora');
  assert.ok((await rpc(U.one, 'friend_list()')).rows.some((r) => r.user_id === U.five && r.state === 'friend'));
});

t('een account verwijderen wist profiel, vriendschappen, uitnodigingen en samenvatting (cascade)', async () => {
  await owner(`delete from auth.users where id = '${U.six}'`);
  for (const table of ['social_profiles', 'score_summaries', 'invite_codes', 'social_rate']) {
    assert.equal((await owner(`select count(*)::int as n from public.${table} where ${table === 'invite_codes' ? 'owner' : 'user_id'} = '${U.six}'`)).rows[0].n, 0, table);
  }
  assert.equal((await owner(`select count(*)::int as n from public.friendships where '${U.six}' in (user_low, user_high)`)).rows[0].n, 0);
  assert.ok(!(await rpc(U.one, 'leaderboard()')).rows.some((r) => r.user_id === U.six));
});

t('de bestaande tabellen en rechten uit 0001 en 0002 zijn niet veranderd door 0003', async () => {
  const mine = await as('authenticated', U.one, () => db.query('select count(*)::int as n from public.records'));
  assert.equal(mine.rows[0].n, 0);
  const anon = await as('anon', null, async () => { try { return (await db.query('select * from public.records')).rows.length; } catch { return 0; } });
  assert.equal(anon, 0);
});
