// Controle van migratie 0003 (vrienden en ranglijst) op de LOKALE Supabase, via dezelfde API als de app (PostgREST): vijf gebruikers,
// alle functies en alles wat NIET mag. Aanvulling op tests/server/social.test.js (die op PGlite draait): dit bewijst ook de rechten
// zoals de echte stack ze uitdeelt.
// Gebruik: npm run db:start, dan: node tools/social-check.mjs   (de inlogcodes komen uit het lokale mailvenster)
// Het script ruimt zijn eigen testaccounts (social-u1..u5@example.com) vóór en na afloop op.
const API = 'http://127.0.0.1:54321';
const MAIL = 'http://127.0.0.1:54324';
const KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (v) => JSON.stringify(v);

async function login(email) {
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' }).catch(() => {});
  const r = await fetch(`${API}/auth/v1/otp`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: J({ email, create_user: true }) });
  if (!r.ok) throw new Error(`otp ${r.status} ${await r.text()}`);
  let code = null;
  for (let i = 0; i < 30 && !code; i++) {
    await sleep(250);
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    const msg = (list.messages ?? []).find((m) => m.To.some((t) => t.Address === email));
    if (msg) { const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json(); code = /\b(\d{6})\b/.exec(full.HTML + ' ' + full.Text)?.[1] ?? null; }
  }
  const v = await fetch(`${API}/auth/v1/verify`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: J({ type: 'email', email, token: code }) });
  const body = await v.json();
  if (!body.access_token) throw new Error(`login ${email}: ${J(body)}`);
  return { token: body.access_token, id: body.user.id, email };
}

/** Roept een functie aan. Geeft { ok, status, body, code } terug; bij een fout is code de stabiele foutcode uit de melding. */
async function rpc(user, fn, args = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${user.token}`;
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: J(args) });
  const text = await r.text();
  let body = text; try { body = JSON.parse(text); } catch { /* geen JSON */ }
  return { ok: r.ok, status: r.status, body, code: r.ok ? null : (body?.message ?? String(text).slice(0, 80)) };
}
const table = (user, name) => fetch(`${API}/rest/v1/${name}?select=*`, { headers: { apikey: KEY, ...(user ? { Authorization: `Bearer ${user.token}` } : {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const today = new Date().toISOString().slice(0, 10);
const summary = (points, extra = {}) => ({ p_as_of: today, p_points: points, p_done: Math.round(points / 10), p_streak: 3, p_active_habits: 4, p_last_active: today, ...extra });

/** Een schone gebruiker: inloggen (maakt het account zo nodig aan), het oude account wissen en opnieuw beginnen. */
async function fresh(email) {
  const old = await login(email);
  await rpc(old, 'delete_my_account');
  return login(email);
}
const users = {};
for (const name of ['u1', 'u2', 'u3', 'u4', 'u5']) users[name] = await fresh(`social-${name}@example.com`);
const { u1, u2, u3, u4, u5 } = users;
console.log('— gebruikers ingelogd\n');

// ---- niet ingelogd en niet rechtstreeks --------------------------------------------------------------------------------------
const FUNCTIONS = ['social_enable', 'social_disable', 'social_me', 'social_find', 'friend_request', 'friend_respond', 'friend_cancel', 'friend_remove',
  'friend_list', 'invite_create', 'invite_list', 'invite_revoke', 'invite_redeem', 'publish_summary', 'leaderboard'];
const anonResults = await Promise.all(FUNCTIONS.map((fn) => rpc(null, fn, {}).then((r) => [fn, r])));
check('zonder in te loggen is geen enkele functie aan te roepen', anonResults.every(([, r]) => !r.ok), J(anonResults.filter(([, r]) => r.ok).map(([fn]) => fn)));
for (const helper of ['social_uid', 'social_require_enabled', 'social_rate_use', 'social_friend_count']) {
  const r = await rpc(u1, helper, helper === 'social_friend_count' ? { p_uid: u1.id } : {});
  check(`hulpfunctie ${helper} is ook ingelogd niet aan te roepen`, !r.ok, J(r.body).slice(0, 80));
}
for (const t of ['social_profiles', 'friendships', 'invite_codes', 'score_summaries', 'social_rate', 'social_blocked_terms']) {
  const a = await table(null, t);
  const b = await table(u1, t);
  check(`tabel ${t}: niet te lezen zonder inloggen en ook ingelogd niet`, [a, b].every((x) => [401, 403].includes(x.status) || (Array.isArray(x.body) && x.body.length === 0)), J([a, b]).slice(0, 120));
}
const insertTry = await fetch(`${API}/rest/v1/social_profiles`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${u1.token}`, 'Content-Type': 'application/json' }, body: J({ user_id: u1.id, username: 'direct' }) });
check('rechtstreeks een profiel invoegen mislukt', !insertTry.ok, String(insertTry.status));

