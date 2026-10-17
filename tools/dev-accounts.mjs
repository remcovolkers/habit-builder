// Testaccounts voor de LOKALE Supabase: stub@example.com (gevuld, één habit voor elke toestand, mét vrienden), leeg@example.com (leeg) en
// beheer@example.com (beheerder: ziet het tabje Feedback, met een paar testberichten).
// Alleen lokaal: de adressen staan vast op 127.0.0.1, dit raakt nooit productie. Zie docs/DEV-OMGEVING.md.
//
//   npm run dev:seed            alle accounts (opnieuw) aanmaken; het gevulde account krijgt verse datums
//   npm run dev:admin           alleen het beheerdersaccount (opnieuw) aanmaken, met testberichten; raakt de andere accounts niet aan
//   npm run dev:code -- stub    een nieuwe inlogcode voor stub@example.com tonen (of: leeg, beheer, anna, bram, cor, dora, eef, fien)
//
// Inloggen in de app gaat met een code per e-mail; die komt in het lokale mailvenster (http://localhost:54324) en dit script haalt hem daar voor je weg.
import { spawnSync } from 'node:child_process';
import { createMemoryStore } from '../src/data/memory-store.js';
import { createRepository } from '../src/data/repository.js';
import { createSupabaseRemote } from '../src/data/supabase-remote.js';
import { createSyncEngine } from '../src/data/sync.js';
import { todayFor } from '../src/domain/dates.js';
import { ADMIN_EMAIL, EMPTY_EMAIL, STUB_EMAIL, fillStubAccount } from './lib/stub-data.mjs';

const { createClient } = await import('../vendor/supabase-js.min.mjs');
const API = 'http://127.0.0.1:54321';
const MAIL = 'http://127.0.0.1:54324';
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'; // de publieke standaardsleutel van de lokale stack (zie src/config.js)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// De vrienden van het stub-account: elk een eigen account (blijft bestaan tussen twee seeds; alleen de vriendschappen met de stub worden steeds nieuw).
// daysAgo = wanneer deze vriend voor het laatst iets afvinkte: na 3 dagen niets staat een vriend niet meer op de ranglijst (docs/SOCIAAL.md §4.4).
const FRIENDS = [
  { key: 'anna', email: 'vriend-anna@example.com', username: 'anna.stub', name: 'Anna', points: 340, done: 34, streak: 12, habits: 4, daysAgo: 0, relation: 'friend', note: 'vriend, vooraan op de ranglijst' },
  { key: 'bram', email: 'vriend-bram@example.com', username: 'bram.stub', name: 'Bram', points: 180, done: 18, streak: 3, habits: 3, daysAgo: 1, relation: 'friend', note: 'vriend, onder de stub' },
  { key: 'cor', email: 'vriend-cor@example.com', username: 'cor.stub', name: 'Cor', points: 95, done: 9, streak: 1, habits: 2, daysAgo: 2, relation: 'friend', note: 'vriend, laatste op de ranglijst' },
  { key: 'fien', email: 'vriend-fien@example.com', username: 'fien.stub', name: 'Fien', points: 120, done: 12, streak: 0, habits: 2, daysAgo: 10, relation: 'friend', note: 'vriend die 10 dagen niets deed: NIET op de ranglijst, wel in de vriendenlijst' },
  { key: 'dora', email: 'vriend-dora@example.com', username: 'dora.stub', name: 'Dora', points: 60, done: 6, streak: 1, habits: 1, daysAgo: 0, relation: 'incoming', note: 'heeft de stub een vriendschapsverzoek gestuurd (accepteren of weigeren)' },
  { key: 'eef', email: 'vriend-eef@example.com', username: 'eef.stub', name: 'Eef', points: 210, done: 21, streak: 5, habits: 3, daysAgo: 0, relation: 'outgoing', note: 'de stub heeft haar een verzoek gestuurd (staat open, intrekken kan)' },
];
const ACCOUNTS = { stub: STUB_EMAIL, leeg: EMPTY_EMAIL, beheer: ADMIN_EMAIL, ...Object.fromEntries(FRIENDS.map((f) => [f.key, f.email])) };

const newClient = () => createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

async function requireLocalStack() {
  for (const [name, url] of [['de lokale database', `${API}/auth/v1/health`], ['het lokale mailvenster', `${MAIL}/api/v1/messages`]]) {
    try {
      await fetch(url);
    } catch {
      console.error(`Geen verbinding met ${name} (${url}). Start hem eerst met: npm run db:start (en Docker Desktop moet draaien).`);
      process.exit(1);
    }
  }
}

