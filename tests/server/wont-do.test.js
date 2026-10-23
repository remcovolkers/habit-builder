// "Ga ik niet doen" (docs/WONT-DO.md) heeft geen servermigratie nodig: de status 'wont' staat in het JSON van een check-in en het plan in dat van een
// reden. De server bewaakt alleen de collectienamen. Dit bewijst het tegen de bestaande migraties, in een echte Postgres (PGlite).
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
  for (const name of ['0001_init.sql', '0004_reasons.sql', '0008_appointments.sql']) await db.exec(migration(name)); // alleen wat er al was
  await db.exec(`insert into auth.users (id, email) values ('${USER}', 'a@x.nl');`);
}

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid })}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const put = (collection, id, data) => as(USER, () => db.query(
  'insert into public.records (user_id, collection, id, data) values ($1, $2, $3, $4::jsonb)', [USER, collection, id, JSON.stringify(data)]));

test('een check-in met status "wont" en een reden met een plan worden bewaard zonder nieuwe migratie', { skip }, async () => {
  await put('checkIns', 'h1|2026-10-15', { habitId: 'h1', date: '2026-10-15', status: 'wont', note: null, value: null });
  await put('reasons', 'h1|2026-10-15', { habitId: 'h1', date: '2026-10-15', reason: 'no_time', note: null, plan: 'kleiner beginnen' });
  const rows = await as(USER, () => db.query("select collection, data from public.records order by collection"));
  assert.deepEqual(rows.rows.map((r) => [r.collection, r.data.status ?? r.data.plan]), [['checkIns', 'wont'], ['reasons', 'kleiner beginnen']]);
});
