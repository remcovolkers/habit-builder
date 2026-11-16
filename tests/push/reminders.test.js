// Wanneer er een melding gaat, wat erin staat, en de hele aanroep (cron en test) tegen een nagebootste database en push-dienst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminders } from './helpers.js';

const { isDue, composeMessage, localMoment, handleRequest, b64uEncode, GRACE_MINUTES } = reminders;

const sub = (extra = {}) => ({ remind_time: '08:00', timezone: 'Europe/Amsterdam', last_notified_date: null, summary: {}, ...extra });
// 2026-10-16 (CEST, UTC+2): 08:00 lokaal = 06:00 UTC
const at = (hh, mm = 0) => new Date(Date.UTC(2026, 9, 16, hh, mm));

test('localMoment: datum en minuut in de tijdzone van de gebruiker, ook rond middernacht', () => {
  assert.deepEqual(localMoment(at(6, 0), 'Europe/Amsterdam'), { date: '2026-10-16', minutes: 480, hour: 8 });
  assert.equal(localMoment(at(22, 30), 'Europe/Amsterdam').date, '2026-10-17'); // 00:30 lokaal
  assert.equal(localMoment(at(22, 30), 'America/New_York').date, '2026-10-16');
});

test('isDue: niet vóór het tijdstip, wel vanaf het tijdstip, en nog even daarna', () => {
  assert.equal(isDue(sub(), at(5, 59)), false);
  assert.equal(isDue(sub(), at(6, 0)), true);
  assert.equal(isDue(sub(), at(6, 4)), true);
  assert.equal(isDue(sub(), at(6 + GRACE_MINUTES / 60 - 1, 59)), true);
  assert.equal(isDue(sub(), at(6 + GRACE_MINUTES / 60, 0)), false, 'te laat: dan liever niets dan een ochtendmelding in de middag');
});

test('isDue: één keer per lokale dag', () => {
  assert.equal(isDue(sub({ last_notified_date: '2026-10-16' }), at(6, 5)), false);
  assert.equal(isDue(sub({ last_notified_date: '2026-10-15' }), at(6, 5)), true);
});

test('isDue: rekent in de tijdzone van het apparaat (zomer- en wintertijd)', () => {
  const newYork = sub({ timezone: 'America/New_York' }); // 08:00 EDT = 12:00 UTC
  assert.equal(isDue(newYork, at(11, 59)), false);
  assert.equal(isDue(newYork, at(12, 0)), true);
  const winter = new Date(Date.UTC(2026, 11, 16, 7, 0)); // Amsterdam in december: UTC+1
  assert.equal(isDue(sub(), winter), true);
  assert.equal(isDue(sub(), new Date(Date.UTC(2026, 11, 16, 6, 59))), false);
});

test('isDue: onbruikbare tijd of tijdzone betekent niets sturen', () => {
  for (const bad of [{ remind_time: '8:00' }, { remind_time: '25:00' }, { remind_time: null }, { timezone: 'Mars/Olympus' }, { timezone: null }]) {
    assert.equal(isDue(sub(bad), at(6, 0)), false, JSON.stringify(bad));
  }
});

const withDays = (days, name) => sub({ summary: { name, days } });

test('composeMessage: gepland en stapel, alleen gepland, alleen stapel', () => {
  assert.equal(composeMessage(withDays({ '2026-10-16': [3, 2] }, 'Remco'), at(6)).title, 'Goedemorgen, Remco');
  assert.equal(composeMessage(withDays({ '2026-10-16': [3, 2] }), at(6)).body, 'Vandaag: 3 gewoontes, en 2 in je stapel om uit te kiezen.');
  assert.equal(composeMessage(withDays({ '2026-10-16': [1, 0] }), at(6)).body, 'Vandaag staat 1 gewoonte op je lijst.');
  assert.equal(composeMessage(withDays({ '2026-10-16': [0, 1] }), at(6)).body, 'Er ligt 1 taak in je stapel. Pak er vandaag één mee.');
  assert.equal(composeMessage(withDays({ '2026-10-16': [0, 3] }), at(6)).body, 'Er liggen 3 taken in je stapel. Pak er vandaag één mee.');
});

