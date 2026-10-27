// De FCM-kant van send-reminders (Android-app): het service-account, het toegangstoken, het versturen, en de hele aanroep met
// app-toestellen naast browserabonnementen, tegen een nagebootste database en nagebootste diensten van Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminders } from './helpers.js';

const { parseServiceAccount, fcmAccessToken, sendFcm, handleRequest, b64uEncode, b64uDecode, FCM_CHANNEL_ID } = reminders;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Een echt RSA-sleutelpaar, en het service-account zoals Firebase dat als JSON geeft (PKCS#8-PEM met regeleinden). */
async function makeAccount(email = 'firebase-adminsdk@proj.iam.gserviceaccount.com') {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  const json = JSON.stringify({ type: 'service_account', project_id: 'habit-proj', client_email: email, private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' });
  return { pair, json, account: parseServiceAccount(json) };
}

// 2026-10-16 (CEST, UTC+2): 08:00 lokaal = 06:00 UTC
const NOW = Date.UTC(2026, 9, 16, 6, 5);

/** Nagebootst Google: een tokenpunt dat de JWT echt controleert, en FCM dat per token een antwoord geeft. */
function google({ publicKey, tokenStatus = 200, fcm = {} }) {
  const log = { tokenRequests: [], messages: [] };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [header, claims, signature] = form.get('assertion').split('.');
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64uDecode(signature), encoder.encode(`${header}.${claims}`));
      log.tokenRequests.push({ header: JSON.parse(decoder.decode(b64uDecode(header))), claims: JSON.parse(decoder.decode(b64uDecode(claims))), valid });
      if (tokenStatus !== 200) return new Response('{}', { status: tokenStatus });
      return Response.json({ access_token: `toegang-${log.tokenRequests.length}`, expires_in: 3600 });
    }
    assert.equal(url.origin + url.pathname, 'https://fcm.googleapis.com/v1/projects/habit-proj/messages:send');
    const body = JSON.parse(init.body);
    const authorization = new Headers(init.headers).get('authorization');
    log.messages.push({ authorization, message: body.message });
    const answer = fcm[body.message.token] ?? { status: 200 };
    const status = typeof answer === 'function' ? answer(log.messages.length) : answer.status;
    if (status === 200) return Response.json({ name: 'projects/habit-proj/messages/1' });
    return Response.json(answer.body ?? { error: { code: status, status: 'X' } }, { status });
  };
  return { fetchImpl, log };
}

const device = (token = 'tok-1') => ({ id: 'd1', fcm_token: token });
const message = { title: 'Goedemorgen, Remco', body: 'Vandaag staat 3 gewoontes op je lijst.', url: './#/today', sent: 1234 };

// ---------------------------------------------------------------------------------------------

test('parseServiceAccount: de JSON van Firebase, en niets anders', async () => {
  const { json } = await makeAccount();
  const account = parseServiceAccount(json);
  assert.equal(account.projectId, 'habit-proj');
  assert.equal(account.clientEmail, 'firebase-adminsdk@proj.iam.gserviceaccount.com');
  assert.match(account.privateKey, /BEGIN PRIVATE KEY/);
  for (const bad of ['', 'geen json', '{}', '[]', 'null', JSON.stringify({ project_id: 'p', client_email: 'e' }), JSON.stringify({ project_id: '', client_email: 'e', private_key: 'k' })]) {
    assert.equal(parseServiceAccount(bad), null, bad);
  }
});

