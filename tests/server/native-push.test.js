// De uitbreiding van push_subscriptions voor de Android-app (supabase/migrations/0009_native_push.sql), in een echte Postgres (PGlite)
// met een nagebootst Supabase-auth-schema. Overgeslagen als PGlite niet is geïnstalleerd (npm ci).
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
  await db.exec(migration('0002_push.sql'));
  await db.exec(`insert into auth.users (id, email) values ('${USER}', 'a@x.nl'), ('${OTHER}', 'b@x.nl');`);
}

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid })}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const t = (name, fn) => test(name, { skip }, fn);

const web = (uid, endpoint) => as(uid, () => db.query(
  `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')`, [uid, endpoint]));
const android = (uid, token) => as(uid, () => db.query(
  `insert into public.push_subscriptions (user_id, platform, fcm_token) values ($1, 'android', $2)`, [uid, token]));
const rows = (uid) => as(uid, async () => (await db.query('select platform, endpoint, fcm_token from public.push_subscriptions order by created_at, id')).rows);

t('vóór de migratie kan een app-toestel niet worden opgeslagen', async () => {
  await assert.rejects(as(USER, () => db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, null, null, null)`, [USER])), /null value|not-null/i);
});

t('een webrij van vóór de migratie blijft bestaan en werkt (oudere app-versies)', async () => {
  await web(USER, 'https://push.example/oud');
  await db.exec(migration('0009_native_push.sql'));
  await db.exec(migration('0009_native_push.sql')); // idempotent
  const [row] = await rows(USER);
  assert.deepEqual(row, { platform: 'web', endpoint: 'https://push.example/oud', fcm_token: null });
  await web(USER, 'https://push.example/nieuw'); // een app zonder platform in de insert: de standaardwaarde 'web'
  assert.equal((await rows(USER)).length, 2);
});

t('een app-toestel wordt opgeslagen met alleen een token', async () => {
  await android(USER, 'fcm-token-1');
  const found = (await rows(USER)).find((r) => r.fcm_token === 'fcm-token-1');
  assert.deepEqual(found, { platform: 'android', endpoint: null, fcm_token: 'fcm-token-1' });
});

t('dezelfde token twee keer voor dezelfde gebruiker mag niet (de app werkt hem bij met een upsert)', async () => {
  await assert.rejects(android(USER, 'fcm-token-1'), /push_unique_fcm_per_user|unique/i);
  await as(USER, () => db.query(
    `insert into public.push_subscriptions (user_id, platform, fcm_token, remind_time) values ($1, 'android', 'fcm-token-1', '09:30')
     on conflict (user_id, fcm_token) do update set remind_time = excluded.remind_time`, [USER]));
  const { rows: [row] } = await as(USER, () => db.query(`select remind_time from public.push_subscriptions where fcm_token = 'fcm-token-1'`));
  assert.equal(row.remind_time, '09:30');
});

t('een rij is óf web óf app: gemengde of lege vormen worden geweigerd', async () => {
  const bad = (sql, params) => assert.rejects(as(USER, () => db.query(sql, params)), /push_platform_shape|check constraint/i);
  await bad(`insert into public.push_subscriptions (user_id, platform, endpoint, p256dh, auth, fcm_token) values ($1, 'web', 'https://x.example/', 'p', 'a', 'tok')`, [USER]);
  await bad(`insert into public.push_subscriptions (user_id, platform, endpoint, p256dh, auth) values ($1, 'android', 'https://x.example/', 'p', 'a')`, [USER]);
  await bad(`insert into public.push_subscriptions (user_id, platform) values ($1, 'android')`, [USER]);
  await bad(`insert into public.push_subscriptions (user_id, platform, fcm_token) values ($1, 'web', 'tok-web')`, [USER]);
  await bad(`insert into public.push_subscriptions (user_id, platform, fcm_token) values ($1, 'ios', 'tok-ios')`, [USER]);
});

t('de lengtegrenzen gelden nog: een token van meer dan 500 tekens en een webadres zonder https', async () => {
  await assert.rejects(android(USER, 'x'.repeat(501)), /push_fcm_token_length|check constraint/i);
  await assert.rejects(android(USER, ''), /push_fcm_token_length|check constraint/i);
  await assert.rejects(web(USER, 'http://onveilig.example/'), /push_endpoint_https|check constraint/i);
});

t('RLS: je ziet en wijzigt alleen je eigen toestellen, ook die van de app', async () => {
  await android(OTHER, 'fcm-token-van-een-ander');
  assert.ok(!(await rows(USER)).some((r) => r.fcm_token === 'fcm-token-van-een-ander'));
  assert.ok((await rows(OTHER)).some((r) => r.fcm_token === 'fcm-token-van-een-ander'));
  const removed = await as(USER, () => db.query(`delete from public.push_subscriptions where fcm_token = 'fcm-token-van-een-ander' returning id`));
  assert.equal(removed.rows.length, 0);
  await assert.rejects(as(USER, () => db.query(
    `insert into public.push_subscriptions (user_id, platform, fcm_token) values ($1, 'android', 'zo-kan-het-niet')`, [OTHER])), /row-level security/i);
});

t('hoogstens 10 toestellen per gebruiker, web en app samen', async () => {
  const { rows: [{ count }] } = await as(USER, () => db.query('select count(*)::int as count from public.push_subscriptions'));
  for (let i = count; i < 10; i++) await android(USER, `fill-${i}`);
  await assert.rejects(android(USER, 'te-veel'), /te veel apparaten/i);
});

t('anon kan niets met de tabel', async () => {
  await db.exec(`set role anon;`);
  try {
    await assert.rejects(db.query('select * from public.push_subscriptions'), /permission denied/i);
  } finally {
    await db.exec('reset role;');
  }
});