// ---- sociaal niet aan ---------------------------------------------------------------------------------------------------------
check('zoeken zonder sociaal aan: not_enabled', (await rpc(u1, 'social_find', { p_username: 'anna' })).code === 'not_enabled');
check('de ranglijst zonder sociaal aan: not_enabled', (await rpc(u1, 'leaderboard')).code === 'not_enabled');
check('social_me zonder profiel is null', (await rpc(u1, 'social_me')).body === null);

// ---- aanzetten en gebruikersnamen -----------------------------------------------------------------------------------------------
check('te korte gebruikersnaam: invalid_username', (await rpc(u1, 'social_enable', { p_username: 'ab', p_display_name: 'x' })).code === 'invalid_username');
check('spatie in de gebruikersnaam: invalid_username', (await rpc(u1, 'social_enable', { p_username: 'a b c', p_display_name: 'x' })).code === 'invalid_username');
check('te lange weergavenaam: invalid_display_name', (await rpc(u1, 'social_enable', { p_username: 'remco', p_display_name: 'x'.repeat(31) })).code === 'invalid_display_name');
check('verboden woord in de gebruikersnaam: username_not_allowed', (await rpc(u1, 'social_enable', { p_username: 'MyAdmin', p_display_name: 'x' })).code === 'username_not_allowed');
const en1 = await rpc(u1, 'social_enable', { p_username: '  Remco ', p_display_name: 'Remco' });
check('u1 zet sociaal aan; de gebruikersnaam wordt kleine letters', en1.ok && en1.body.username === 'remco' && en1.body.enabled === true, J(en1.body));
check('dezelfde naam in hoofdletters is bezet: username_taken', (await rpc(u2, 'social_enable', { p_username: 'REMCO', p_display_name: 'x' })).code === 'username_taken');
for (const [u, name, display] of [[u2, 'anna', 'Anna'], [u3, 'bram', 'Bram'], [u4, 'cor', ''], [u5, 'eef', 'Eef']]) {
  const r = await rpc(u, 'social_enable', { p_username: name, p_display_name: display });
  check(`${name} zet sociaal aan`, r.ok, J(r.body));
}
check('u1 mag zijn eigen weergavenaam wijzigen zonder de naamregel te raken', (await rpc(u1, 'social_enable', { p_username: 'remco', p_display_name: 'Remco V.' })).ok);
check('de eerste keer van gebruikersnaam wisselen mag', (await rpc(u1, 'social_enable', { p_username: 'remco2', p_display_name: 'Remco V.' })).ok);
check('een tweede wissel binnen 30 dagen: username_change_too_soon', (await rpc(u1, 'social_enable', { p_username: 'remco3', p_display_name: 'Remco V.' })).code === 'username_change_too_soon');
check('social_me geeft je eigen profiel', (await rpc(u1, 'social_me')).body?.username === 'remco2');

// ---- zoeken -----------------------------------------------------------------------------------------------------------------------
const found = await rpc(u1, 'social_find', { p_username: 'ANNA' });
check('zoeken op de exacte naam (hoofdletters maken niet uit) geeft één resultaat', found.ok && found.body.length === 1 && found.body[0].username === 'anna' && found.body[0].relation === 'none', J(found.body));
check('het resultaat bevat alleen id, gebruikersnaam, weergavenaam en relatie (geen e-mail)', J(Object.keys(found.body[0]).sort()) === J(['display_name', 'id', 'relation', 'username']));
check('een deel van de naam geeft niets (geen deelmatches)', (await rpc(u1, 'social_find', { p_username: 'ann' })).body.length === 0);
check('een wildcard geeft niets', (await rpc(u1, 'social_find', { p_username: '%' })).body.length === 0);
check('jezelf zoeken geeft niets', (await rpc(u1, 'social_find', { p_username: 'remco2' })).body.length === 0);
check('een onbekende naam geeft niets', (await rpc(u1, 'social_find', { p_username: 'bestaatniet' })).body.length === 0);

