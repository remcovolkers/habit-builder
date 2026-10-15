// Valideert de migraties in supabase/migrations in een echte Postgres (PGlite), met een nagebootst Supabase-auth-schema,
// en toetst de Row Level Security: gebruiker A mag nooit data van B zien of wijzigen, anon niets.
//
// Draaien (PGlite zit bewust niet in het project): maak een lege map, voer daar `npm i @electric-sql/pglite` uit,
// kopieer dit bestand erheen en pas de paden naar de migraties aan, of draai het via `node --import` vanuit een map
// waar @electric-sql/pglite te vinden is.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFileSync(fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)), 'utf8');
const sql = migration('0001_init.sql');
const sqlPush = migration('0002_push.sql');
const db = new PGlite();
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`); };

// nagebootste Supabase-basis
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);

let syntaxOk = true;
try { await db.exec(sql); } catch (e) { syntaxOk = false; console.log(e.message); }
check('migratie draait zonder fouten', syntaxOk);
try { await db.exec(sql); check('migratie is idempotent (tweede keer ook goed)', true); } catch (e) { check('migratie is idempotent', false, e.message); }

let pushOk = true;
try { await db.exec(sqlPush); } catch (e) { pushOk = false; console.log(e.message); }
check('migratie 0002 (push) draait zonder fouten', pushOk);
try { await db.exec(sqlPush); check('migratie 0002 is idempotent', true); } catch (e) { check('migratie 0002 is idempotent', false, e.message); }

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@x.nl'), ('${B}', 'b@x.nl');`);

const as = async (role, uid, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid }) : ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
};
const tryRun = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message }; } };
const row = (uid, id, extra = '') => `insert into public.records (user_id, collection, id, data) values ('${uid}', 'habits', '${id}', '{"name":"x"}'::jsonb) ${extra}`;

// A schrijft en leest
const aInsert = await as('authenticated', A, () => tryRun(() => db.exec(row(A, 'h1'))));
check('A kan eigen record aanmaken', aInsert.ok, aInsert.error);
const aRead = await as('authenticated', A, () => db.query('select id from public.records'));
check('A ziet eigen record', aRead.rows.length === 1);

// A mag niet als B schrijven
const spoof = await as('authenticated', A, () => tryRun(() => db.exec(row(B, 'h-spoof'))));
check('A kan geen record voor B aanmaken (RLS)', !spoof.ok, 'het lukte');

// B ziet niets van A, kan het niet wijzigen of verwijderen
await as('authenticated', B, () => db.exec(row(B, 'h2')));
const bRead = await as('authenticated', B, () => db.query('select id, user_id from public.records'));
check('B ziet alleen eigen records', bRead.rows.length === 1 && bRead.rows[0].user_id === B);
const bUpdate = await as('authenticated', B, () => db.query(`update public.records set data = '{"name":"gekaapt"}'::jsonb where user_id = '${A}' returning id`));
check('B kan records van A niet wijzigen', bUpdate.rows.length === 0);
const bDelete = await as('authenticated', B, () => tryRun(() => db.query(`delete from public.records where user_id = '${A}' returning id`)));
check('B kan records van A niet verwijderen', !bDelete.ok || bDelete.value.rows.length === 0, JSON.stringify(bDelete));
const bSteal = await as('authenticated', B, () => tryRun(() => db.exec(`update public.records set user_id = '${A}' where user_id = '${B}'`)));
check('B kan eigen record niet aan A toewijzen', !bSteal.ok, 'het lukte');
const bUpsert = await as('authenticated', B, () => tryRun(() => db.exec(row(B, 'h1', `on conflict (user_id, collection, id) do update set data = excluded.data`))));
check('hetzelfde id bij B botst niet met dat van A (sleutel bevat user_id)', bUpsert.ok, bUpsert.error);
const aStill = await as('authenticated', A, () => db.query(`select data->>'name' as name from public.records where id = 'h1'`));
check('de data van A is onaangetast', aStill.rows.length === 1 && aStill.rows[0].name === 'x');

// anon
const anonRead = await as('anon', null, () => tryRun(() => db.query('select * from public.records')));
check('anon kan niet lezen', !anonRead.ok || anonRead.value.rows.length === 0, JSON.stringify(anonRead));
const anonWrite = await as('anon', null, () => tryRun(() => db.exec(row(A, 'h-anon'))));
check('anon kan niet schrijven', !anonWrite.ok, 'het lukte');
const anonDelAcc = await as('anon', null, () => tryRun(() => db.query('select public.delete_my_account()')));
check('anon kan delete_my_account niet aanroepen', !anonDelAcc.ok, 'het lukte');
const anonPing = await as('anon', null, () => tryRun(() => db.query('select public.ping() as p')));
check('anon kan ping() wel aanroepen (keepalive)', anonPing.ok && anonPing.value.rows[0].p === 'ok', JSON.stringify(anonPing));