test('composeMessage: aandacht en de weekreview komen er neutraal bij, zonder namen van taken', () => {
  const body = (entry) => composeMessage(withDays({ '2026-10-16': entry }), at(6)).body;
  assert.equal(body([0, 0, 1, 0]), '1 taak vraagt aandacht.');
  assert.equal(body([0, 0, 3, 0]), '3 taken vragen aandacht.');
  assert.equal(body([0, 0, 0, 1]), 'Je weekterugblik staat klaar.');
  assert.equal(body([2, 0, 1, 0]), 'Vandaag staat 2 gewoontes op je lijst. 1 taak vraagt aandacht.');
  // een review staat vooraan: een tik op de melding opent die review
  assert.equal(body([2, 1, 2, 1]), 'Je weekterugblik staat klaar. Vandaag: 2 gewoontes, en 1 in je stapel om uit te kiezen. 2 taken vragen aandacht.');
  assert.equal(body([0, 2, 0, 1]), 'Je weekterugblik staat klaar. Er liggen 2 taken in je stapel. Pak er vandaag één mee.');
});

test('composeMessage: een maandreview komt erbij, en een tik opent Voortgang bij de review (week gaat voor maand)', () => {
  const message = (entry) => composeMessage(withDays({ '2026-10-16': entry }), at(6));
  assert.equal(message([0, 0, 0, 0, 1]).body, 'Je maandreview staat klaar.');
  assert.equal(message([0, 0, 0, 1, 1]).body, 'Je weekterugblik en maandreview staan klaar.');
  assert.equal(message([3, 0, 0, 0, 1]).body, 'Je maandreview staat klaar. Vandaag staat 3 gewoontes op je lijst.');
  assert.equal(message([0, 0, 0, 0, 1]).url, './#/stats?review=month&date=2026-10-16');
  // de weekreview die klaarstaat is die van de week die gisteren eindigde: de link wijst naar de dag ervoor
  assert.equal(message([0, 0, 0, 1, 0]).url, './#/stats?review=week&date=2026-10-15');
  assert.equal(message([0, 0, 0, 1, 1]).url, './#/stats?review=week&date=2026-10-15');
  assert.equal(message([3, 1, 0, 0, 0]).url, './#/today', 'zonder review blijft het Vandaag');
  assert.equal(message([0, 0, 0, 0, 'ja']), null, 'rommel telt niet');
});

test('composeMessage: een oudere app (twee getallen) en rommel in de nieuwe getallen geven dezelfde tekst als voorheen', () => {
  assert.equal(composeMessage(withDays({ '2026-10-16': [3, 2] }), at(6)).body, 'Vandaag: 3 gewoontes, en 2 in je stapel om uit te kiezen.');
  assert.equal(composeMessage(withDays({ '2026-10-16': [0, 0, -4, 7] }), at(6)), null);
  assert.equal(composeMessage(withDays({ '2026-10-16': [0, 0, 'veel', null] }), at(6)), null);
});

test('composeMessage: niets te doen = geen melding; geen samenvatting voor vandaag = algemene tekst', () => {
  assert.equal(composeMessage(withDays({ '2026-10-16': [0, 0] }), at(6)), null);
  assert.equal(composeMessage(withDays({ '2026-10-15': [3, 1] }), at(6)).body, 'Bekijk wat er vandaag op je lijst staat.');
  assert.equal(composeMessage(sub(), at(6)).body, 'Bekijk wat er vandaag op je lijst staat.');
});

test('composeMessage: de samenvatting van de lokale dag telt, en de begroeting past bij het uur', () => {
  const days = { '2026-10-16': [2, 0], '2026-10-17': [9, 9] };
  assert.equal(composeMessage(withDays(days), at(6)).body, 'Vandaag staat 2 gewoontes op je lijst.');
  assert.equal(composeMessage(withDays(days), at(13)).title, 'Goedemiddag');
  assert.equal(composeMessage(withDays(days), at(18)).title, 'Goedenavond');
});

test('composeMessage: rommel in de samenvatting geeft geen NaN of crash', () => {
  const messy = sub({ summary: { name: 42, days: { '2026-10-16': ['x', null] } } });
  assert.equal(composeMessage(messy, at(6)), null);
  assert.equal(composeMessage(sub({ summary: null }), at(6)).title, 'Goedemorgen');
  const body = composeMessage(sub({ summary: { name: 'A'.repeat(100), days: { '2026-10-16': [1, 0] } } }), at(6));
  assert.ok(body.title.length <= 'Goedemorgen, '.length + 30);
});