// ---- verzoeken --------------------------------------------------------------------------------------------------------------------
const req = await rpc(u1, 'friend_request', { p_user: u2.id });
check('u1 stuurt u2 een verzoek: pending', req.ok && req.body.status === 'pending', J(req.body));
check('hetzelfde verzoek nog een keer is gewoon pending', (await rpc(u1, 'friend_request', { p_user: u2.id })).body?.status === 'pending');
const l2 = await rpc(u2, 'friend_list');
check('u2 ziet een binnenkomend verzoek van u1', l2.ok && l2.body.some((r) => r.user_id === u1.id && r.state === 'incoming'), J(l2.body));
const l1 = await rpc(u1, 'friend_list');
check('u1 ziet een uitgaand verzoek naar u2', l1.body.some((r) => r.user_id === u2.id && r.state === 'outgoing'), J(l1.body));
check('u3 ziet niets van dit verzoek', (await rpc(u3, 'friend_list')).body.length === 0);
check('u3 kan het verzoek niet beantwoorden: not_found', (await rpc(u3, 'friend_respond', { p_user: u1.id, p_accept: true })).code === 'not_found');
check('u1 kan zijn eigen verzoek niet accepteren: not_found', (await rpc(u1, 'friend_respond', { p_user: u2.id, p_accept: true })).code === 'not_found');
check('u2 weigert: declined', (await rpc(u2, 'friend_respond', { p_user: u1.id, p_accept: false })).body?.status === 'declined');
check('na weigeren is u2 voor u1 niet meer te vinden', (await rpc(u1, 'social_find', { p_username: 'anna' })).body.length === 0);
check('en een nieuw verzoek van u1 geeft hetzelfde antwoord als "niet gevonden"', (await rpc(u1, 'friend_request', { p_user: u2.id })).code === 'not_found');
check('de weigering is voor u1 niet zichtbaar in zijn lijst', !(await rpc(u1, 'friend_list')).body.some((r) => r.user_id === u2.id));
check('u2 kan u1 wel gewoon vinden', (await rpc(u2, 'social_find', { p_username: 'remco2' })).body.length === 1);
check('u2 stuurt zelf een verzoek aan u1: pending', (await rpc(u2, 'friend_request', { p_user: u1.id })).body?.status === 'pending');
check('u1 accepteert: accepted', (await rpc(u1, 'friend_respond', { p_user: u2.id, p_accept: true })).body?.status === 'accepted');
check('beiden zien elkaar als vriend', (await rpc(u1, 'friend_list')).body.some((r) => r.user_id === u2.id && r.state === 'friend') && (await rpc(u2, 'friend_list')).body.some((r) => r.user_id === u1.id && r.state === 'friend'));
check('zoeken toont nu relation "friend"', (await rpc(u1, 'social_find', { p_username: 'anna' })).body[0]?.relation === 'friend');
check('nog een verzoek aan een vriend: gewoon accepted', (await rpc(u1, 'friend_request', { p_user: u2.id })).body?.status === 'accepted');

check('u3 vraagt u4: pending', (await rpc(u3, 'friend_request', { p_user: u4.id })).body?.status === 'pending');
check('u4 vraagt terug: meteen accepted (wederzijds)', (await rpc(u4, 'friend_request', { p_user: u3.id })).body?.status === 'accepted');
check('een verzoek aan jezelf: not_found', (await rpc(u1, 'friend_request', { p_user: u1.id })).code === 'not_found');
check('een verzoek aan een onbekende id: not_found', (await rpc(u1, 'friend_request', { p_user: '00000000-0000-0000-0000-000000000000' })).code === 'not_found');
check('u5 kan een verzoek intrekken', (await rpc(u5, 'friend_request', { p_user: u3.id })).body?.status === 'pending' && (await rpc(u5, 'friend_cancel', { p_user: u3.id })).body === true);
check('na intrekken ziet u3 het verzoek niet meer', !(await rpc(u3, 'friend_list')).body.some((r) => r.user_id === u5.id));
check('een tweede keer intrekken: false', (await rpc(u5, 'friend_cancel', { p_user: u3.id })).body === false);

