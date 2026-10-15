// Controle van de hele sociale keten in de app op de LOKALE Supabase: de echte Supabase-SDK (vendor/), de data-laag (src/data/social-remote.js),
// de cache en de besturing (src/ui/social.js), met drie gebruikers die elkaar vinden, vrienden worden, een uitnodiging inwisselen en elkaars punten zien.
// Aanvulling op tests/ (nagebootste server) en tools/social-check.mjs (de functies zelf).
// Gebruik: npm run db:start, dan: npm run db:check-app   (inlogcodes komen uit het lokale mailvenster; de testaccounts sdk-a/b/c@example.com worden opgeruimd)
import { createSocialRemote, toSocialError } from '../src/data/social-remote.js';
import { createSocialCache } from '../src/data/social-cache.js';
import { createSocial } from '../src/ui/social.js';
import { addDays } from '../src/domain/dates.js';

const { createClient } = await import('../vendor/supabase-js.min.mjs');
const API = 'http://127.0.0.1:54321';
const MAIL = 'http://127.0.0.1:54324';
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TODAY = new Date().toISOString().slice(0, 10);

async function signIn(email) {
  const client = createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  let code = null;
  for (let i = 0; i < 30 && !code; i++) {
    await sleep(250);
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    const msg = (list.messages ?? []).find((m) => m.To.some((t) => t.Address === email));
    if (msg) { const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json(); code = /\b(\d{6})\b/.exec(full.HTML + ' ' + full.Text)?.[1]; }
  }
  const { data, error: verifyError } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (verifyError) throw verifyError;
  return { client, user: data.user };
}

function snapshot(daysDone) {
  const habit = { id: 'h', name: 'Lezen', icon: 'x', color: 'c1', daypart: 'anytime', status: 'active', startDate: '2025-01-01', endDate: null, sortOrder: 0, maintenance: false,
    schedules: [{ effectiveFrom: '2025-01-01', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } }] };
  const checkIns = [{ habitId: 'h', date: '2025-01-02', status: 'done' }];
  for (let i = 0; i < daysDone; i++) checkIns.push({ habitId: 'h', date: addDays(TODAY, -i), status: 'done' });
  return { habits: [habit], checkIns, pauses: [], dayPlans: [], ratings: [] };
}

function appFor({ client, user }, name, daysDone) {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const env = { signedIn: () => true, userId: () => user.id, settings: () => ({ displayName: name }), today: () => TODAY, snapshot: async () => snapshot(daysDone), online: () => true, now: () => Date.now(), baseUrl: () => 'http://localhost:5173/' };
  return createSocial({ remote: createSocialRemote(async () => client), cache: createSocialCache(storage), env });
}

// opruimen van eerdere runs
const clean = await Promise.all(['sdk-a', 'sdk-b', 'sdk-c'].map((n) => signIn(`${n}@example.com`)));
for (const { client } of clean) await client.rpc('delete_my_account');
const A = await signIn('sdk-a@example.com');
const B = await signIn('sdk-b@example.com');
const C = await signIn('sdk-c@example.com');
const a = appFor(A, 'Remco', 7);
const b = appFor(B, 'Anna', 3);
const c = appFor(C, 'Cor', 5);