// ---------------------------------------------------------------------------------------------
// De hele aanroep
// ---------------------------------------------------------------------------------------------
const SUPABASE = 'https://proj.supabase.co';
const ENV = {
  SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'service-key', CRON_SECRET: 'geheim',
  VAPID_SUBJECT: 'mailto:a@b.nl', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
};

async function world({ subs, users = { 'token-a': 'user-a', 'token-b': 'user-b' }, pushStatus = {} }) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env = {
    ...ENV,
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d,
    VAPID_PUBLIC_KEY: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  };
  const rows = [];
  const receivers = [];
  for (const [index, extra] of subs.entries()) {
    const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const authBytes = crypto.getRandomValues(new Uint8Array(16));
    receivers.push({ ...receiver, uaPublic: new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey)), authSecret: authBytes });
    rows.push({
      id: `s${index}`, user_id: 'user-a', endpoint: `https://push.example.org/${index}`,
      p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))),
      auth: b64uEncode(authBytes),
      remind_time: '08:00', timezone: 'Europe/Amsterdam', summary: { name: 'Remco', days: { '2026-10-16': [3, 1] } }, last_notified_date: null,
      ...extra,
    });
  }
  const pushes = [];
  const bodies = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.origin === 'https://push.example.org') {
      const index = Number(url.pathname.slice(1));
      pushes.push(index);
      bodies.push({ index, body: init.body });
      return new Response(null, { status: pushStatus[index] ?? 201 });
    }
    assert.equal(url.origin, SUPABASE);
    assert.equal(new Headers(init.headers).get('apikey'), 'service-key');
    if (url.pathname === '/auth/v1/user') {
      const token = /^Bearer (.+)$/.exec(new Headers(init.headers).get('authorization'))?.[1];
      return users[token] ? Response.json({ id: users[token] }) : new Response('{}', { status: 401 });
    }
    assert.equal(url.pathname, '/rest/v1/push_subscriptions');
    const method = init.method ?? 'GET';
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const owner = url.searchParams.get('user_id')?.replace('eq.', '');
    if (method === 'GET') return Response.json(rows.filter((row) => !owner || row.user_id === owner));
    const row = rows.find((candidate) => candidate.id === id);
    if (method === 'DELETE') {
      rows.splice(rows.indexOf(row), 1);
      return new Response(null, { status: 204 });
    }
    assert.equal(method, 'PATCH');
    const patch = JSON.parse(init.body);
    if (url.searchParams.has('or')) { // de claim: alleen als dat soort nog niet van vandaag is (last_notified_date of een last_*-kolom van de extra meldingen)
      const [column] = Object.keys(patch);
      if (!row || row[column] === patch[column]) return Response.json([]);
      Object.assign(row, patch);
      return Response.json([row]);
    }
    Object.assign(row, patch);
    return new Response(null, { status: 204 });
  };
  const call = (headers, body, method = 'POST', now = at(6, 5), extra = {}) =>
    handleRequest(new Request(`${SUPABASE}/functions/v1/send-reminders`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      { env: (name) => env[name], fetchImpl, now, ...extra });
  return { rows, pushes, call, env, receivers, bodies };
}

const cron = { 'x-cron-secret': 'geheim' };

test('aanroep: ontbrekende geheimen worden benoemd (zonder waarden prijs te geven)', async () => {
  const { call, env } = await world({ subs: [] });
  delete env.CRON_SECRET;
  const response = await call(cron, {});
  assert.equal(response.status, 500);
  assert.deepEqual((await response.json()).missing, ['CRON_SECRET']);
});

test('aanroep: OPTIONS (CORS) mag, andere methoden dan POST niet', async () => {
  const { call } = await world({ subs: [] });
  const options = await call({}, undefined, 'OPTIONS');
  assert.equal(options.status, 204);
  assert.match(options.headers.get('Access-Control-Allow-Headers'), /authorization/);
  assert.equal((await call({}, undefined, 'GET')).status, 405);
});

test('aanroep: zonder cron-geheim of inlogsessie is er geen toegang', async () => {
  const { call, pushes } = await world({ subs: [{}] });
  assert.equal((await call({}, {})).status, 401);
  assert.equal((await call({ 'x-cron-secret': 'fout' }, {})).status, 401);
  assert.equal((await call({ 'x-cron-secret': '' }, {})).status, 401);
  assert.equal((await call({ authorization: 'Bearer onbekend' }, { test: true })).status, 401);
  assert.deepEqual(pushes, []);
});