// ---- uitnodigingslinks ------------------------------------------------------------------------------------------------------------
const inv = await rpc(u1, 'invite_create');
check('u1 maakt een uitnodiging: een lange code', inv.ok && /^[0-9a-f]{64}$/.test(inv.body.code), J(inv.body));
const list = await rpc(u1, 'invite_list');
check('invite_list toont de uitnodiging zonder de code zelf', list.ok && list.body.length === 1 && !('code' in list.body[0]) && !('code_hash' in list.body[0]), J(list.body));
check('een verzonnen code is invalid (geen fout)', (await rpc(u5, 'invite_redeem', { p_code: 'a'.repeat(64) })).body?.status === 'invalid');
check('u1 kan zijn eigen code niet inwisselen: invalid', (await rpc(u1, 'invite_redeem', { p_code: inv.body.code })).body?.status === 'invalid');
const redeem = await rpc(u5, 'invite_redeem', { p_code: inv.body.code.toUpperCase() });
check('u5 wisselt de code in: direct vrienden met u1', redeem.ok && redeem.body.status === 'ok' && redeem.body.username === 'remco2', J(redeem.body));
check('u1 ziet u5 als vriend', (await rpc(u1, 'friend_list')).body.some((r) => r.user_id === u5.id && r.state === 'friend'));
check('de code werkt ook voor een tweede persoon (deelbaar in een groep)', (await rpc(u4, 'invite_redeem', { p_code: inv.body.code })).body?.status === 'ok');
check('opnieuw inwisselen door een vriend: gewoon ok', (await rpc(u5, 'invite_redeem', { p_code: inv.body.code })).body?.status === 'ok');
const revoked = await rpc(u1, 'invite_revoke', { p_id: inv.body.id });
check('u1 trekt de uitnodiging in', revoked.body === true);
check('een ingetrokken code is invalid', (await rpc(u3, 'invite_redeem', { p_code: inv.body.code })).body?.status === 'invalid');
check('een ander kan jouw uitnodiging niet intrekken', (await rpc(u2, 'invite_revoke', { p_id: inv.body.id })).body === false);
let limit = null;
for (let i = 0; i < 6; i++) { const r = await rpc(u2, 'invite_create'); if (!r.ok) { limit = r.code; break; } }
check('hoogstens 5 actieve uitnodigingen: invite_limit', limit === 'invite_limit', String(limit));

// ---- raden loont niet: elke poging telt, ook een mislukte -------------------------------------------------------------------------
const guesses = [];
for (let i = 0; i < 22; i++) guesses.push(await rpc(u2, 'invite_redeem', { p_code: `${i}`.padStart(64, 'f') }));
const invalid = guesses.filter((g) => g.ok && g.body.status === 'invalid').length;
const limited = guesses.filter((g) => g.code === 'too_many_requests').length;
check('20 foute codes geven "invalid", daarna wordt het begrensd (too_many_requests)', invalid === 20 && limited === 2, `invalid=${invalid} limited=${limited}`);
let finds = 0, findLimited = 0;
for (let i = 0; i < 22; i++) { const r = await rpc(u5, 'social_find', { p_username: `guess${i}` }); if (r.ok) finds++; else if (r.code === 'too_many_requests') findLimited++; }
check('zoeken is begrensd op 20 per uur', finds === 20 && findLimited === 2, `ok=${finds} begrensd=${findLimited}`);

