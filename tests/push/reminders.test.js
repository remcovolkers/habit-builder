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
  for (const [index, extra] of subs.entries()) {
    const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    rows.push({
      id: `s${index}`, user_id: 'user-a', endpoint: `https://push.example.org/${index}`,
      p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))),
      auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))),
      remind_time: '08:00', timezone: 'Europe/Amsterdam', summary: { name: 'Remco', days: { '2026-10-16': [3, 1] } }, last_notified_date: null,
      ...extra,
    });
  }
  const pushes = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.origin === 'https://push.example.org') {
      const index = Number(url.pathname.slice(1));
      pushes.push(index);
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
    if (url.searchParams.has('or')) { // de claim: alleen als nog niet van vandaag
      if (row && row.last_notified_date === patch.last_notified_date) return Response.json([]);
      if (!row) return Response.json([]);
      Object.assign(row, patch);
      return Response.json([row]);
    }
    Object.assign(row, patch);
    return new Response(null, { status: 204 });
  };
  const call = (headers, body, method = 'POST', now = at(6, 5)) =>
    handleRequest(new Request(`${SUPABASE}/functions/v1/send-reminders`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      { env: (name) => env[name], fetchImpl, now });
  return { rows, pushes, call, env };
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