// trigger: seq oploopt en wordt niet door de client bepaald
const seqs = await as('authenticated', A, async () => {
  await db.exec(`insert into public.records (user_id, collection, id, data, seq) values ('${A}', 'habits', 'h3', '{"a":1}', 999999) on conflict do nothing`);
  await db.exec(`update public.records set data = '{"a":2}' where id = 'h3' and user_id = '${A}'`);
  return db.query(`select id, seq from public.records order by seq`);
});
const ids = seqs.rows.map((r) => r.seq);
check('seq is strikt oplopend en niet door de client te sturen', ids.every((s, i) => i === 0 || s > ids[i - 1]) && !ids.includes(999999), JSON.stringify(seqs.rows));
const bumped = await as('authenticated', A, () => db.query(`select seq from public.records where id = 'h3'`));
const before = bumped.rows[0].seq;
await as('authenticated', A, () => db.exec(`update public.records set data = '{"a":3}' where id = 'h3' and user_id = '${A}'`));
const after = await as('authenticated', A, () => db.query(`select seq from public.records where id = 'h3'`));
check('een update geeft een hogere seq', BigInt(after.rows[0].seq) > BigInt(before));

// constraints
const badCollection = await as('authenticated', A, () => tryRun(() => db.exec(`insert into public.records (user_id, collection, id, data) values ('${A}', 'onbekend', 'x', '{}')`)));
check('onbekende collectie wordt geweigerd', !badCollection.ok);
const bigData = await as('authenticated', A, () => tryRun(() => db.exec(`insert into public.records (user_id, collection, id, data) values ('${A}', 'habits', 'groot', jsonb_build_object('t', repeat('x', 25000)))`)));
check('records groter dan 20 kB worden geweigerd', !bigData.ok);
const notObject = await as('authenticated', A, () => tryRun(() => db.exec(`insert into public.records (user_id, collection, id, data) values ('${A}', 'habits', 'arr', '[1]')`)));
check('data moet een JSON-object zijn', !notObject.ok);

// ---- push_subscriptions (0002) ----
const sub = (uid, endpoint, extra = {}) => {
  const v = { endpoint, p256dh: 'PUB', auth: 'AUTH', remind_time: '08:00', timezone: 'Europe/Amsterdam', ...extra };
  return `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, remind_time, timezone) values ('${uid}', '${v.endpoint}', '${v.p256dh}', '${v.auth}', '${v.remind_time}', '${v.timezone}')`;
};
const aSub = await as('authenticated', A, () => tryRun(() => db.exec(sub(A, 'https://push.example.org/a1'))));
check('push: A kan een eigen apparaat aanmelden', aSub.ok, aSub.error);
const aSpoofSub = await as('authenticated', A, () => tryRun(() => db.exec(sub(B, 'https://push.example.org/spoof'))));
check('push: A kan geen apparaat voor B aanmelden (RLS)', !aSpoofSub.ok, 'het lukte');
await as('authenticated', B, () => db.exec(sub(B, 'https://push.example.org/b1')));
const bSees = await as('authenticated', B, () => db.query('select endpoint from public.push_subscriptions'));
check('push: B ziet alleen eigen apparaten', bSees.rows.length === 1 && bSees.rows[0].endpoint.endsWith('/b1'));
const bUpd = await as('authenticated', B, () => db.query(`update public.push_subscriptions set remind_time = '03:33' where user_id = '${A}' returning id`));
check('push: B kan het apparaat van A niet wijzigen', bUpd.rows.length === 0);
const bDel = await as('authenticated', B, () => db.query(`delete from public.push_subscriptions where user_id = '${A}' returning id`));
check('push: B kan het apparaat van A niet verwijderen', bDel.rows.length === 0);
const bSteal2 = await as('authenticated', B, () => tryRun(() => db.exec(`update public.push_subscriptions set user_id = '${A}' where user_id = '${B}'`)));
check('push: B kan een eigen apparaat niet aan A toewijzen', !bSteal2.ok, 'het lukte');
const anonSub = await as('anon', null, () => tryRun(() => db.query('select * from public.push_subscriptions')));
check('push: anon kan niet lezen', !anonSub.ok || anonSub.value.rows.length === 0, JSON.stringify(anonSub));
const anonSubWrite = await as('anon', null, () => tryRun(() => db.exec(sub(A, 'https://push.example.org/anon'))));
check('push: anon kan niet schrijven', !anonSubWrite.ok, 'het lukte');

