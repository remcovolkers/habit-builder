// Testaccounts voor de LOKALE Supabase: stub@example.com (gevuld, één habit voor elke toestand) en leeg@example.com (leeg).
// Alleen lokaal: de adressen staan vast op 127.0.0.1, dit raakt nooit productie. Zie docs/DEV-OMGEVING.md.
//
//   npm run dev:seed            beide accounts (opnieuw) aanmaken; het gevulde account krijgt verse datums
//   npm run dev:code -- stub    een nieuwe inlogcode voor stub@example.com tonen (of: leeg)
//
// Inloggen in de app gaat met een code per e-mail; die komt in het lokale mailvenster (http://localhost:54324) en dit script haalt hem daar voor je weg.
import { createMemoryStore } from '../src/data/memory-store.js';
import { createRepository } from '../src/data/repository.js';
import { createSupabaseRemote } from '../src/data/supabase-remote.js';
import { createSyncEngine } from '../src/data/sync.js';
import { todayFor } from '../src/domain/dates.js';
import { EMPTY_EMAIL, STUB_EMAIL, fillStubAccount } from './lib/stub-data.mjs';

const { createClient } = await import('../vendor/supabase-js.min.mjs');
const API = 'http://127.0.0.1:54321';
const MAIL = 'http://127.0.0.1:54324';
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'; // de publieke standaardsleutel van de lokale stack (zie src/config.js)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ACCOUNTS = { stub: STUB_EMAIL, leeg: EMPTY_EMAIL };

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
  const { count } = await stub.client.from('records').select('id', { count: 'exact', head: true });
  console.log(`✔ ${STUB_EMAIL}: ${created.length} habits gemaakt, ${count} records op de server (vandaag is ${today})\n`);
  for (const { name, expect } of created) console.log(`   • ${name.padEnd(18)} ${expect}`);

  await empty.client.auth.signOut();
  await stub.client.auth.signOut();
  console.log(`
Inloggen: open http://localhost:5173/ (npm run serve) → Instellingen → Inloggen, vul het e-mailadres in en gebruik de code.
  npm run dev:code -- stub     toont de code voor ${STUB_EMAIL}
  npm run dev:code -- leeg     toont de code voor ${EMPTY_EMAIL}
Gebruik per account een eigen browserprofiel of privévenster: de app bewaart zijn gegevens ook in de browser.`);
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
else if (command === 'code') await code(argument);
else {
  console.error('Gebruik: npm run dev:seed   of   npm run dev:code -- stub|leeg');
  process.exit(1);
}
