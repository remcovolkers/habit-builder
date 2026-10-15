// Draaien (PGlite zit bewust niet in het project): maak een lege map, 
pm i @electric-sql/pglite, kopieer dit bestand erheen en pas het pad naar de migratie aan,
// of draai het via 
ode --import vanuit een map waar @electric-sql/pglite te vinden is.
// Valideert supabase/migrations/0001_init.sql in een echte Postgres (PGlite), met een nagebootst Supabase-auth-schema,
// en toetst de Row Level Security: gebruiker A mag nooit data van B zien of wijzigen, anon niets.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url)), 'utf8');
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

// account verwijderen: wist ook alle records van die gebruiker
await as('authenticated', B, () => db.query('select public.delete_my_account()'));
const left = await db.query('select user_id from public.records');
check('delete_my_account wist de gebruiker en zijn records, niet die van A', left.rows.every((r) => r.user_id === A) && left.rows.length >= 2);
const usersLeft = await db.query('select id from auth.users');
check('alleen B is uit auth.users verdwenen', usersLeft.rows.length === 1 && usersLeft.rows[0].id === A);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
