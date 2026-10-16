// De sociale schermen in een echte browser (headless Edge of Chrome, op Windows en Linux) tegen de LOKALE Supabase, met de echte app en echte inlogcodes
// (uit het lokale mailvenster): niet ingelogd, uitnodiging, aanmelden, ranglijst, vrienden zoeken en toevoegen, verzoeken, beheren, thema's,
// desktop, grote tekst op 320px, offline en uitzetten. Controleert onderweg overflow, afgeknipte tekst en tikvlakken van 44px.
// Gebruik: npm run db:start, dan: npm run db:check-browser [map voor schermafbeeldingen]. Een andere browser: zet BROWSER op het pad.
// Maakt en ruimt de testaccounts ui-me, ui-anna, ui-bram, ui-cor en ui-dora (@example.com) op.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? join(tmpdir(), 'hb-social-shots');
mkdirSync(OUT, { recursive: true });
const BROWSER = [
  process.env.BROWSER,
  process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env.ProgramFiles && `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
].find((p) => p && existsSync(p));
if (!BROWSER) throw new Error('Geen Edge of Chrome gevonden (zet BROWSER op het pad van de browser)');
const API = 'http://127.0.0.1:54321';
const MAIL = 'http://127.0.0.1:54324';
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5174' }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'hb-edge-'));
const edge = spawn(BROWSER, ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []), '--remote-debugging-port=9337', `--user-data-dir=${profile}`, '--no-first-run', '--unsafely-treat-insecure-origin-as-secure=http://localhost:5174', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
edge.stderr.on('data', (chunk) => { browserLog = (browserLog + chunk).slice(-1500); });
let browserExit = null;
edge.on('exit', (code, signal) => { browserExit = `${code ?? signal}`; });

const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
  // op GitHub Actions: een annotatie, zodat de reden ook zonder het volledige logboek te lezen is
  if (!ok && process.env.GITHUB_ACTIONS) console.log(`::error title=Browsercontrole mislukt::${name} -> ${String(detail).replace(/[\r\n%]+/g, ' ').slice(0, 600)}`);
};

// ---- de server kant: andere gebruikers via de API ----------------------------------------------------------------------------------
async function mailCode(email) {
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    const msg = (list.messages ?? []).find((m) => m.To.some((t) => t.Address === email));
    if (msg) { const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json(); return /\b(\d{6})\b/.exec(full.HTML + ' ' + full.Text)?.[1]; }
  }
  throw new Error(`geen code voor ${email}`);
}
async function apiLogin(email) {
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  const r = await fetch(`${API}/auth/v1/otp`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: J({ email, create_user: true }) });
  if (!r.ok) throw new Error(`otp ${r.status}`);
  const token = await mailCode(email);
  const v = await (await fetch(`${API}/auth/v1/verify`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: J({ type: 'email', email, token }) })).json();
  return { token: v.access_token, id: v.user.id };
}
async function rpc(user, fn, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: J(args) });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}
const today = new Date().toISOString().slice(0, 10);
const publish = (user, points) => rpc(user, 'publish_summary', { p_as_of: today, p_points: points, p_done: Math.round(points / 10), p_streak: 3, p_active_habits: 4, p_last_active: today });

async function main() {
  // schone start voor de testaccounts
  const people = {};
  for (const name of ['ui-me', 'ui-anna', 'ui-bram', 'ui-cor', 'ui-dora']) {
    const u = await apiLogin(`${name}@example.com`);
    await rpc(u, 'delete_my_account');
  }
  for (const [name, username, display] of [['ui-anna', 'anna', 'Anna'], ['ui-bram', 'bram', 'Bram'], ['ui-cor', 'cor', 'Cor'], ['ui-dora', 'dora', 'Dora']]) {
    people[name] = await apiLogin(`${name}@example.com`);
    await rpc(people[name], 'social_enable', { p_username: username, p_display_name: display });
    await publish(people[name], { 'ui-anna': 150, 'ui-bram': 90, 'ui-cor': 200, 'ui-dora': 40 }[name]);
  }
  const { 'ui-anna': anna, 'ui-bram': bram, 'ui-cor': cor, 'ui-dora': dora } = people;
  const invite = await rpc(cor, 'invite_create');

  // ---- de browser ---------------------------------------------------------------------------------------------------------------
  // de browser krijgt ruim de tijd om op te starten (een trage CI-machine heeft er soms meer dan 10 seconden voor nodig)
  let page = null;
  for (let i = 0; i < 160 && !page && browserExit === null; i++) {
    try { page = (await (await fetch('http://127.0.0.1:9337/json/list')).json()).find((target) => target.type === 'page') ?? null; } catch { /* nog niet bereikbaar */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error(`de browser kwam niet op (${BROWSER}; ${browserExit === null ? 'geen antwoord na 40 s' : `gestopt met ${browserExit}`}): ${browserLog.replace(/\s+/g, ' ').slice(-400)}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') problems.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) problems.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !String(msg.params.entry.url).includes('favicon') && !(msg.params.entry.text.includes('status of 400') && String(msg.params.entry.url ?? '').includes('/rpc/social_enable'))) problems.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
  };
  const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(J({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const viewport = (width, height, mobile = true) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
  await viewport(390, 844);

  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.result.value;
  };
  const waitFor = async (expr, label, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(`Boolean(${expr})`)) return true; await sleep(100); }
    throw new Error(`timeout: ${label}`);
  };
  const closeDialogs = () => ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  const goto = async (hash) => { await ev(`location.hash = ${J(hash)}`); await sleep(350); };
  const shot = async (name) => { if (!name.includes('remove')) await closeDialogs(); await sleep(150); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `social-${name}.png`), Buffer.from(r.result.data, 'base64')); };
  const setValue = (sel, v) => ev(`(() => { const e = document.querySelector(${J(sel)}); e.focus(); e.value = ${J(v)}; e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  const click = (sel) => ev(`document.querySelector(${J(sel)}).click()`);
  const count = (sel) => ev(`document.querySelectorAll(${J(sel)}).length`);
  const text = (sel) => ev(`document.querySelector(${J(sel)})?.innerText ?? null`);
  const appText = () => ev(`document.getElementById('app').innerText`);
  const social = () => ev(`import('/src/ui/social-app.js').then((m) => ({ status: m.social.status, friends: m.social.friends.length, incoming: m.social.incoming.length, board: m.social.board.map((r) => [r.name, r.points, r.rank]) }))`);
  const overflow = async (where) => {
    const w = await ev(`document.documentElement.scrollWidth - window.innerWidth`);
    check(`geen horizontale overflow: ${where}`, w <= 0, `${w}px te breed`);
    const junk = await ev(`(document.getElementById('app').innerText + ' ' + [...document.querySelectorAll('dialog')].map((d) => d.innerText).join(' ')).match(/\\b(null|undefined|NaN)\\b/g)`);
    check(`geen null/undefined/NaN: ${where}`, !junk, J(junk));
    const clipped = await ev(`[...document.querySelectorAll('#app *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && !e.matches('input, textarea, .deco, .deco *, .visually-hidden')).map((e) => (e.id || e.className || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth)`);
    const culprits = clipped.length ? await ev(`[...document.querySelectorAll('#app *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && !e.matches('input, textarea, .deco, .deco *, .visually-hidden')).flatMap((box) => [...box.querySelectorAll('*')].filter((c) => c.getBoundingClientRect().right > box.getBoundingClientRect().right + 1).map((c) => (c.id || c.className || c.tagName) + ' ' + c.tagName + ' w=' + Math.round(c.getBoundingClientRect().width) + ' ws=' + getComputedStyle(c).whiteSpace + ' disp=' + getComputedStyle(c).display))`) : [];
    check(`niets wordt afgeknipt: ${where}`, clipped.length === 0, J({ clipped, culprits }));
    const unnamed = await ev(`[...document.querySelectorAll('#app a[href], #app button, #app input, #app textarea, #app select, #app summary')].filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || e.closest('[hidden]') || e.matches('.visually-hidden')) return false;
      const label = e.id ? document.querySelector('label[for="' + CSS.escape(e.id) + '"]') : null;
      const name = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.innerText || (label && label.textContent) || (e.closest('label') && e.closest('label').innerText) || e.getAttribute('title') || '').trim();
      return name === '';
    }).map((e) => e.tagName + '#' + (e.id || e.className))`);
    check(`alles wat je kunt bedienen heeft een naam: ${where}`, unnamed.length === 0, J(unnamed));
    const h1s = await count('#app h1');
    check(`precies één hoofdkop: ${where}`, h1s === 1, String(h1s));
    // de dagcellen van het overzicht (7 kolommen) kunnen op 320px geen 44px breed zijn; ze zijn een kalender, geen losse knoppen
    const small = await ev(`[...document.querySelectorAll('#app a.button, #app button:not(.overview__cell), #app .tabbar a, #tabbar a, #app input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || (e.tagName !== 'INPUT' && r.width < 43.5)); }).map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
    check(`tikvlakken minstens 44px: ${where}`, small.length === 0, J(small));
  };
  const uiLogin = async (email) => {
    await goto('#/login');
    await waitFor(`document.querySelector('#email')`, 'inlogscherm');
    await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
    await setValue('#email', email);
    await click('#sendCode');
    await waitFor(`document.querySelector('#code')`, 'codeveld');
    await setValue('#code', await mailCode(email));
    await click('#verifyCode');
    await waitFor(`location.hash.length > 0 && !location.hash.includes('login')`, 'na inloggen', 15000);
    await waitFor(`import('/src/ui/account.js').then((m) => m.account.status === 'signed-in')`, 'ingelogd', 15000).catch(async () => {
      for (let i = 0; i < 50; i++) { if (await ev(`window.__signed === true`)) return; await sleep(100); }
    });
    await sleep(800);
  };

  await send('Page.navigate', { url: 'http://localhost:5174/#/stats' });
  await waitFor(`window.habitBuilder && document.querySelector('#app .stats, #app .page-title')`, 'start');

  // een paar habits met afgevinkte dagen, zodat er punten zijn: 3 dagelijkse habits, alle laatste 7 dagen gedaan = 210 + bonus + start
  await ev(`(async () => {
    const { addDays } = await import('/src/domain/dates.js');
    const { state } = window.habitBuilder; const t = state.today;
    const start = addDays(t, -30);
    const base = { icon: '📖', color: 'c3', daypart: 'anytime', status: 'active', startDate: start, endDate: null, cue: null, why: null, minimalVersion: null, graduationDays: 66, maintenance: false, sortOrder: 0, schedules: [{ effectiveFrom: start, schedule: { type: 'weekdays', weekdays: [0,1,2,3,4,5,6] } }] };
    for (const name of ['Lezen', 'Water', 'Wandelen']) {
      const habit = await state.repo.saveHabit({ ...base, name });
      for (let i = 0; i < 7; i++) await state.repo.setCheckIn({ habitId: habit.id, date: addDays(t, -i), status: 'done' });
    }
    (await import('/src/ui/state.js')).notifyChanged();
  })()`);
  await sleep(1500);
  await closeDialogs();

  // ---- 1. niet ingelogd -----------------------------------------------------------------------------------------------------------
  await goto('#/stats');
  await waitFor(`document.querySelector('#socialCard')`, 'kaart op Voortgang');
  check('anoniem: Voortgang toont de kaart met "log in om met vrienden mee te doen"', /Log in om met vrienden mee te doen/.test(await text('#socialCard')), await text('#socialCard'));
  check('anoniem: Voortgang noemt geen netwerkverkeer naar vrienden (status signed-out)', (await social()).status === 'signed-out');
  await goto('#/vrienden');
  await waitFor(`document.querySelector('#loginLink')`, 'inlogknop in vrienden');
  check('anoniem: #/vrienden legt uit dat je een account nodig hebt', /account/i.test(await appText()));
  await overflow('vrienden niet ingelogd');
  // ---- 1b. de flow voor een nieuwe gebruiker (docs/ITERATIE-1.2.md §2): welkom, account, één naamstap, "jullie zijn vrienden" ----------------
  await goto(`#/vrienden/uitnodiging/${invite.code}`);
  await waitFor(`document.querySelector('#inviteWelcome')`, 'welkomstscherm');
  check('welkom: de uitnodiging noemt de naam van wie uitnodigt, zonder account', /Cor nodigt je uit voor Habit Builder/i.test(await text('#inviteWelcome')), await text('#inviteWelcome'));
  check('welkom: één hoofdactie "Account maken" en een link voor wie al een account heeft', (await count('#loginLink')) === 1 && (await count('#haveAccountLink')) === 1);
  check('welkom: de code wordt onthouden en de uitnodiger ook (voor het inlogscherm)', (await ev(`localStorage.getItem('hb-social-invite')`)) === invite.code && (await ev(`localStorage.getItem('hb-social-inviter')`)) === 'Cor');
  check('welkom: zonder account is er geen "terug naar Vrienden"', (await count('.back-link')) === 0);
  await overflow('welkom');
  await shot('invite-welcome');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(300);
  await overflow('welkom bij 320px en 200% tekst');
  await ev(`document.documentElement.style.fontSize = ''`);
  await viewport(390, 844);
  await goto('#/vrienden/uitnodiging/onzin');
  check('een kapotte uitnodigingslink geeft een nette melding', /klopt niet/i.test(await appText()));
  await goto(`#/vrienden/uitnodiging/${'f'.repeat(64)}`);
  await waitFor(`document.querySelector('#inviteInvalid')`, 'verlopen of verzonnen link');
  check('een link die niet werkt: uitleg, en een account maken kan nog steeds', /werkt niet meer/i.test(await text('#inviteInvalid')) && (await count('#loginLink')) === 1, await appText());
  await ev(`localStorage.setItem('hb-social-invite', '${invite.code}'); localStorage.setItem('hb-social-inviter', 'Cor')`); // de verzonnen link heeft de echte uitnodiging vergeten: terugzetten

  // ---- 2. inloggen via het echte inlogscherm; de onthouden uitnodiging wordt daarna afgehandeld (één naamstap) ------------------------
  await ev(`import('/src/ui/account.js').then((m) => m.onAccountChanged(() => { if (m.account.status === 'signed-in') window.__signed = true; }))`);
  await goto('#/login');
  await waitFor(`document.querySelector('#loginInvite')`, 'uitnodiging op het inlogscherm');
  check('het inlogscherm herinnert aan de uitnodiging: "Je bent uitgenodigd door Cor"', /uitgenodigd door Cor/i.test(await text('#loginInvite')), await text('#loginInvite'));
  await uiLogin('ui-me@example.com');
  check('na inloggen met een onthouden uitnodiging stuurt de app naar die uitnodiging', (await ev(`location.hash`)).includes('/vrienden/uitnodiging/'), await ev(`location.hash`));
  await waitFor(`document.querySelector('#inviteNameTitle')`, 'naamstap voor de uitnodiging');
  check('de naamstap: één vraag "Hoe wil je heten?" die Cor noemt, en geen aparte naamdialoog van het account', /Hoe wil je heten/i.test(await text('#inviteNameTitle')) && /Cor/.test(await appText()) && (await count('dialog[open]')) === 0, await appText());
  check('de gebruikersnaam is verstopt achter "Wijzigen" zodra er een goede naam is voorgesteld', (await ev(`document.querySelector('#socialUsername').closest('.field').hidden`)) === true || (await ev(`document.querySelector('#socialName').value`)) === '');
  await overflow('naamstap');
  await shot('invite-name');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(300);
  await overflow('naamstap bij 320px en 200% tekst');
  await ev(`document.documentElement.style.fontSize = ''`);
  await viewport(390, 844);

  await click('#socialJoin');
  await sleep(200);
  check('zonder naam blijft het formulier staan met een melding', /Vul je naam in/.test(await text('#socialNameError')));
  await setValue('#socialName', 'Remco Test');
  check('de gebruikersnaam wordt voorgesteld uit de naam', (await ev(`document.querySelector('#socialUsername').value`)) === 'remco.test');
  await click('#changeUsername');
  await setValue('#socialUsername', 'a b');
  await click('#socialJoin');
  await sleep(200);
  check('een ongeldige gebruikersnaam geeft een melding bij het veld zonder naar de server te gaan', /Gebruik alleen kleine letters/.test(await text('#socialUserError')) && (await ev(`document.querySelector('#socialUsername').getAttribute('aria-invalid')`)) === 'true');
  await setValue('#socialUsername', 'anna');
  await click('#socialJoin');
  await waitFor(`!document.querySelector('#socialUserError').hidden && /bezet/.test(document.querySelector('#socialUserError').textContent)`, 'bezette naam');
  check('een bezette, zelf getypte gebruikersnaam geeft de reden (er wordt niet stilletjes een cijfer bijgezet)', true);
  await setValue('#socialUsername', 'remco.ui');
  await click('#socialJoin');
  try { await waitFor(`document.querySelector('#inviteSuccess')`, 'klaar', 15000); } catch (e) { console.log('DIAG', J({ hash: await ev('location.hash'), social: await social(), userError: await text('#socialUserError'), nameError: await text('#socialNameError'), body: (await appText()).slice(0, 400), problems })); throw e; }
  check('de naam uit het formulier staat nu ook in Instellingen/de begroeting', (await ev(`window.habitBuilder.state.settings.displayName`)) === 'Remco Test');
  check('de uitnodiging wordt meteen ingewisseld: "Jij en Cor zijn nu vrienden!"', /Jij en Cor zijn nu vrienden/i.test(await text('#inviteSuccess')), await text('#inviteSuccess'));
  check('het bevestigingsscherm toont de nieuwe vriend en wijst de weg (dit testaccount heeft al habits: vrienden bekijken of naar Vandaag)', /@cor/i.test(await appText()) && (await count('#toBoard')) === 1 && (await count('#toToday')) === 1 && (await count('#firstHabit')) === 0, await appText());
  check('de onthouden uitnodiging en uitnodiger zijn daarna vergeten', (await ev(`localStorage.getItem('hb-social-invite')`)) === null && (await ev(`localStorage.getItem('hb-social-inviter')`)) === null);
  await overflow('uitnodiging gelukt');
  await shot('invite-success');


  // ---- 4. de ranglijst -------------------------------------------------------------------------------------------------------------------
  await click('#toBoard');
  await waitFor(`document.querySelector('.board')`, 'ranglijst');
  const board1 = await social();
  check('de ranglijst toont jou en Cor, gerangschikt op punten (jij 282 boven Cor 200)', board1.board.length === 2 && board1.board[0][0] === 'Remco Test' && board1.board[1][0] === 'Cor', J(board1.board));
  check('je eigen rij staat er met je lokale punten en is gemarkeerd', (await count('.board__row--me')) === 1 && /jij/.test(await text('.board__row--me')), await text('.board__row--me'));
  const myPoints = board1.board.find((r) => r[0] === 'Remco Test')[1];
  check('je eigen punten komen uit je habits (3 habits × 7 dagen + bonus + start)', myPoints >= 210, String(myPoints));
  check('de ranglijst heeft een uitleg "Wie staat er op de ranglijst?" met de regels', (await count('#rules')) === 1 && /geen minimum aantal taken/i.test(await ev(`document.querySelector('#rules').textContent`)));
  check('de ranglijst werkt als geordende lijst met plek, naam en punten als tekst', (await ev(`document.querySelector('ol.board')?.tagName`)) === 'OL' && /Plek/.test(await ev(`document.querySelector('.board__rank').innerText`)));
  await overflow('ranglijst');
  await shot('board');

  await click('#breakdown summary');
  await sleep(150);
  check('"Waar komen mijn punten vandaan?" toont taken, bonus en het totaal', /Afgeronde taken/i.test(await text('#breakdown')) && /Totaal/i.test(await text('#breakdown')) && /Bonus/i.test(await text('#breakdown')), await text('#breakdown'));
  await shot('breakdown');

  // ---- 5. vrienden toevoegen -------------------------------------------------------------------------------------------------------------
  await click('#addFriends');
  await waitFor(`document.querySelector('#findInput')`, 'toevoegen');
  await setValue('#findInput', 'anna');
  await click('#findButton');
  await waitFor(`document.querySelector('#findResult')`, 'zoekresultaat');
  check('zoeken op "anna" toont Anna met "Verzoek sturen"', /Anna/.test(await text('#findResult')) && (await count('#sendRequest')) === 1, await text('#findResult'));
  check('het zoekveld houdt wat je typte na het zoeken (en de focus)', (await ev(`document.querySelector('#findInput').value`)) === 'anna');
  await shot('add-result');
  await click('#sendRequest');
  await waitFor(`document.querySelector('#requestPending')`, 'verzoek verstuurd');
  check('na "Verzoek sturen" staat er "Verzoek verstuurd"', true);
  await setValue('#findInput', 'bestaatniet');
  await click('#findButton');
  await waitFor(`document.querySelector('#findNone')`, 'niet gevonden');
  check('een onbekende naam geeft "geen gebruiker gevonden"', /Geen gebruiker gevonden/i.test(await text('#findNone')));
  await setValue('#findInput', 'an');
  await click('#findButton');
  await waitFor(`document.querySelector('#findNone')`, 'deelmatch');
  check('een deel van een naam vindt niets', true);
  await click('#makeInvite');
  await waitFor(`document.querySelector('#inviteLink')`, 'uitnodigingslink');
  const link = await ev(`document.querySelector('#inviteLink').value`);
  check('een uitnodigingslink wordt gemaakt en getoond', /^http:\/\/localhost:5174\/#\/vrienden\/uitnodiging\/[0-9a-f]{64}$/.test(link), link);
  check('de link kan gekopieerd worden (knop aanwezig)', (await count('#copyInvite')) === 1);
  await overflow('vrienden toevoegen');
  await shot('add-invite');

  // ---- 6. een vriend accepteert; een ander stuurt een verzoek --------------------------------------------------------------------------
  const me = await rpc(anna, 'friend_list');
  const meId = me.find((p) => p.state === 'incoming')?.user_id;
  check('Anna ziet het verzoek van jou (server)', Boolean(meId));
  await rpc(anna, 'friend_respond', { p_user: meId, p_accept: true });
  await rpc(bram, 'friend_request', { p_user: meId });
  await goto('#/vrienden');
  await waitFor(`document.querySelector('#refreshBoard')`, 'hoofdscherm');
  await click('#refreshBoard');
  await waitFor(`document.querySelector('#requests')`, 'verzoek van Bram');
  check('een binnenkomend verzoek staat direct bovenaan (Bram)', /Bram wil vrienden worden/i.test(await text('#requests')), await text('#requests'));
  const afterRefresh = await social();
  check('Anna is nu een vriend en staat op de ranglijst', afterRefresh.friends === 2 && afterRefresh.board.some((r) => r[0] === 'Anna'), J(afterRefresh));
  await shot('board-requests');
  await click(`#requests button[data-focus-key^="accept-"]`);
  await waitFor(`!document.querySelector('#requests')`, 'verzoek beantwoord');
  check('na accepteren is het verzoek weg en Bram staat op de ranglijst', (await social()).board.some((r) => r[0] === 'Bram'), J(await social()));
  await rpc(dora, 'friend_request', { p_user: meId });
  await rpc(dora, 'friend_list');

  // ---- 7. beheren --------------------------------------------------------------------------------------------------------------------
  await goto('#/vrienden/beheer');
  await waitFor(`document.querySelector('#friends')`, 'beheren');
  await waitFor(`document.querySelector('#invites')`, 'uitnodigingen');
  await sleep(600);
  check('Beheren toont je vrienden (Cor, Anna, Bram)', (await count('#friends .person')) === 3, String(await count('#friends .person')));
  check('Beheren toont je uitnodigingslink(s) met intrekken', (await count('#invites .person')) >= 1);
  check('Beheren toont je profiel met naam en gebruikersnaam', /Remco Test/.test(await text('#profileName')) && /@remco\.ui/.test(await text('#profileUsername')));
  check('het verzoek van Dora (nog niet beantwoord) staat onder "Verzoeken aan jou"', /Dora/.test(await text('#incoming') ?? ''), await text('#incoming'));
  await overflow('beheren');
  await shot('manage');
  check('Beheren toont bij je link hoeveel mensen hem gebruikten en laat je hem opnieuw kopiëren (de link staat op dit apparaat)', /Nog niemand/.test(await text('#invites .person')) && (await count('#invites .person button[data-focus-key^="copy-"]')) === 1, await text('#invites'));
  await click('#invites .person button[data-focus-key^="revoke-"]');
  await sleep(600);
  check('een uitnodigingslink intrekken haalt hem uit de lijst', (await count('#invites .person')) === 0);
  await closeDialogs(); // een prestatie-viering van de aangemaakte habits kan hier tussendoor komen
  await click('#friends .person button');
  await waitFor(`document.querySelector('dialog[open]')`, 'bevestiging verwijderen');
  const removeText = await ev(`document.querySelector('dialog[open]').innerText`);
  check('een vriend verwijderen vraagt eerst bevestiging', /verwijderen als vriend/i.test(removeText), removeText);
  await shot('manage-remove');
  await ev(`document.querySelector('dialog[open] .button--danger').click()`);
  await sleep(900);
  check('na bevestigen is er één vriend minder', (await count('#friends .person')) === 2, String(await count('#friends .person')));
  await closeDialogs();

  // ---- 8. beide thema's en desktop -------------------------------------------------------------------------------------------------------
  await goto('#/vrienden');
  await waitFor(`document.querySelector('.board')`, 'ranglijst voor thema');
  {
    const now = await social();
    const listed = await count('#friendsList .person');
    check('onder de ranglijst staat "Je vrienden (n)" met alle vrienden, ook wie niet op de ranglijst staat', listed === now.friends && now.friends > 0 && new RegExp(`Je vrienden \\(${now.friends}\\)`, 'i').test(await text('#friendsList')), `${listed} van ${now.friends}: ${await text('#friendsList')}`);
    const quiet = await count('#friendsList .person__note');
    check('wie niet op de ranglijst staat krijgt een rustige uitleg', quiet === now.friends - (now.board.length - 1), `${quiet} uitleg, ${now.friends} vrienden, ${now.board.length} op de lijst`);
    check('een vriend heeft naam, @gebruikersnaam en sinds wanneer', /@\w[\w.]*[\s\S]*Vriend sinds/.test(await text('#friendsList .person')), await text('#friendsList .person'));
    await overflow('ranglijst met de vriendenlijst');
    await ev(`document.querySelector('#friendsList').scrollIntoView({ block: 'center' })`);
    await shot('board-friends-list');
  }
  for (const theme of ['mel']) {
    await ev(`import('/src/ui/state.js').then((m) => m.saveSettings({ theme: ${J(theme)} }))`);
    await sleep(500);
    await overflow(`ranglijst thema ${theme}`);
    await shot(`board-${theme}`);
    await goto('#/stats'); await sleep(300);
    await shot(`stats-card-${theme}`);
    await goto('#/vrienden');
  }
  await ev(`import('/src/ui/state.js').then((m) => m.saveSettings({ theme: 'v0lky1' }))`);
  await viewport(1280, 800, false);
  await sleep(400);
  await overflow('ranglijst desktop');
  await shot('board-desktop');
  // Vandaag op desktop met alles gedaan: de kaart rechts staat op dezelfde hoogte als de eerste kaart links (rechts krijgt een eigen kopregel)
  await goto('#/today'); await sleep(500);
  const tops = await ev(`(() => {
    const top = (e) => (e ? Math.round(e.getBoundingClientRect().top + scrollY) : null);
    return { left: top(document.querySelector('.today__main .habit-card')), right: top(document.querySelector('.today__side .celebrate')) };
  })()`);
  check('Vandaag op desktop: de kaart "alles gedaan" staat op dezelfde hoogte als de eerste habit links', tops.left !== null && tops.right !== null && Math.abs(tops.left - tops.right) <= 2, J(tops));
  await shot('today-desktop');
  await goto('#/vrienden/toevoegen'); await sleep(300);
  await shot('add-desktop');
  await goto('#/stats'); await sleep(300);
  check('op desktop staat de kaart op Voortgang met je plek en het aantal vrienden', /Je staat \d+e van \d+/.test(await text('#socialCard')) && /\d+ vrienden?/.test(await text('#socialCard')), await text('#socialCard'));
  await shot('stats-desktop');
  await viewport(390, 844);

  // ---- 9. grote tekst en kleine schermen -----------------------------------------------------------------------------------------------
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  for (const hash of ['#/vrienden', '#/vrienden/toevoegen', '#/vrienden/beheer', '#/stats']) {
    await goto(hash); await sleep(500);
    await overflow(`${hash} bij 320px en 200% tekst`);
  }
  await shot('board-big-text');
  await ev(`document.documentElement.style.fontSize = ''`);
  await viewport(390, 844);

  // ---- 10. offline ------------------------------------------------------------------------------------------------------------------------
  await goto('#/vrienden'); await sleep(400);
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await ev(`window.dispatchEvent(new Event('offline'))`);
  const before = await social();
  await click('#refreshBoard');
  await sleep(600);
  check('offline blijft ook de vriendenlijst staan (uit de cache)', (await count('#friendsList .person')) === before.friends, String(await count('#friendsList .person')));
  check('offline blijft de ranglijst staan (uit de cache) met een melding', (await count('.board__row')) === before.board.length && /Zonder verbinding|offline/i.test(await appText()), await appText());
  await shot('board-offline');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // ---- 11. uitzetten --------------------------------------------------------------------------------------------------------------------------
  await goto('#/vrienden/beheer');
  await waitFor(`document.querySelector('#leaveSocial')`, 'uitzetten');
  await click('#leaveSocial');
  await waitFor(`document.querySelector('dialog[open]')`, 'bevestig uitzetten');
  await ev(`document.querySelector('dialog[open] .button--danger').click()`);
  await waitFor(`document.querySelector('#socialJoin')`, 'terug naar aanmelden', 10000);
  check('sociaal uitzetten brengt je terug bij het aanmelden', (await social()).status === 'off');
  const lb = await rpc(cor, 'leaderboard');
  check('en je bent weg uit de ranglijst van je vrienden (server)', Array.isArray(lb) && !lb.some((r) => r.username === 'remco.ui'), J(lb));
  await overflow('na uitzetten');

  check('geen JavaScript-fouten of console-errors', problems.length === 0, problems.join(' | '));

  // ---- 12. een account dat op een ander apparaat is verwijderd ---------------------------------------------------------------------------------
  // Zonder controle lijkt de bewaarde sessie nog geldig en geeft elke schrijfactie een 409 (foreign key). Nu herkent de app het bij het openen.
  const elsewhere = await apiLogin('ui-me@example.com'); // "het andere apparaat"
  await rpc(elsewhere, 'delete_my_account');
  await send('Page.reload');
  await waitFor(`localStorage.getItem('sb-localhost-auth-token') === null`, 'sessie opgeruimd na een elders verwijderd account', 20000);
  check('een sessie van een elders verwijderd account wordt bij het openen herkend: de app is uitgelogd in plaats van 409-fouten te geven', (await ev(`import('/src/ui/account.js').then((m) => m.account.status)`)) === 'anonymous');

  // opruimen
  for (const u of Object.values(people)) await rpc(u, 'delete_my_account');
  ws.close();
}

try {
  await main();
} catch (error) {
  check(`onverwachte fout: ${error.message}`, false);
} finally {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
  else edge.kill('SIGKILL');
  server.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} geslaagd`);
  if (problems.length) console.log('Problemen:', problems);
  process.exit(failed ? 1 : 0);
}