// ---- de ranglijst -----------------------------------------------------------------------------------------------------------------
check('ongeldige samenvatting (negatieve punten): invalid_summary', (await rpc(u1, 'publish_summary', summary(-5))).code === 'invalid_summary');
check('ongeldige samenvatting (datum ver weg): invalid_summary', (await rpc(u1, 'publish_summary', summary(50, { p_as_of: '2020-01-01', p_last_active: '2020-01-01' }))).code === 'invalid_summary');
check('ongeldige samenvatting (laatst actief na as_of): invalid_summary', (await rpc(u1, 'publish_summary', summary(50, { p_last_active: '2099-01-01' }))).code === 'invalid_summary');
check('absurde punten: invalid_summary', (await rpc(u1, 'publish_summary', summary(10000000))).code === 'invalid_summary');
check('u1 publiceert 240 punten', (await rpc(u1, 'publish_summary', summary(240))).ok);
check('u2 publiceert 180 punten', (await rpc(u2, 'publish_summary', summary(180))).ok);
check('u4 publiceert 90 punten', (await rpc(u4, 'publish_summary', summary(90))).ok);
check('u5 publiceert 300 punten', (await rpc(u5, 'publish_summary', summary(300))).ok);
check('u3 publiceert 120 punten', (await rpc(u3, 'publish_summary', summary(120))).ok);
check('opnieuw publiceren werkt bij (geen tweede rij)', (await rpc(u2, 'publish_summary', summary(190))).ok);
const lb1 = await rpc(u1, 'leaderboard');
const ids1 = lb1.body.map((r) => r.user_id).sort();
check('u1 ziet zichzelf en zijn vrienden (u2, u4, u5), niet u3 (geen vriend van u1)', lb1.ok && J(ids1) === J([u1.id, u2.id, u4.id, u5.id].sort()), J(lb1.body.map((r) => r.username)));
check('de eigen rij is gemarkeerd', lb1.body.find((r) => r.user_id === u1.id)?.is_me === true && lb1.body.filter((r) => r.is_me).length === 1);
check('de ranglijst bevat alleen de samenvattingsvelden (geen e-mail of ander)', J(Object.keys(lb1.body[0]).sort()) === J(['active_habits', 'as_of', 'display_name', 'done', 'is_me', 'last_active', 'points', 'streak', 'user_id', 'username']));
check('de bijgewerkte punten van u2 staan erin (190)', lb1.body.find((r) => r.user_id === u2.id)?.points === 190);
const lb3 = await rpc(u3, 'leaderboard');
check('u3 (alleen vriend van u4) ziet u1, u2 en u5 NIET: alleen zichzelf en u4', J(lb3.body.map((r) => r.user_id).sort()) === J([u3.id, u4.id].sort()), J(lb3.body.map((r) => r.username)));

// ---- uitzetten, verwijderen, account weg ---------------------------------------------------------------------------------------
await rpc(u2, 'social_disable');
const lbAfter = await rpc(u1, 'leaderboard');
check('als u2 sociaal uitzet, verdwijnt u2 uit de ranglijst van u1', !lbAfter.body.some((r) => r.user_id === u2.id));
check('en uit de vriendenlijst van u1', !(await rpc(u1, 'friend_list')).body.some((r) => r.user_id === u2.id));
check('en uit de zoekresultaten', (await rpc(u1, 'social_find', { p_username: 'anna' })).body.length === 0);
check('en zijn samenvatting is gewist', (await rpc(u2, 'social_enable', { p_username: 'anna', p_display_name: 'Anna' })).ok && !(await rpc(u2, 'leaderboard')).body.some((r) => r.is_me));
check('de vriendschap bleef bewaard: na weer aanzetten is u2 weer vriend van u1', (await rpc(u1, 'friend_list')).body.some((r) => r.user_id === u2.id && r.state === 'friend'));
check('een vriend verwijderen werkt wederzijds', (await rpc(u1, 'friend_remove', { p_user: u2.id })).body === true && !(await rpc(u2, 'friend_list')).body.some((r) => r.user_id === u1.id));
check('verwijderen van een niet-vriend: false', (await rpc(u1, 'friend_remove', { p_user: u2.id })).body === false);
const del = await rpc(u5, 'delete_my_account');
check('een account verwijderen wist ook zijn vriendschappen en samenvatting', del.ok && !(await rpc(u1, 'friend_list')).body.some((r) => r.user_id === u5.id) && !(await rpc(u1, 'leaderboard')).body.some((r) => r.user_id === u5.id));

for (const u of [u1, u2, u3, u4]) await rpc(u, 'delete_my_account');
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exitCode = failed ? 1 : 0;