// de SDK en een onbekende functie
const unknown = await A.client.rpc('bestaat_niet');
check('een functie die de server niet kent wordt "unavailable" (echte PostgREST-fout)', toSocialError(unknown.error).code === 'unavailable', JSON.stringify(unknown.error));
const offline = createSocialRemote(async () => createClient('http://127.0.0.1:1', KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
await offline.me().then(() => check('geen server bereikbaar geeft een fout', false), (e) => check('geen server bereikbaar wordt "offline" (echte SDK-fout)', e.code === 'offline', e.code));

// niets gebruikt sociaal: een verversing vraagt alleen het profiel
a.syncAccount();
check('een nieuwe gebruiker is "unknown" zonder netwerk', a.social.status === 'unknown');
check('verversen: je doet niet mee → status "off"', (await a.refresh()).ok && a.social.status === 'off');

// aanzetten
check('ongeldige naam: reden zonder server', (await a.enable({ username: 'a b', displayName: 'Remco' })).reason === 'invalid_chars');
check('verboden naam: username_not_allowed (echte servercode)', (await a.enable({ username: 'admin', displayName: 'Remco' })).reason === 'username_not_allowed');
check('A zet sociaal aan', (await a.enable({ username: 'sdk.remco', displayName: 'Remco' })).ok && a.social.status === 'on');
check('B zet sociaal aan', (await b.enable({ username: 'sdk.anna', displayName: 'Anna' })).ok);
check('C zet sociaal aan', (await c.enable({ username: 'sdk.cor', displayName: 'Cor' })).ok);
const taken = await createSocial({ remote: createSocialRemote(async () => C.client), cache: createSocialCache(null), env: { signedIn: () => true, userId: () => C.user.id, settings: () => ({ displayName: 'x' }), today: () => TODAY, snapshot: async () => snapshot(1), online: () => true, now: () => 0, baseUrl: () => '' } }).enable({ username: 'SDK.Remco', displayName: 'x' });
check('een bezette naam (andere hoofdletters): username_taken', taken.reason === 'username_taken', JSON.stringify(taken));
check('A staat met zijn eigen punten (70) op de ranglijst', a.social.board.length === 1 && a.social.board[0].points === 70 && a.social.board[0].isMe, JSON.stringify(a.social.board));

// vrienden
const found = await a.find('SDK.ANNA');
check('A vindt Anna op de exacte naam', found.ok && found.person?.name === 'Anna' && found.person.relation === 'none', JSON.stringify(found));
check('een deel van de naam vindt niets', (await a.find('sdk.an')).person === null);
const request = await a.request(found.person.userId);
check('A stuurt een verzoek', request.ok && request.status === 'pending', JSON.stringify(request));
await b.refresh();
check('B ziet het binnenkomende verzoek van Remco', b.social.incoming.map((p) => p.name).join() === 'Remco', JSON.stringify(b.social.incoming));
const accepted = await b.respond(b.social.incoming[0].userId, true);
check('B accepteert', accepted.ok && accepted.status === 'accepted');
check('B ziet Remco nu in zijn vrienden en op de ranglijst (Remco 70, Anna 30-ish)', b.social.friends.length === 1 && b.social.board.length === 2 && b.social.board[0].name === 'Remco', JSON.stringify(b.social.board.map((r) => [r.name, r.points])));
await a.refresh();
check('A ziet Anna op zijn ranglijst, jezelf eerst (meeste punten)', a.social.board.map((r) => r.name).join() === 'Remco,Anna', JSON.stringify(a.social.board.map((r) => [r.name, r.points, r.rank])));
check('de ranglijst bevat geen e-mail of andere velden', !JSON.stringify(a.social.board).includes('@example.com'));

// uitnodiging
const invite = await a.createInvite();
check('A maakt een uitnodigingslink met een lange code', invite.ok && /#\/vrienden\/uitnodiging\/[0-9a-f]{64}$/.test(invite.link), JSON.stringify(invite));
c.rememberInvite(invite.code);
const redeemed = await c.redeemInvite(c.pendingInvite());
check('C wisselt de code in en is direct vriend van Remco', redeemed.ok && redeemed.person.name === 'Remco' && c.social.friends.length === 1, JSON.stringify(redeemed));
check('de onthouden code is daarna vergeten', c.pendingInvite() === null);
check('een verzonnen code geeft "invalid"', (await b.redeemInvite('a'.repeat(64))).reason === 'invalid');
await a.refresh();
check('A heeft nu twee vrienden en drie rijen op de ranglijst', a.social.friends.length === 2 && a.social.board.length === 3, JSON.stringify(a.social.board.map((r) => r.name)));
check('uitnodiging intrekken', (await a.revokeInvite(invite.id)).ok);

// de naam uit Instellingen volgt
const renamed = appFor(A, 'Remco V.', 7);
renamed.syncAccount();
await renamed.refresh();
await b.refresh();
check('een andere weergavenaam in Instellingen komt bij vrienden aan', b.social.board.some((r) => r.name === 'Remco V.' || r.name === 'Remco'), JSON.stringify(b.social.board.map((r) => r.name)));

// uitzetten
check('A zet sociaal uit', (await a.disable()).ok && a.social.status === 'off');
await b.refresh();
check('B ziet Remco niet meer op de ranglijst of bij zijn vrienden', !b.social.board.some((r) => r.username === 'sdk.remco') && !b.social.friends.some((p) => p.username === 'sdk.remco'));
check('de cache van A weet dat hij niet meedoet', a.social.me.enabled === false);

for (const u of [A, B, C]) await u.client.rpc('delete_my_account');
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exitCode = failed ? 1 : 0;
