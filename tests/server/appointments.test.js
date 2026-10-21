// De collectie voor losse afspraken (supabase/migrations/0008_appointments.sql), in een echte Postgres (PGlite) met een nagebootst Supabase-auth-schema.
// Overgeslagen als PGlite niet is geïnstalleerd (npm ci).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* niet geïnstalleerd */ }
const skip = PGlite ? false : 'PGlite is niet geïnstalleerd (npm ci)';

const migration = (name) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), 'utf8');
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

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
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `);
  await db.exec(migration('0001_init.sql'));
  await db.exec(migration('0004_reasons.sql'));
  await db.exec(`insert into auth.users (id, email) values ('${USER}', 'a@x.nl'), ('${OTHER}', 'b@x.nl');`);
}

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid })}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const put = (uid, collection, id) => as(uid, () => db.query(
  'insert into public.records (user_id, collection, id, data) values ($1, $2, $3, $4::jsonb)', [uid, collection, id, JSON.stringify({ title: 'Bellen', date: '2026-10-17' })]));
const t = (name, fn) => test(name, { skip }, fn);

t('vóór de migratie weigert de server de collectie "appointments"', async () => {
  await assert.rejects(put(USER, 'appointments', 'a-0'), /records_collection_known|check constraint/i);
});

t('na de migratie mag een gebruiker eigen afspraken bewaren, en de migratie is idempotent', async () => {
  await db.exec(migration('0008_appointments.sql'));
  await db.exec(migration('0008_appointments.sql'));
  await put(USER, 'appointments', 'a-1');
  const rows = await as(USER, () => db.query("select id from public.records where collection = 'appointments'"));
  assert.deepEqual(rows.rows.map((r) => r.id), ['a-1']);
});

t('een andere gebruiker ziet de afspraken niet', async () => {
  const rows = await as(OTHER, () => db.query("select id from public.records where collection = 'appointments'"));
  assert.deepEqual(rows.rows, []);
});

t('de bestaande collecties blijven toegestaan en een onbekende niet', async () => {
  await put(USER, 'reasons', 'r-1');
  await put(USER, 'habits', 'h-1');
  await assert.rejects(put(USER, 'todos', 't-1'), /records_collection_known|check constraint/i);
});