test('cron: stuurt alleen aan wie aan de beurt is, en markeert die als gemeld', async () => {
  const { call, rows, pushes } = await world({ subs: [{}, { remind_time: '09:00' }, { last_notified_date: '2026-10-16' }] });
  const result = await (await call(cron, {})).json();
  assert.deepEqual({ due: result.due, sent: result.sent }, { due: 1, sent: 1 });
  assert.deepEqual(pushes, [0]);
  assert.equal(rows[0].last_notified_date, '2026-10-16');
  assert.equal(rows[1].last_notified_date, null);
});

test('cron: een tweede run in dezelfde ochtend stuurt niets meer', async () => {
  const { call, pushes } = await world({ subs: [{}] });
  await call(cron, {});
  const again = await (await call(cron, {}, 'POST', at(6, 10))).json();
  assert.equal(again.sent, 0);
  assert.deepEqual(pushes, [0]);
});

test('cron: twee runs tegelijk sturen niet dubbel (de claim wint)', async () => {
  const { call, pushes } = await world({ subs: [{}] });
  await Promise.all([call(cron, {}), call(cron, {})]);
  assert.deepEqual(pushes, [0]);
});

test('cron: een verlopen abonnement (410) wordt opgeruimd, een storing (500) wordt de volgende ronde opnieuw geprobeerd', async () => {
  const { call, rows } = await world({ subs: [{}, {}], pushStatus: { 0: 410, 1: 500 } });
  const result = await (await call(cron, {})).json();
  assert.deepEqual({ removed: result.removed, failed: result.failed, sent: result.sent }, { removed: 1, failed: 1, sent: 0 });
  assert.deepEqual(rows.map((row) => row.id), ['s1']);
  assert.equal(rows[0].last_notified_date, null, 'vrijgegeven: de volgende cron-ronde probeert opnieuw');
});

test('cron: niets te doen vandaag = geen melding, en ook niet elke 5 minuten opnieuw bekijken', async () => {
  const { call, pushes, rows } = await world({ subs: [{ summary: { days: { '2026-10-16': [0, 0] } } }] });
  const result = await (await call(cron, {})).json();
  assert.deepEqual({ sent: result.sent, skipped: result.skipped }, { sent: 0, skipped: 1 });
  assert.deepEqual(pushes, []);
  assert.equal(rows[0].last_notified_date, '2026-10-16');
});

test('test: stuurt direct naar de apparaten van de aanroeper, niet naar die van een ander', async () => {
  const { call, pushes } = await world({ subs: [{}, { user_id: 'user-b' }, { remind_time: '23:00' }] });
  const result = await (await call({ authorization: 'Bearer token-a' }, { test: true })).json();
  assert.deepEqual({ mode: result.mode, sent: result.sent }, { mode: 'test', sent: 2 });
  assert.deepEqual(pushes.sort(), [0, 2], 'ook als het tijdstip nog niet is aangebroken');
});

test('test: een aanvraag zonder { test: true } of voor een onbekend apparaat wordt netjes geweigerd', async () => {
  const { call, pushes } = await world({ subs: [{}] });
  assert.equal((await call({ authorization: 'Bearer token-a' }, { iets: 'anders' })).status, 400);
  assert.equal((await call({ authorization: 'Bearer token-b' }, { test: true })).status, 404, 'B heeft geen apparaat');
  assert.equal((await call({ authorization: 'Bearer token-a' }, { test: true, endpoint: 'https://push.example.org/99' })).status, 404);
  assert.deepEqual(pushes, []);
});

test('test: een testmelding laat vaker versturen toe en verandert niets aan "vandaag gemeld"', async () => {
  const { call, rows, pushes } = await world({ subs: [{}] });
  await call({ authorization: 'Bearer token-a' }, { test: true });
  await call({ authorization: 'Bearer token-a' }, { test: true });
  assert.deepEqual(pushes, [0, 0]);
  assert.equal(rows[0].last_notified_date, null);
});