const dup = await as('authenticated', A, () => tryRun(() => db.exec(sub(A, 'https://push.example.org/a1'))));
check('push: hetzelfde endpoint twee keer bij dezelfde gebruiker botst', !dup.ok);
const upsert = await as('authenticated', A, () => tryRun(() => db.exec(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, remind_time) values ('${A}', 'https://push.example.org/a1', 'P2', 'A2', '09:15') on conflict (user_id, endpoint) do update set remind_time = excluded.remind_time, p256dh = excluded.p256dh`)));
const upserted = await as('authenticated', A, () => db.query(`select remind_time, p256dh from public.push_subscriptions where endpoint like '%/a1'`));
check('push: upsert op (user_id, endpoint) werkt', upsert.ok && upserted.rows[0].remind_time === '09:15' && upserted.rows[0].p256dh === 'P2', upsert.error);
const sameEndpointB = await as('authenticated', B, () => tryRun(() => db.exec(sub(B, 'https://push.example.org/a1'))));
check('push: een ander account mag hetzelfde endpoint hebben (gedeeld toestel) zonder het eerste te raken', sameEndpointB.ok, sameEndpointB.error);
await as('authenticated', B, () => db.exec(`delete from public.push_subscriptions where endpoint like '%/a1'`));
const aKept = await as('authenticated', A, () => db.query(`select id from public.push_subscriptions where endpoint like '%/a1'`));
check('push: en het apparaat van A is daarbij onaangetast', aKept.rows.length === 1);

for (const [name, extra] of [
  ['geen https', { endpoint: 'http://push.example.org/x' }],
  ['tijdstip 8:00 (geen HH:MM)', { remind_time: '8:00' }],
  ['tijdstip 25:00', { remind_time: '25:00' }],
  ['te lange sleutel', { p256dh: 'x'.repeat(300) }],
  ['lege tijdzone', { timezone: '' }],
]) {
  const bad = await as('authenticated', A, () => tryRun(() => db.exec(sub(A, extra.endpoint ?? `https://push.example.org/bad-${name.length}`, extra))));
  check(`push: ${name} wordt geweigerd`, !bad.ok, 'het lukte');
}
const bigSummary = await as('authenticated', A, () => tryRun(() => db.exec(`update public.push_subscriptions set summary = jsonb_build_object('t', repeat('x', 5000)) where user_id = '${A}'`)));
check('push: een samenvatting groter dan 4000 tekens wordt geweigerd', !bigSummary.ok);
const arrSummary = await as('authenticated', A, () => tryRun(() => db.exec(`update public.push_subscriptions set summary = '[1]'::jsonb where user_id = '${A}'`)));
check('push: de samenvatting moet een JSON-object zijn', !arrSummary.ok);

const stamp = await as('authenticated', A, () => db.query(`select updated_at from public.push_subscriptions where endpoint like '%/a1'`));
await new Promise((r) => setTimeout(r, 20));
await as('authenticated', A, () => db.exec(`update public.push_subscriptions set remind_time = '10:00' where endpoint like '%/a1'`));
const stamp2 = await as('authenticated', A, () => db.query(`select updated_at from public.push_subscriptions where endpoint like '%/a1'`));
check('push: updated_at wordt door de server bijgehouden', new Date(stamp2.rows[0].updated_at) > new Date(stamp.rows[0].updated_at));

await as('authenticated', A, async () => { for (let i = 0; i < 9; i++) await db.exec(sub(A, `https://push.example.org/many-${i}`)); });
const tooMany = await as('authenticated', A, () => tryRun(() => db.exec(sub(A, 'https://push.example.org/many-extra'))));
check('push: hoogstens 10 apparaten per gebruiker', !tooMany.ok, 'het 11e apparaat werd geaccepteerd');

// account verwijderen: wist ook alle records van die gebruiker
await as('authenticated', B, () => db.query('select public.delete_my_account()'));
const left = await db.query('select user_id from public.records');
check('delete_my_account wist de gebruiker en zijn records, niet die van A', left.rows.every((r) => r.user_id === A) && left.rows.length >= 2);
const usersLeft = await db.query('select id from auth.users');
check('alleen B is uit auth.users verdwenen', usersLeft.rows.length === 1 && usersLeft.rows[0].id === A);
const pushLeft = await db.query('select user_id from public.push_subscriptions');
check('delete_my_account wist ook de apparaten van B (cascade), niet die van A', pushLeft.rows.length > 0 && pushLeft.rows.every((r) => r.user_id === A));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
