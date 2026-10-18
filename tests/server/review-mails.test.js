// De e-mailherinnering aan de serverkant (supabase/migrations/0008_review_mails.sql), in een echte Postgres (PGlite) met een nagebootst Supabase-auth-schema
// en dezelfde standaardrechten als Supabase. Overgeslagen als PGlite niet is geïnstalleerd (npm ci).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* niet geïnstalleerd */ }
const skip = PGlite ? false : 'PGlite is niet geïnstalleerd (npm ci)';

const migration = (name) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [STALE, ACTIVE, ANON, NOMAIL, OUT, NEVER] = [1, 2, 3, 4, 5, 6].map(id);

let db = null;
if (PGlite) {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false, created_at timestamptz not null default now());
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
  await db.exec(migration('0001_init.sql'));
  await db.exec(migration('0008_review_mails.sql'));
  // de trigger zet updated_at altijd op nu; voor de test van "al lang niet actief" schakelen we hem uit bij het aanmaken van de gegevens
  await db.exec('alter table public.records disable trigger records_touch;');
}

const daysAgo = (n) => `now() - interval '${n} days'`;
async function reset() {
  await db.exec('delete from public.review_mail_state; delete from public.records; delete from auth.users;');
  await db.exec(`
    insert into auth.users (id, email, is_anonymous, created_at) values
      ('${STALE}', 'stale@x.nl', false, ${daysAgo(90)}), ('${ACTIVE}', 'actief@x.nl', false, ${daysAgo(90)}), ('${ANON}', null, true, ${daysAgo(90)}),
      ('${NOMAIL}', '', false, ${daysAgo(90)}), ('${OUT}', 'uit@x.nl', false, ${daysAgo(90)}), ('${NEVER}', 'nooit@x.nl', false, ${daysAgo(60)});
    insert into public.records (user_id, collection, id, data, updated_at) values
      ('${STALE}', 'checkIns', 'h|2026-09-01', '{}', ${daysAgo(20)}),
      ('${STALE}', 'settings', 'user', '{"displayName":" Anna ","timezone":"Europe/Brussels"}', ${daysAgo(30)}),
      ('${ACTIVE}', 'checkIns', 'h|2026-10-14', '{}', ${daysAgo(2)}),
      ('${ANON}', 'checkIns', 'h|2026-09-01', '{}', ${daysAgo(40)}),
      ('${NOMAIL}', 'checkIns', 'h|2026-09-01', '{}', ${daysAgo(40)}),
      ('${OUT}', 'checkIns', 'h|2026-09-01', '{}', ${daysAgo(40)});
    insert into public.review_mail_state (user_id, opted_out) values ('${OUT}', true);
  `);
}
const t = (name, fn) => test(name, { skip }, async () => { await reset(); await fn(); });
const candidates = async (...args) => (await db.query(`select * from public.review_mail_candidates(${args.join(', ')})`)).rows;
const ids = (rows) => rows.map((r) => r.user_id).sort();

async function asRole(role, uid, sql, params = []) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid }) : ''}', false);`);
  try { return { ok: true, rows: (await db.query(sql, params)).rows }; } catch (error) { return { ok: false, rows: [], error: error.message }; } finally { await db.exec('reset role;'); }
}

t('de migratie is idempotent: een tweede keer draaien geeft geen fout', async () => {
  await db.exec(migration('0008_review_mails.sql'));
});

t('candidates: alleen accounts met een adres, niet anoniem, niet afgemeld en 14 dagen zonder activiteit; zonder gegevens telt de aanmaakdatum', async () => {
  assert.deepEqual(ids(await candidates()), [STALE, NEVER].sort());
  assert.deepEqual(ids(await candidates(100)), [], 'bij een drempel van 100 dagen is niemand stale');
  assert.deepEqual(ids(await candidates(10)), [STALE, NEVER].sort(), 'ACTIVE (2 dagen) blijft buiten beeld');
  assert.deepEqual(ids(await candidates(45)), [NEVER].sort(), 'STALE was 20 dagen weg: bij 45 dagen nog niet stale');
});

t('candidates: naam en tijdzone komen uit de instellingen, met Amsterdam als vangnet', async () => {
  const rows = await candidates();
  const stale = rows.find((r) => r.user_id === STALE);
  assert.deepEqual([stale.display_name, stale.timezone], ['Anna', 'Europe/Brussels']);
  const never = rows.find((r) => r.user_id === NEVER);
  assert.deepEqual([never.display_name, never.timezone], [null, 'Europe/Amsterdam']);
});