test('toegangstoken: een JWT (RS256) die met de privésleutel is getekend en bij Google wordt ingewisseld', async () => {
  const { pair, account } = await makeAccount('a@proj.iam.gserviceaccount.com');
  const { fetchImpl, log } = google({ publicKey: pair.publicKey });
  assert.equal(await fcmAccessToken({ account, fetchImpl, now: NOW }), 'toegang-1');
  const [request] = log.tokenRequests;
  assert.equal(request.valid, true, 'de handtekening klopt met de publieke sleutel');
  assert.deepEqual(request.header, { alg: 'RS256', typ: 'JWT' });
  assert.equal(request.claims.iss, 'a@proj.iam.gserviceaccount.com');
  assert.equal(request.claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(request.claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(request.claims.iat, Math.floor(NOW / 1000));
  assert.equal(request.claims.exp, Math.floor(NOW / 1000) + 3600);
});

test('toegangstoken: wordt bewaard tot kort voor het verloopt, en `force` haalt een nieuw', async () => {
  const { pair, account } = await makeAccount('b@proj.iam.gserviceaccount.com');
  const { fetchImpl, log } = google({ publicKey: pair.publicKey });
  await fcmAccessToken({ account, fetchImpl, now: NOW });
  assert.equal(await fcmAccessToken({ account, fetchImpl, now: NOW + 30 * 60_000 }), 'toegang-1');
  assert.equal(log.tokenRequests.length, 1, 'een half uur later: hetzelfde token');
  assert.equal(await fcmAccessToken({ account, fetchImpl, now: NOW + 3600_000 - 30_000 }), 'toegang-2', 'binnen een minuut voor het verlopen: vernieuwen');
  assert.equal(await fcmAccessToken({ account, fetchImpl, now: NOW + 3600_000 - 20_000, force: true }), 'toegang-3');
});

test('toegangstoken: een weigering van Google is een fout met de status, zonder sleutelmateriaal', async () => {
  const { pair, account } = await makeAccount('c@proj.iam.gserviceaccount.com');
  const { fetchImpl } = google({ publicKey: pair.publicKey, tokenStatus: 400 });
  await assert.rejects(fcmAccessToken({ account, fetchImpl, now: NOW }), (error) => /400/.test(error.message) && !/PRIVATE KEY/.test(error.message));
});

test('sendFcm: een notificatiebericht met hoge prioriteit, het meldingskanaal en de url in data', async () => {
  const { pair, account } = await makeAccount('d@proj.iam.gserviceaccount.com');
  const { fetchImpl, log } = google({ publicKey: pair.publicKey });
  const outcome = await sendFcm({ device: device('tok-d'), message, account, fetchImpl, now: NOW });
  assert.deepEqual(outcome, { status: 200, ok: true, gone: false });
  const [{ authorization, message: sent }] = log.messages;
  assert.equal(authorization, 'Bearer toegang-1');
  assert.deepEqual(sent, {
    token: 'tok-d',
    notification: { title: 'Goedemorgen, Remco', body: 'Vandaag staat 3 gewoontes op je lijst.' },
    data: { url: './#/today', sent: '1234' }, // alles in data is tekst
    android: {
      priority: 'HIGH', ttl: '43200s', collapse_key: 'morning-reminder',
      notification: { channel_id: FCM_CHANNEL_ID, tag: 'morning-reminder' },
    },
  });
  assert.equal(FCM_CHANNEL_ID, 'morning-reminder');
});

test('sendFcm: een verlopen of onbekend token (404, UNREGISTERED, ongeldig formaat) is "gone"; een storing of weigering niet', async () => {
  const { pair, account } = await makeAccount('e@proj.iam.gserviceaccount.com');
  const { fetchImpl } = google({
    publicKey: pair.publicKey,
    fcm: {
      weg: { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } } },
      kapot: { status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } } },
      anders400: { status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } } },
      storing: { status: 503 },
      verboden: { status: 403, body: { error: { code: 403, status: 'PERMISSION_DENIED' } } },
    },
  });
  const run = (token) => sendFcm({ device: device(token), message, account, fetchImpl, now: NOW });
  assert.deepEqual(await run('weg'), { status: 404, ok: false, gone: true });
  assert.deepEqual(await run('kapot'), { status: 400, ok: false, gone: true });
  assert.deepEqual(await run('anders400'), { status: 400, ok: false, gone: false }, 'een fout in ons bericht is niet de schuld van het toestel');
  assert.deepEqual(await run('storing'), { status: 503, ok: false, gone: false });
  assert.deepEqual(await run('verboden'), { status: 403, ok: false, gone: false });
});

