// De feedbackhub aan de serverkant (supabase/migrations/0007_feedback.sql), in een echte Postgres (PGlite) met een nagebootst Supabase-auth-schema
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
const USER = id(2);
const OTHER = id(3);

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
  for (const name of ['0001_init.sql', '0006_dev_usage.sql', '0007_feedback.sql']) await db.exec(migration(name));
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'beheer@x.nl'), ('${USER}', 'anna@x.nl'), ('${OTHER}', 'bram@x.nl');`);
  await db.exec(`insert into public.app_admins (user_id) values ('${ADMIN}');`);
}

async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid }) : ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
/** Roept een functie aan als `uid` (of anon). Geeft { ok, rows, code }; bij een fout is code de stabiele foutcode. */
async function rpc(uid, call, params = [], role = uid ? 'authenticated' : 'anon') {
  try {
    const result = await as(role, uid, () => db.query(`select * from public.${call}`, params));
    return { ok: true, rows: result.rows, value: result.rows[0] && Object.values(result.rows[0])[0], code: null };
  } catch (error) {
    return { ok: false, rows: [], value: null, code: error.message };
  }
}
const send = (uid, kind, body, extra = {}) => rpc(uid, 'feedback_send($1, $2, $3, $4, $5)', [kind, body, extra.route ?? '#/today', extra.version ?? '1.2', extra.contact ?? false]);
const all = async () => (await db.query('select * from public.feedback order by created_at, id')).rows;
const clear = () => db.exec('delete from public.feedback;');
const t = (name, fn) => test(name, { skip }, async () => { await clear(); await fn(); });

t('de migratie is idempotent: een tweede keer draaien geeft geen fout', async () => {
  await db.exec(migration('0007_feedback.sql'));
});

t('niemand kan de tabel rechtstreeks lezen of schrijven, ook ingelogd of als beheerder niet', async () => {
  for (const [role, uid] of [['anon', null], ['authenticated', USER], ['authenticated', ADMIN]]) {
    await assert.rejects(as(role, uid, () => db.query('select * from public.feedback')), /permission denied/i);
    await assert.rejects(as(role, uid, () => db.query(`insert into public.feedback (kind, body) values ('idea', 'x')`)), /permission denied/i);
    await assert.rejects(as(role, uid, () => db.query('delete from public.feedback')), /permission denied/i);
  }
});

t('zonder account versturen werkt en blijft anoniem: geen gebruiker en geen adres', async () => {
  const result = await send(null, 'idea', '  Een donker thema graag  ', { route: '#/habits', version: '1.2' });
  assert.equal(result.ok, true, result.code);
  const [row] = await all();
  assert.deepEqual([row.kind, row.body, row.route, row.app_version, row.user_id, row.contact_email, row.status], ['idea', 'Een donker thema graag', '#/habits', '1.2', null, null, 'new']);
});

t('ingelogd zonder vinkje is ook anoniem; met het vinkje komt het adres van het account erbij (van de server, niet van de telefoon)', async () => {
  await send(USER, 'problem', 'Het scherm hapert', { contact: false });
  await send(USER, 'question', 'Hoe werkt dit?', { contact: true });
  const rows = await all(); // op tekst zoeken, niet op volgorde: gelijke tijdstippen worden op een willekeurig id gesorteerd
  const anonymous = rows.find((row) => row.body === 'Het scherm hapert');
  const contact = rows.find((row) => row.body === 'Hoe werkt dit?');
  assert.deepEqual([anonymous.user_id, anonymous.contact_email], [null, null]);
  assert.deepEqual([contact.user_id, contact.contact_email], [USER, 'anna@x.nl']);
});

t('met het vinkje maar zonder account blijft het anoniem', async () => {
  await send(null, 'compliment', 'Mooi!', { contact: true });
  const [row] = await all();
  assert.deepEqual([row.user_id, row.contact_email], [null, null]);
});

t('ongeldige soort of tekst wordt geweigerd: leeg, alleen spaties, te lang, onbekende soort', async () => {
  for (const [kind, body] of [['idea', ''], ['idea', '   '], ['idea', 'x'.repeat(1001)], ['onzin', 'tekst'], [null, 'tekst']]) {
    const result = await send(null, kind, body);
    assert.equal(result.code, 'invalid_feedback', `${kind}/${body.length}`);
  }
  assert.equal((await all()).length, 0);
  assert.equal((await send(null, 'idea', 'x'.repeat(1000))).ok, true, 'precies 1000 mag');
});

t('pagina en versie worden ingekort in plaats van geweigerd, en een lege waarde wordt null', async () => {
  await send(null, 'idea', 'tekst', { route: 'r'.repeat(300), version: 'v'.repeat(80) });
  await send(null, 'idea', 'tekst 2', { route: '  ', version: '' });
  // op tekst zoeken, niet op volgorde: twee rijen kunnen hetzelfde tijdstip krijgen, en dan beslist het willekeurige id
  const rows = await all();
  const long = rows.find((row) => row.body === 'tekst');
  const empty = rows.find((row) => row.body === 'tekst 2');
  assert.deepEqual([long.route.length, long.app_version.length], [100, 20]);
  assert.deepEqual([empty.route, empty.app_version], [null, null]);
});

t('tempo: hoogstens 20 per minuut in totaal, daarna too_many_requests (en wat er staat blijft staan)', async () => {
  for (let i = 0; i < 20; i += 1) assert.equal((await send(null, 'idea', `bericht ${i}`)).ok, true);
  assert.equal((await send(null, 'idea', 'nummer 21')).code, 'too_many_requests');
  assert.equal((await send(USER, 'idea', 'ook ingelogd niet')).code, 'too_many_requests');
  assert.equal((await all()).length, 20);
  // een minuut later kan het weer
  await db.exec(`update public.feedback set created_at = now() - interval '2 minutes'`);
  assert.equal((await send(null, 'idea', 'weer ruimte')).ok, true);
});

t('tempo per dag: bij 500 in een dag is het op, ook als ze niet in dezelfde minuut kwamen', async () => {
  await db.exec(`insert into public.feedback (kind, body, created_at) select 'idea', 'x', now() - interval '3 hours' from generate_series(1, 500)`);
  assert.equal((await send(null, 'idea', 'één te veel')).code, 'too_many_requests');
});

t('app_is_admin: alleen de beheerder; anon kan het niet vragen', async () => {
  assert.equal((await rpc(ADMIN, 'app_is_admin()')).value, true);
  assert.equal((await rpc(USER, 'app_is_admin()')).value, false);
  assert.match((await rpc(null, 'app_is_admin()')).code ?? '', /permission denied/i);
});

t('alleen de beheerder leest de berichten, nieuwste eerst; een ander krijgt een lege lijst en geen foutmelding', async () => {
  await send(null, 'idea', 'eerste');
  await db.exec(`update public.feedback set created_at = now() - interval '5 minutes'`);
  await send(USER, 'problem', 'tweede', { contact: true });
  const asAdmin = await rpc(ADMIN, 'feedback_list()');
  assert.deepEqual(asAdmin.rows.map((r) => r.body), ['tweede', 'eerste']);
  assert.equal(asAdmin.rows[0].contact_email, 'anna@x.nl');
  const asUser = await rpc(USER, 'feedback_list()');
  assert.deepEqual([asUser.ok, asUser.rows.length], [true, 0]);
  assert.match((await rpc(null, 'feedback_list()')).code ?? '', /permission denied/i);
});

t('afhandelen en weer openen: alleen de beheerder, met een tijdstip bij afgehandeld', async () => {
  await send(null, 'idea', 'iets');
  const [{ id: feedbackId }] = await all();
  assert.equal((await rpc(USER, 'feedback_set_status($1::uuid, $2)', [feedbackId, 'done'])).value, false);
  assert.equal((await all())[0].status, 'new');
  assert.equal((await rpc(ADMIN, 'feedback_set_status($1::uuid, $2)', [feedbackId, 'done'])).value, true);
  const [done] = await all();
  assert.deepEqual([done.status, done.handled_at !== null], ['done', true]);
  assert.equal((await rpc(ADMIN, 'feedback_set_status($1::uuid, $2)', [feedbackId, 'new'])).value, true);
  const [reopened] = await all();
  assert.deepEqual([reopened.status, reopened.handled_at], ['new', null]);
  assert.equal((await rpc(ADMIN, 'feedback_set_status($1::uuid, $2)', [feedbackId, 'onzin'])).value, false);
  assert.equal((await rpc(ADMIN, 'feedback_set_status($1::uuid, $2)', [id(99), 'done'])).value, false, 'een onbekend bericht');
});

t('verwijderen: alleen de beheerder', async () => {
  await send(null, 'idea', 'weg ermee');
  const [{ id: feedbackId }] = await all();
  assert.equal((await rpc(USER, 'feedback_delete($1::uuid)', [feedbackId])).value, false);
  assert.equal((await all()).length, 1);
  assert.equal((await rpc(ADMIN, 'feedback_delete($1::uuid)', [feedbackId])).value, true);
  assert.equal((await all()).length, 0);
});

t('een account verwijderen haalt de berichten weg die eraan gekoppeld zijn, en laat de anonieme staan', async () => {
  await send(USER, 'question', 'gekoppeld', { contact: true });
  await send(USER, 'idea', 'anoniem', { contact: false });
  await db.exec(`delete from auth.users where id = '${USER}'`);
  assert.deepEqual((await all()).map((r) => r.body), ['anoniem']);
  await db.exec(`insert into auth.users (id, email) values ('${USER}', 'anna@x.nl')`);
});