// ---------------------------------------------------------------------------------------------
// Diagnose: het antwoord vertelt waarom er wel of geen melding kwam
// ---------------------------------------------------------------------------------------------
test('cron-antwoord: per apparaat de gegevens waarop "aan de beurt" gebaseerd is, zonder sleutels of namen van habits', async () => {
  const { call } = await world({ subs: [{}, { remind_time: '09:00' }] });
  const body = await (await call(cron, {})).json();
  assert.equal(body.checked, 2);
  assert.equal(body.at, '2026-10-16T06:05:00.000Z');
  assert.deepEqual(body.inspect.map((i) => [i.remind_time, i.local_time, i.local_date, i.due, i.planned_today]), [
    ['08:00', '08:05', '2026-10-16', true, [3, 1]],
    ['09:00', '08:05', '2026-10-16', false, [3, 1]],
  ]);
  const text = JSON.stringify(body);
  for (const secret of ['p256dh', 'auth', 'endpoint', 'push.example.org', 'Remco']) assert.ok(!text.includes(secret), `${secret} hoort niet in het antwoord`);
});

test('cron-antwoord: de beslissing per apparaat — verstuurd, al gemeld, niets gepland, verlopen of geweigerd', async () => {
  const { call } = await world({
    subs: [{}, { last_notified_date: '2026-10-16' }, { summary: { days: { '2026-10-16': [0, 0] } } }, {}, {}],
    pushStatus: { 3: 410, 4: 503 },
  });
  const body = await (await call(cron, {})).json();
  const outcomes = Object.fromEntries(body.decisions.map((d, i) => [i, d.outcome]));
  // het tweede apparaat is niet "due" (al gemeld), dus komt niet in de beslissingen
  assert.deepEqual(body.decisions.map((d) => d.outcome), ['verstuurd', 'niets_gepland_vandaag', 'abonnement_verlopen_410', 'push_dienst_weigerde_503'], JSON.stringify(outcomes));
  assert.deepEqual(body.inspect.map((i) => i.due), [true, false, true, true, true]);
});

test('cron-antwoord: een onbekende tijdzone staat als reden in de inspectie in plaats van een crash', async () => {
  const { call } = await world({ subs: [{ timezone: 'Mars/Olympus' }] });
  const body = await (await call(cron, {})).json();
  assert.equal(body.due, 0);
  assert.deepEqual([body.inspect[0].local_time, body.inspect[0].due, body.inspect[0].timezone], [null, false, 'Mars/Olympus']);
});

test('een al gemeld apparaat dat toch "due" lijkt (twee runs tegelijk) krijgt de beslissing "al_gemeld_vandaag"', async () => {
  const { call } = await world({ subs: [{}] });
  const [a, b] = await Promise.all([call(cron, {}), call(cron, {})]);
  const outcomes = [...(await a.json()).decisions, ...(await b.json()).decisions].map((d) => d.outcome).sort();
  assert.deepEqual(outcomes, ['al_gemeld_vandaag', 'verstuurd']);
});

// ---------------------------------------------------------------------------------------------
// Verzendtijd in de melding, en een testmelding met vertraging
// ---------------------------------------------------------------------------------------------
async function decryptFor(receiver, body) {
  const enc = new TextEncoder();
  const salt = body.slice(0, 16);
  const senderPublic = body.slice(21, 21 + body[20]);
  const peer = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, receiver.privateKey, 256));
  const hkdf = async (s, ikm, info, bytes) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
  const join = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));
  const prk = await hkdf(receiver.authSecret, shared, join(enc.encode('WebPush: info\0'), receiver.uaPublic, senderPublic), 32);
  const key = await crypto.subtle.importKey('raw', await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12) }, key, body.slice(21 + body[20])));
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
}

test('elke melding bevat het moment van versturen (sent), zodat de app de vertraging kan tonen', async () => {
  const { call, receivers, bodies } = await world({ subs: [{}] });
  await call(cron, {});
  const message = await decryptFor(receivers[0], bodies[0].body);
  assert.equal(message.sent, at(6, 5).getTime());
  assert.equal(message.title, 'Goedemorgen, Remco');
});