test('sendFcm: bij een 401 (het bewaarde toegangstoken is ingetrokken) één keer een vers token en opnieuw', async () => {
  const { pair, account } = await makeAccount('f@proj.iam.gserviceaccount.com');
  const { fetchImpl, log } = google({ publicKey: pair.publicKey, fcm: { 'tok-f': (n) => (n === 1 ? 401 : 200) } });
  const outcome = await sendFcm({ device: device('tok-f'), message, account, fetchImpl, now: NOW });
  assert.equal(outcome.ok, true);
  assert.deepEqual(log.messages.map((m) => m.authorization), ['Bearer toegang-1', 'Bearer toegang-2']);
});

// ---------------------------------------------------------------------------------------------
// De hele aanroep: app-toestellen naast browserabonnementen
// ---------------------------------------------------------------------------------------------
const SUPABASE = 'https://proj.supabase.co';
const cron = { 'x-cron-secret': 'geheim' };

async function world({ rows: initial, accountJson, fcm = {}, webStatus = 201 }) {
  const { pair, account, json } = await makeAccount(`w${Math.random().toString(36).slice(2)}@proj.iam.gserviceaccount.com`);
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env = {
    SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'service-key', CRON_SECRET: 'geheim', VAPID_SUBJECT: 'mailto:a@b.nl',
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', vapid.privateKey)).d,
    VAPID_PUBLIC_KEY: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey))),
    FCM_SERVICE_ACCOUNT: accountJson === undefined ? json : accountJson,
  };
  if (env.FCM_SERVICE_ACCOUNT === null) delete env.FCM_SERVICE_ACCOUNT;
  const rows = initial.map((row) => ({ remind_time: '08:00', timezone: 'Europe/Amsterdam', summary: { name: 'Remco', days: { '2026-10-16': [3, 1] } }, last_notified_date: null, user_id: 'user-a', ...row }));
  const { fetchImpl: googleFetch, log } = google({ publicKey: pair.publicKey, fcm });
  const webPushes = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.origin === 'https://push.example.org') {
      webPushes.push(url.pathname);
      return new Response(null, { status: webStatus });
    }
    if (url.origin !== SUPABASE) return googleFetch(input, init);
    if (url.pathname === '/auth/v1/user') return new Headers(init.headers).get('authorization') === 'Bearer token-a' ? Response.json({ id: 'user-a' }) : new Response('{}', { status: 401 });
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
    const patch = JSON.parse(init.body);
    if (url.searchParams.has('or')) { // de claim
      if (!row || row.last_notified_date === patch.last_notified_date) return Response.json([]);
      Object.assign(row, patch);
      return Response.json([row]);
    }
    Object.assign(row, patch);
    return new Response(null, { status: 204 });
  };
  const call = (headers, body, now = new Date(NOW)) => handleRequest(
    new Request(`${SUPABASE}/functions/v1/send-reminders`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    { env: (name) => env[name], fetchImpl, now });
  return { rows, call, log, webPushes };
}

const app = (id, token, extra = {}) => ({ id, platform: 'android', fcm_token: token, endpoint: null, p256dh: null, auth: null, ...extra });
async function web(id) {
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    id, platform: 'web', fcm_token: null, endpoint: `https://push.example.org/${id}`,
    p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
}

test('cron: een app-toestel en een browser krijgen allebei hun melding, en elk wordt als gemeld gemarkeerd', async () => {
  const { rows, call, log, webPushes } = await world({ rows: [app('a1', 'tok-app'), await web('w1')] });
  const body = await (await call(cron, {})).json();
  assert.equal(body.sent, 2);
  assert.deepEqual(webPushes, ['/w1']);
  assert.equal(log.messages.length, 1);
  assert.equal(log.messages[0].message.token, 'tok-app');
  assert.equal(log.messages[0].message.notification.title, 'Goedemorgen, Remco');
  assert.ok(rows.every((row) => row.last_notified_date === '2026-10-16'));
  assert.deepEqual(body.decisions.map((d) => d.outcome), ['verstuurd', 'verstuurd']);
  assert.deepEqual(body.inspect.map((i) => i.platform).sort(), ['android', 'web']);
});