/** Vraagt een code aan en leest hem uit het mailvenster. */
async function requestCode(client, email) {
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error(`code aanvragen voor ${email} mislukt: ${error.message}`);
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    const message = (list.messages ?? []).find((m) => m.To.some((to) => to.Address === email));
    if (message) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${message.ID}`)).json();
      const code = /\b(\d{6})\b/.exec(`${full.HTML} ${full.Text}`)?.[1];
      if (code) return code;
    }
  }
  throw new Error(`geen code ontvangen voor ${email} (staat het mailvenster aan?)`);
}

async function signIn(email) {
  const client = newClient();
  const token = await requestCode(client, email);
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(`inloggen als ${email} mislukt: ${error.message}`);
  return { client, user: data.user };
}

/** Het account weggooien (met alle gegevens) en opnieuw aanmaken: zo begint het altijd schoon. */
async function freshAccount(email) {
  const first = await signIn(email);
  const { error } = await first.client.rpc('delete_my_account');
  if (error) throw new Error(`opruimen van ${email} mislukt: ${error.message}`);
  await sleep(1100); // de lokale stack laat hooguit één mail per seconde toe
  return signIn(email);
}

/** Een rpc-aanroep die bij een fout gooit (met de naam van de functie erbij). */
async function must(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} mislukt: ${error.message}`);
  return data;
}

/** Zet sociaal aan voor de stub, maakt de vrienden (en hun verzoeken) aan en een uitnodigingslink. Geeft de link terug. */
async function seedFriends(stub, today) {
  await must(stub.client, 'social_enable', { p_username: 'stub', p_display_name: 'Remco (stub)' });
  const day = (n) => new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

  for (const friend of FRIENDS) {
    await sleep(1100); // de lokale stack laat hooguit één mail per seconde toe
    const account = await signIn(friend.email); // bestaat al na de eerste keer; de vriendschap met de (nieuwe) stub maken we hieronder opnieuw
    await must(account.client, 'social_enable', { p_username: friend.username, p_display_name: friend.name });
    await must(account.client, 'publish_summary', {
      p_as_of: today, p_points: friend.points, p_done: friend.done, p_streak: friend.streak, p_active_habits: friend.habits, p_last_active: day(friend.daysAgo),
    });
    if (friend.relation === 'friend') {
      await must(stub.client, 'friend_request', { p_user: account.user.id });
      await must(account.client, 'friend_respond', { p_user: stub.user.id, p_accept: true });
    } else if (friend.relation === 'incoming') {
      await must(account.client, 'friend_request', { p_user: stub.user.id });
    } else {
      await must(stub.client, 'friend_request', { p_user: account.user.id });
    }
    await account.client.auth.signOut();
  }

  const invite = await must(stub.client, 'invite_create');
  return `http://localhost:5173/#/vrienden/uitnodiging/${invite.code}`;
}

// De lokale database draait in Docker; de naam van de container volgt uit project_id in supabase/config.toml.
const DB_CONTAINER = 'supabase_db_habit-builder';

/** Een SQL-opdracht in de lokale database (voor wat de app bewust niet kan, zoals iemand beheerder maken). Gooit met de uitvoer als het niet lukt. */
function sql(statement) {
  const result = spawnSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-c', statement], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`SQL in ${DB_CONTAINER} mislukt: ${result.error?.message ?? result.stderr}`.trim());
}

// Testberichten voor het tabje Feedback. app_version 'test' maakt ze herkenbaar, en maakt dat een tweede seed ze vervangt in plaats van aan te vullen.
const FEEDBACK_SEED = [
  { from: 'anoniem', kind: 'idea', route: '#/today', body: 'Een donker thema graag, en misschien ook een wekelijkse samenvatting per mail.' },
  { from: 'leeg', kind: 'problem', route: '#/habits/new', body: 'Het scherm hapert als ik snel afvink op mijn telefoon. Dit gebeurt vooral bij de teller.' },
  { from: 'anoniem', kind: 'question', route: '#/habits', body: 'Hoe verwijder ik een habit helemaal?' },
  { from: 'anoniem', kind: 'compliment', route: '#/welkom/3', body: 'Mooie app, de introductie was heel duidelijk!', done: true },
];

/**
 * Het beheerdersaccount: opnieuw aanmaken, beheerder maken (app_admins, alleen via SQL) en een paar testberichten sturen, waarvan er een is afgehandeld.
 * Een bericht met een mailadres komt van leeg@example.com (ingelogd, met het vinkje "mag me mailen"); de rest is anoniem.
 */