test('testmelding met vertraging: het antwoord komt direct (202), de melding volgt na de wachttijd, in de achtergrond', async () => {
  const { call, pushes, receivers, bodies } = await world({ subs: [{}] });
  const waits = [];
  const tasks = [];
  const response = await call({ authorization: 'Bearer token-a' }, { test: true, delaySeconds: 15 }, 'POST', at(6, 5), {
    sleep: async (ms) => { waits.push(ms); },
    background: (promise) => tasks.push(promise),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { mode: 'test', scheduled: true, delaySeconds: 15, devices: 1 });
  assert.deepEqual(pushes, [], 'nog niets verstuurd: dat gebeurt na de wachttijd');
  await Promise.all(tasks);
  assert.deepEqual(waits, [15000]);
  assert.deepEqual(pushes, [0]);
  const message = await decryptFor(receivers[0], bodies[0].body);
  assert.equal(message.title, 'Testmelding');
  assert.equal(message.sent, at(6, 5).getTime() + 15000, 'het verzendtijdstip is dat van het echte versturen, na de wachttijd');
});

test('testmelding met vertraging: hoogstens 30 seconden, en rommel of 0 betekent meteen versturen', async () => {
  const run = async (delaySeconds) => {
    const { call, pushes } = await world({ subs: [{}] });
    const waits = [];
    const tasks = [];
    const response = await call({ authorization: 'Bearer token-a' }, { test: true, delaySeconds }, 'POST', at(6, 5), { sleep: async (ms) => { waits.push(ms); }, background: (p) => tasks.push(p) });
    await Promise.all(tasks);
    return { status: response.status, waits, pushes: pushes.length };
  };
  assert.deepEqual(await run(500), { status: 202, waits: [30000], pushes: 1 });
  assert.deepEqual(await run(0), { status: 200, waits: [], pushes: 1 });
  assert.deepEqual(await run('abc'), { status: 200, waits: [], pushes: 1 });
  assert.deepEqual(await run(-5), { status: 200, waits: [], pushes: 1 });
});

test('testmelding met vertraging: een onbekend apparaat geeft ook dan een nette 404, zonder iets in te plannen', async () => {
  const { call } = await world({ subs: [{}] });
  const tasks = [];
  const response = await call({ authorization: 'Bearer token-b' }, { test: true, delaySeconds: 10 }, 'POST', at(6, 5), { sleep: async () => {}, background: (p) => tasks.push(p) });
  assert.equal(response.status, 404);
  assert.equal(tasks.length, 0);
});

// ---------------------------------------------------------------------------------------------
// De extra meldingen: avond (elke dag 23:00), weekreview open (zondag 18:00) en sluit bijna (maandag 23:30)
// ---------------------------------------------------------------------------------------------
const { dueExtras, composeExtra } = reminders;
// 2026-10-16 is een vrijdag, 18 oktober een zondag, 19 oktober een maandag (CEST, UTC+2)
const local = (day, hh, mm = 0) => new Date(Date.UTC(2026, 9, day, hh - 2, mm));
const on = (extra = {}) => sub({ notify_evening: true, notify_review: true, ...extra });
const kinds = (subscription, now) => dueExtras(subscription, now).map((extra) => extra.kind);
const reviewOnly = (extra = {}) => on({ notify_evening: false, ...extra });

test('dueExtras: de avondmelding komt elke dag vanaf 23:00, één keer, en alleen als hij aanstaat', () => {
  assert.deepEqual(kinds(on(), local(16, 22, 59)), []);
  assert.deepEqual(kinds(on(), local(16, 23, 0)), ['evening']);
  assert.deepEqual(kinds(on(), local(16, 23, 59)), ['evening']);
  assert.deepEqual(kinds(on(), local(17, 0, 0)), [], 'na middernacht is het een nieuwe dag, en die begint niet met een avondmelding');
  assert.deepEqual(kinds(on({ last_evening_date: '2026-10-16' }), local(16, 23, 5)), [], 'al gemeld vandaag');
  assert.deepEqual(kinds(on({ last_evening_date: '2026-10-15' }), local(16, 23, 5)), ['evening']);
  assert.deepEqual(kinds(on({ notify_evening: false }), local(16, 23, 5)), [], 'uit');
  assert.deepEqual(kinds(sub(), local(16, 23, 5)), [], 'een oudere app schrijft de kolommen niet: alles blijft uit');
});

test('dueExtras: de weekreview opent zondag 18:00 en sluit bijna maandag 23:30, niet op andere dagen of tijden', () => {
  assert.deepEqual(kinds(reviewOnly(), local(18, 17, 59)), []);
  assert.deepEqual(kinds(reviewOnly(), local(18, 18, 0)), ['review_open']);
  assert.deepEqual(kinds(reviewOnly(), local(18, 19, 55)), ['review_open']);
  assert.deepEqual(kinds(reviewOnly(), local(18, 20, 0)), [], 'te laat: dan liever niets');
  assert.deepEqual(kinds(reviewOnly(), local(17, 18, 0)), [], 'zaterdag 18:00: nog niet open');
  assert.deepEqual(kinds(reviewOnly(), local(19, 23, 29)), []);
  assert.deepEqual(kinds(reviewOnly(), local(19, 23, 30)), ['review_closing']);
  assert.deepEqual(kinds(reviewOnly(), local(19, 23, 57)), ['review_closing']);
  assert.deepEqual(kinds(reviewOnly(), local(19, 23, 58)), [], 'twee minuten voor sluiting heeft een melding geen zin meer');
  assert.deepEqual(kinds(reviewOnly({ last_review_open: '2026-10-18' }), local(18, 18, 5)), [], 'al gemeld');
  assert.deepEqual(kinds(on({ notify_review: false }), local(18, 18, 5)), [], 'uit');
  assert.deepEqual(kinds(on(), local(19, 23, 30)), ['evening', 'review_closing'], 'maandag 23:30 valt nog binnen het uur van de avondmelding');
});

test('dueExtras: rekent in de tijdzone van het apparaat en slaat een onbekende tijdzone over', () => {
  const newYork = on({ timezone: 'America/New_York' }); // 23:00 EDT = 03:00 UTC de volgende dag
  assert.deepEqual(kinds(newYork, new Date(Date.UTC(2026, 9, 17, 3, 0))), ['evening']);
  assert.deepEqual(kinds(newYork, local(16, 23, 0)), []);
  assert.deepEqual(kinds(on({ timezone: 'Mars/Olympus' }), local(16, 23, 0)), []);
});

test('composeExtra: avond: "Laatste sprintje?" met aantal, of "Wil je je dag afsluiten?" als alles gedaan is, anders niets', () => {
  const day = (entry) => on({ summary: { days: { '2026-10-16': entry } } });
  const evening = (entry) => composeExtra('evening', day(entry), local(16, 23, 0));
  assert.deepEqual(evening([4, 0, 0, 0, 0, 2, 1, 0]), { tag: 'evening-check', ttl: 7200, title: 'Laatste sprintje?', body: 'Nog 2 taken te doen vandaag.', url: './#/today' });
  assert.equal(evening([4, 0, 0, 0, 0, 1, 0, 0]).body, 'Nog 1 taak te doen vandaag.', 'ook als je dag al is afgesloten: er staat nog iets open');
  assert.equal(evening([4, 0, 0, 0, 0, 0, 1, 0]).title, 'Wil je je dag afsluiten?');
  assert.equal(evening([4, 0, 0, 0, 0, 0, 0, 0]), null, 'alles gedaan en de dag is afgesloten: stil');
  assert.equal(evening([4, 0, 0, 0, 0]), null, 'een oudere app: weten we niet, dus stil');
  assert.equal(composeExtra('evening', on(), local(16, 23, 0)), null, 'geen samenvatting voor vandaag');
});

test('composeExtra: weekreview: alleen als hij nog niet is ingevuld, en de link wijst naar de goede week', () => {
  const flagged = (date, flag) => on({ summary: { days: { [date]: [0, 0, 0, 0, 0, 0, 0, flag] } } });
  const open = composeExtra('review_open', flagged('2026-10-18', 1), local(18, 18, 0));
  assert.deepEqual([open.title, open.url, open.tag], ['Weekreview staat vanaf nu open', './#/stats?review=week&date=2026-10-18', 'review-open']);
  const closing = composeExtra('review_closing', flagged('2026-10-19', 1), local(19, 23, 30));
  assert.deepEqual([closing.title, closing.body, closing.url, closing.ttl], ['Weekreview staat nog open', 'Hij sluit vanavond om 23:59.', './#/stats?review=week&date=2026-10-18', 1500], 'maandag: de week die gisteren eindigde');
  assert.equal(composeExtra('review_open', flagged('2026-10-18', 0), local(18, 18, 0)), null, 'al ingevuld');
  assert.equal(composeExtra('review_closing', flagged('2026-10-19', 0), local(19, 23, 30)), null);
  assert.equal(composeExtra('onbekend', on(), local(18, 18, 0)), null);
});

test('composeMessage: staan de reviewmeldingen aan, dan zit de weekreview niet meer in de ochtendmelding', () => {
  const days = { '2026-10-16': [0, 0, 0, 1] };
  assert.equal(composeMessage(sub({ summary: { days } }), at(6)).body, 'Je weekterugblik staat klaar.');
  assert.equal(composeMessage(sub({ summary: { days }, notify_review: true }), at(6)), null, 'de review krijgt zijn eigen meldingen (zondag en maandag)');
});

test('cron: de avondmelding gaat om 23:00 naar wie hem aan heeft, één keer', async () => {
  const days = { '2026-10-16': [4, 0, 0, 0, 0, 3, 1, 0] };
  const { call, rows, pushes } = await world({ subs: [{ notify_evening: true, summary: { days } }, { summary: { days } }] });
  const result = await (await call(cron, {}, 'POST', local(16, 23, 0))).json();
  assert.deepEqual(pushes, [0], 'het toestel met de melding uit krijgt niets');
  assert.deepEqual(result.decisions.map((d) => [d.kind, d.outcome]), [['evening', 'verstuurd']]);
  assert.equal(rows[0].last_evening_date, '2026-10-16');
  assert.equal(rows[1].last_evening_date ?? null, null);
  const again = await (await call(cron, {}, 'POST', local(16, 23, 5))).json();
  assert.equal(again.sent, 0, 'een tweede ronde stuurt niets dubbel');
  assert.deepEqual(pushes, [0]);
});

test('cron: niets te melden om 23:00 = geen melding, en niet elke 5 minuten opnieuw bekijken', async () => {
  const { call, pushes, rows } = await world({ subs: [{ notify_evening: true, summary: { days: { '2026-10-16': [4, 0, 0, 0, 0, 0, 0, 0] } } }] });
  const result = await (await call(cron, {}, 'POST', local(16, 23, 0))).json();
  assert.deepEqual(result.decisions.map((d) => d.outcome), ['niets_te_melden']);
  assert.deepEqual(pushes, []);
  assert.equal(rows[0].last_evening_date, '2026-10-16');
});

test('cron: een storing bij de avondmelding wordt de volgende ronde opnieuw geprobeerd, een verlopen abonnement opgeruimd', async () => {
  const days = { '2026-10-16': [4, 0, 0, 0, 0, 3, 1, 0] };
  const { call, rows } = await world({ subs: [{ notify_evening: true, summary: { days } }, { notify_evening: true, summary: { days } }], pushStatus: { 0: 500, 1: 410 } });
  const result = await (await call(cron, {}, 'POST', local(16, 23, 0))).json();
  assert.deepEqual({ failed: result.failed, removed: result.removed }, { failed: 1, removed: 1 });
  assert.deepEqual(rows.map((row) => row.id), ['s0']);
  assert.equal(rows[0].last_evening_date ?? null, null, 'vrijgegeven');
});

test('cron: zondag 18:00 en maandag 23:30 sturen de weekreview-meldingen', async () => {
  const summary = { days: { '2026-10-18': [0, 0, 0, 0, 0, 0, 0, 1], '2026-10-19': [0, 0, 0, 1, 0, 0, 0, 1] } };
  const { call, rows, pushes } = await world({ subs: [{ notify_review: true, summary }] });
  const sunday = await (await call(cron, {}, 'POST', local(18, 18, 0))).json();
  assert.deepEqual(sunday.decisions.map((d) => [d.kind, d.outcome]), [['review_open', 'verstuurd']]);
  const monday = await (await call(cron, {}, 'POST', local(19, 23, 30))).json();
  assert.deepEqual(monday.decisions.map((d) => [d.kind, d.outcome]), [['review_closing', 'verstuurd']]);
  assert.deepEqual(pushes, [0, 0]);
  assert.deepEqual([rows[0].last_review_open, rows[0].last_review_closing], ['2026-10-18', '2026-10-19']);
});

test('cron-antwoord: de inspectie laat zien of de extra meldingen aanstaan en wat er aan de beurt is', async () => {
  const { call } = await world({ subs: [{ notify_evening: true }] });
  const body = await (await call(cron, {}, 'POST', local(16, 23, 0))).json();
  assert.deepEqual([body.inspect[0].notify_evening, body.inspect[0].notify_review, body.inspect[0].extras_due], [true, false, ['evening']]);
});

test('test: met een soort stuurt hij de echte tekst van die melding, ook als er nu niets te melden is', async () => {
  const { call, pushes } = await world({ subs: [{}] });
  const result = await (await call({ authorization: 'Bearer token-a' }, { test: true, kind: 'review_closing' })).json();
  assert.equal(result.sent, 1);
  assert.deepEqual(pushes, [0]);
});
