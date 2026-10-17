// De teller voor de ontwikkelaar (supabase/migrations/0006_dev_usage.sql), in een echte Postgres (PGlite) met een nagebootst Supabase-auth-schema
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
const ADMIN = id(1);
const OTHERS = [id(2), id(3), id(4), id(5)];

let db = null;
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
  await db.exec(migration('0001_init.sql'));
  await db.exec(migration('0006_dev_usage.sql'));
  await db.exec(`insert into auth.users (id, email) values ${[ADMIN, ...OTHERS].map((u) => `('${u}', '${u}@x.nl')`).join(', ')};`);
  await db.exec(`insert into public.app_admins (user_id) values ('${ADMIN}');`);
  // de trigger zet updated_at zelf; voor de test moeten we een tijdstip kunnen kiezen
  await db.exec('alter table public.records disable trigger records_touch;');
}

async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid }) : ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const usage = async (uid, role = 'authenticated') => (await as(role, uid, () => db.query('select public.dev_usage() as usage'))).rows[0].usage;
const touch = (uid, collection, when) => db.query(
  `insert into public.records (user_id, collection, id, data, updated_at) values ($1, $2, 'x', '{}'::jsonb, ${when})
   on conflict (user_id, collection, id) do update set updated_at = excluded.updated_at`, [uid, collection]);
const t = (name, fn) => test(name, { skip }, fn);

t('de migratie is idempotent: een tweede keer draaien geeft geen fout', async () => {
  await db.exec(migration('0006_dev_usage.sql'));
});

t('een gewone gebruiker krijgt niets terug, en ook niet dat het een beheerdersfunctie is', async () => {
  assert.equal(await usage(OTHERS[0]), null);
});

t('anon kan de functie niet aanroepen', async () => {
  await assert.rejects(usage(null, 'anon'), /permission denied/i);
});

t('niemand kan de lijst met beheerders lezen of aanpassen, ook een beheerder niet', async () => {
  for (const uid of [ADMIN, OTHERS[0]]) {
    await assert.rejects(as('authenticated', uid, () => db.query('select * from public.app_admins')), /permission denied/i);
    await assert.rejects(as('authenticated', uid, () => db.query(`insert into public.app_admins (user_id) values ('${OTHERS[1]}')`)), /permission denied/i);
  }
  await assert.rejects(as('anon', null, () => db.query('select * from public.app_admins')), /permission denied/i);
});

t('de beheerder telt de anderen, niet zichzelf', async () => {
  assert.deepEqual(await usage(ADMIN), { users: 4, active_today: 0 });
});

t('actief vandaag: wie vandaag iets heeft gesynchroniseerd, één keer geteld ook met meer records; jezelf niet; gisteren niet', async () => {
  await touch(OTHERS[0], 'habits', 'now()');
  await touch(OTHERS[0], 'checkIns', 'now()'); // dezelfde gebruiker nog een keer
  await touch(OTHERS[1], 'habits', "now() - interval '2 days'"); // niet vandaag
  await touch(ADMIN, 'habits', 'now()'); // de beheerder zelf
  assert.deepEqual(await usage(ADMIN), { users: 4, active_today: 1 });
  await touch(OTHERS[2], 'habits', 'now()');
  assert.equal((await usage(ADMIN)).active_today, 2);
});

t('vandaag is de dag in Nederland, niet in UTC', async () => {
  // een nacht in Nederland: 23:30 UTC gisteren is al 00:30 of 01:30 vandaag; 22:30 UTC gisteren is 23:30 of 00:30
  const amsterdam = (await db.query("select (now() at time zone 'Europe/Amsterdam')::date as d")).rows[0].d;
  const startOfToday = `((date '${amsterdam.toISOString().slice(0, 10)}')::timestamp at time zone 'Europe/Amsterdam')`;
  await touch(OTHERS[3], 'habits', `${startOfToday} + interval '1 minute'`);
  assert.equal((await usage(ADMIN)).active_today, 3);
  await touch(OTHERS[3], 'habits', `${startOfToday} - interval '1 minute'`);
  assert.equal((await usage(ADMIN)).active_today, 2);
});

t('een verwijderd account telt niet meer mee', async () => {
  await db.exec(`delete from auth.users where id = '${OTHERS[2]}';`);
  assert.deepEqual(await usage(ADMIN), { users: 3, active_today: 1 });
});