test('cron: een tweede run in dezelfde ochtend stuurt het app-toestel niets meer', async () => {
  const { call, log } = await world({ rows: [app('a1', 'tok-app')] });
  await call(cron, {});
  const second = await (await call(cron, {}, new Date(NOW + 5 * 60_000))).json();
  assert.equal(second.sent, 0);
  assert.equal(log.messages.length, 1);
});

test('cron: een afgemeld app-toestel (UNREGISTERED) wordt opgeruimd en de rest gaat door', async () => {
  const unregistered = { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } };
  const { rows, call } = await world({ rows: [app('a1', 'tok-weg'), app('a2', 'tok-goed')], fcm: { 'tok-weg': unregistered } });
  const body = await (await call(cron, {})).json();
  assert.equal(body.removed, 1);
  assert.equal(body.sent, 1);
  assert.deepEqual(rows.map((row) => row.id), ['a2']);
});

test('cron: een storing bij FCM geeft de rij vrij, zodat de volgende ronde het opnieuw probeert', async () => {
  const { rows, call } = await world({ rows: [app('a1', 'tok-1')], fcm: { 'tok-1': { status: 503 } } });
  const body = await (await call(cron, {})).json();
  assert.equal(body.failed, 1);
  assert.equal(rows[0].last_notified_date, null);
  assert.equal(body.decisions[0].outcome, 'push_dienst_weigerde_503');
});

test('cron: zonder FCM_SERVICE_ACCOUNT slaat de functie app-toestellen over, laat de rij vrij en blijft Web Push sturen', async () => {
  for (const accountJson of [null, 'kapot']) {
    const { rows, call, webPushes } = await world({ rows: [app('a1', 'tok-app'), await web('w1')], accountJson });
    const body = await (await call(cron, {})).json();
    assert.equal(body.sent, 1, String(accountJson));
    assert.equal(body.failed, 1);
    assert.deepEqual(webPushes, ['/w1']);
    assert.equal(body.decisions.find((d) => d.id === 'a1').outcome, 'fcm_niet_ingesteld');
    assert.equal(rows.find((row) => row.id === 'a1').last_notified_date, null);
    assert.equal(rows.find((row) => row.id === 'w1').last_notified_date, '2026-10-16');
  }
});

test('cron: een melding in het antwoord bevat geen token of service-account', async () => {
  const { call } = await world({ rows: [app('a1', 'tok-geheim-123')] });
  const text = JSON.stringify(await (await call(cron, {})).json());
  assert.ok(!text.includes('tok-geheim-123'));
  assert.ok(!text.includes('PRIVATE KEY'));
});

test('test: wijst een app-toestel aan met zijn token en stuurt alleen daarheen', async () => {
  const { call, log, webPushes } = await world({ rows: [app('a1', 'tok-1'), app('a2', 'tok-2'), await web('w1')] });
  const response = await call({ authorization: 'Bearer token-a' }, { test: true, token: 'tok-2' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sent, 1);
  assert.deepEqual(log.messages.map((m) => m.message.token), ['tok-2']);
  assert.equal(log.messages[0].message.notification.title, 'Testmelding');
  assert.deepEqual(webPushes, []);
});

test('test: een onbekend token geeft een nette 404, en zonder inlogsessie is er geen toegang', async () => {
  const { call, log } = await world({ rows: [app('a1', 'tok-1')] });
  assert.equal((await call({ authorization: 'Bearer token-a' }, { test: true, token: 'bestaat-niet' })).status, 404);
  assert.equal((await call({}, { test: true, token: 'tok-1' })).status, 401);
  assert.equal(log.messages.length, 0);
});