async function seedAdmin() {
  const admin = await freshAccount(ADMIN_EMAIL);
  try {
    sql(`insert into public.app_admins (user_id) values ('${admin.user.id}') on conflict do nothing;`);
    sql(`delete from public.feedback where app_version = 'test';`);
  } catch (error) {
    console.error(`
✖ ${ADMIN_EMAIL} is aangemaakt, maar niet beheerder geworden: ${error.message}
  Staat Docker aan en heeft de lokale database migratie 0007 (npm run db:reset)? Handmatig: insert into public.app_admins (user_id) select id from auth.users where email = '${ADMIN_EMAIL}';`);
    process.exit(1);
  }
  const sender = FEEDBACK_SEED.some((m) => m.from === 'leeg') ? (await sleep(1100), await signIn(EMPTY_EMAIL)) : null;
  const anonymous = newClient();
  for (const message of FEEDBACK_SEED) {
    const client = message.from === 'leeg' ? sender.client : anonymous;
    await must(client, 'feedback_send', { p_kind: message.kind, p_body: message.body, p_route: message.route, p_version: 'test', p_contact: message.from === 'leeg' });
  }
  const list = await must(admin.client, 'feedback_list');
  for (const row of list) {
    if (row.app_version === 'test' && FEEDBACK_SEED.find((m) => m.body === row.body)?.done) await must(admin.client, 'feedback_set_status', { p_id: row.id, p_status: 'done' });
  }
  await sender?.client.auth.signOut();
  await admin.client.auth.signOut();
  console.log(`✔ ${ADMIN_EMAIL}: beheerder, met ${FEEDBACK_SEED.length} testberichten in het tabje Feedback (waarvan 1 afgehandeld)`);
}

async function seed() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
  const today = todayFor(new Date(), timezone, 4);

  const empty = await freshAccount(EMPTY_EMAIL);
  console.log(`✔ ${EMPTY_EMAIL}: leeg account aangemaakt`);

  const stub = await freshAccount(STUB_EMAIL);
  const store = createMemoryStore();
  const repo = createRepository({ store, timezone: () => timezone });
  const created = await fillStubAccount(repo, today);
  const synced = await createSyncEngine({ store, remote: createSupabaseRemote({ client: stub.client, userId: stub.user.id }) }).request();
  if (synced.dropped > 0) {
    console.error(`
✖ ${synced.dropped} records zijn door de server geweigerd. Staat je lokale database op de nieuwste migraties? Draai: npm run db:reset  (en daarna opnieuw npm run dev:seed)`);
    process.exit(1);
  }
  const inviteLink = await seedFriends(stub, today);
  const { count } = await stub.client.from('records').select('id', { count: 'exact', head: true });
  console.log(`✔ ${STUB_EMAIL}: ${created.length} habits gemaakt, ${count} records op de server (vandaag is ${today})\n`);
  for (const { name, expect } of created) console.log(`   • ${name.padEnd(18)} ${expect}`);
  console.log('\nVrienden van de stub (sociaal staat aan, gebruikersnaam @stub):');
  for (const f of FRIENDS) console.log(`   • ${f.name.padEnd(8)} @${f.username.padEnd(10)} ${f.note}`);
  console.log(`\nUitnodigingslink van de stub (open hem uitgelogd, bijvoorbeeld met het lege account, om de flow voor een nieuwe gebruiker te proberen):\n   ${inviteLink}`);

  await empty.client.auth.signOut();
  await stub.client.auth.signOut();
  await seedAdmin();
  console.log(`
Inloggen: open http://localhost:5173/ (npm run serve) → Instellingen → Inloggen, vul het e-mailadres in en gebruik de code.
  npm run dev:code -- stub     toont de code voor ${STUB_EMAIL}
  npm run dev:code -- leeg     toont de code voor ${EMPTY_EMAIL}
  npm run dev:code -- beheer   toont de code voor ${ADMIN_EMAIL} (beheerder: het tabje Feedback verschijnt in de zijbalk, op de computer)
  npm run dev:code -- anna     idem voor een vriend (anna, bram, cor, fien, dora of eef)
Gebruik per account een eigen browserprofiel of privévenster: de app bewaart zijn gegevens ook in de browser.
Let op: de accounts zijn zojuist opnieuw aangemaakt. Een browser die al als stub of leeg was ingelogd, moet opnieuw inloggen (de app doet dat bij het openen vanzelf, een open tab pas na vernieuwen).`);
}

async function code(which) {
  const email = ACCOUNTS[which];
  if (!email) {
    console.error(`Kies een account: ${Object.keys(ACCOUNTS).join(' of ')}  (bijvoorbeeld: npm run dev:code -- stub)`);
    process.exit(1);
  }
  const token = await requestCode(newClient(), email);
  console.log(`Code voor ${email}: ${token}`);
}

const [command, argument] = process.argv.slice(2);
await requireLocalStack();
if (command === 'seed') await seed();
else if (command === 'admin') {
  await seedAdmin();
  console.log(`
Inloggen als beheerder: npm run dev:code -- beheer, open http://localhost:5173/ op de computer, log in met ${ADMIN_EMAIL} en de code. In de zijbalk staat het tabje Feedback.`);
}
else if (command === 'code') await code(argument);
else {
  console.error('Gebruik: npm run dev:seed   of   npm run dev:admin   of   npm run dev:code -- stub|leeg|beheer');
  process.exit(1);
}