t('mark_sent: telt onbeantwoorde mails, stopt na drie en begint opnieuw zodra het account weer iets schrijft', async () => {
  const send = (on) => db.query('select public.review_mail_mark_sent($1, $2)', [STALE, on]);
  const state = async () => (await db.query('select unanswered, last_sent_on::text as on from public.review_mail_state where user_id = $1', [STALE])).rows[0];
  await send('2026-10-02');
  await send('2026-10-09');
  assert.deepEqual(await state(), { unanswered: 2, on: '2026-10-09' });
  assert.ok(ids(await candidates()).includes(STALE), 'twee mails: nog steeds aan de beurt');
  await send('2026-10-16');
  assert.equal((await state()).unanswered, 3);
  assert.ok(!ids(await candidates()).includes(STALE), 'drie onbeantwoord: de mails stoppen');
  assert.ok(ids(await candidates(14, 4)).includes(STALE), 'met een hogere grens weer wel');

  // het account schrijft weer iets (ruim vóór nu, zodat het wel weer stale is) maar na de laatste mail: de teller begint opnieuw
  await db.exec(`update public.review_mail_state set last_sent_at = ${daysAgo(30)} where user_id = '${STALE}';
                 update public.records set updated_at = ${daysAgo(20)} where user_id = '${STALE}' and collection = 'checkIns';`);
  assert.ok(ids(await candidates()).includes(STALE), 'activiteit na de laatste mail: weer aan de beurt');
  await send('2026-10-23');
  assert.equal((await state()).unanswered, 1);
});

t('set_opt_out: afmelden haalt het account uit de lijst, weer aanmelden zet het terug', async () => {
  await db.query('select public.review_mail_set_opt_out($1, true)', [STALE]);
  assert.ok(!ids(await candidates()).includes(STALE));
  await db.query('select public.review_mail_set_opt_out($1, false)', [STALE]);
  assert.ok(ids(await candidates()).includes(STALE));
});

t('rechten: alleen de service-sleutel mag de lijst, de teller en het afmelden aanraken; ook de tabel zelf is dicht', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const sql of [
      'select * from public.review_mail_candidates()',
      `select public.review_mail_mark_sent('${STALE}', '2026-10-23')`,
      `select public.review_mail_set_opt_out('${STALE}', true)`,
      'select * from public.review_mail_state',
      `update public.review_mail_state set opted_out = false where user_id = '${OUT}'`,
    ]) {
      const result = await asRole(role, STALE, sql);
      assert.equal(result.ok, false, `${role}: ${sql}`);
    }
  }
  assert.equal((await db.query('select opted_out from public.review_mail_state where user_id = $1', [OUT])).rows[0].opted_out, true);
});

t('voorkeur: een ingelogd account ziet en zet alleen zijn eigen stand; zonder inlog niets; standaard staat de mail aan', async () => {
  const pref = (uid) => asRole(uid ? 'authenticated' : 'anon', uid, 'select public.review_mail_pref() as v');
  assert.equal((await pref(STALE)).rows[0].v, true, 'standaard aan');
  assert.equal((await pref(OUT)).rows[0].v, false, 'afgemeld');
  assert.equal((await pref(null)).ok, false, 'anon heeft er niets te zoeken');

  const off = await asRole('authenticated', STALE, 'select public.review_mail_set_pref(false) as v');
  assert.deepEqual([off.ok, off.rows[0].v], [true, false]);
  assert.ok(!ids(await candidates()).includes(STALE));
  assert.equal((await pref(OUT)).rows[0].v, false, 'andermans stand blijft zoals hij was');
  const on = await asRole('authenticated', STALE, 'select public.review_mail_set_pref(true) as v');
  assert.equal(on.rows[0].v, true);
  assert.ok(ids(await candidates()).includes(STALE));
  assert.equal((await asRole('anon', null, 'select public.review_mail_set_pref(true)')).ok, false);
});

t('verwijderen van het account ruimt de stand op (cascade)', async () => {
  await db.query('select public.review_mail_mark_sent($1, $2)', [STALE, '2026-10-23']);
  await db.exec(`delete from public.records where user_id = '${STALE}'; delete from auth.users where id = '${STALE}';`);
  assert.equal((await db.query('select count(*)::int as n from public.review_mail_state where user_id = $1', [STALE])).rows[0].n, 0);
});
