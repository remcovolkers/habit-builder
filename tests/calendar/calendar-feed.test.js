// De Edge Function calendar-feed: wie mag, welke adressen, wat er mis kan gaan bij Google, en dat het adres nergens uitlekt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEED_HOSTS as APP_HOSTS, FEED_PATH as APP_PATH } from '../../src/domain/agenda.js';
import { GOOGLE_URL, ICS, env, fakeNetwork, feed, post } from './helpers.js';

const { handleRequest, checkFeedUrl, readLimited } = feed;
const run = (body, network = fakeNetwork(), extra = {}) => handleRequest(post(body, extra.headers), { env: env(), fetchImpl: network.fetchImpl, timeoutMs: 200 });

test('de lijst van toegestane hosts en het pad zijn in de app en op de server hetzelfde', () => {
  assert.deepEqual(feed.FEED_HOSTS, [...APP_HOSTS]);
  assert.equal(feed.FEED_PATH.source, APP_PATH.source);
});

test('adressen: alleen een geheim iCal-adres van Google, ook als webcal://', () => {
  assert.equal(checkFeedUrl(GOOGLE_URL), GOOGLE_URL);
  assert.equal(checkFeedUrl(GOOGLE_URL.replace('https://', 'webcal://')), GOOGLE_URL);
  assert.equal(checkFeedUrl('https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics'), 'https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics');
  for (const bad of [
    'http://calendar.google.com/calendar/ical/a/private-1/basic.ics',
    'https://evil.example.com/calendar/ical/a/private-1/basic.ics',
    'https://calendar.google.com.evil.example.com/calendar/ical/a/private-1/basic.ics',
    'https://user:pw@calendar.google.com/calendar/ical/a/private-1/basic.ics',
    'https://calendar.google.com:8443/calendar/ical/a/private-1/basic.ics',
    'https://calendar.google.com/calendar/u/0/r',
    'https://calendar.google.com/calendar/ical/a/private-1/basic.ics/../../../x',
    'http://169.254.169.254/latest/meta-data',
    'file:///etc/passwd',
    '',
    null,
    'geen adres',
  ]) assert.equal(checkFeedUrl(bad), null, String(bad));
});

test('zonder inlogsessie geen agenda, en de agenda wordt dan ook niet opgehaald', async () => {
  const network = fakeNetwork();
  assert.equal((await run({ url: GOOGLE_URL }, network, { headers: {} })).status, 401);
  assert.equal(network.calls.length, 0);
  const wrongSession = fakeNetwork({ user: null });
  assert.equal((await run({ url: GOOGLE_URL }, wrongSession)).status, 401);
  assert.deepEqual(wrongSession.calls.map((c) => new URL(c.url).hostname), ['project.supabase.test'], 'alleen Supabase is gevraagd, Google niet');
});

test('een ongeldig of vreemd adres wordt geweigerd zonder dat er iets wordt opgehaald', async () => {
  const network = fakeNetwork();
  const response = await run({ url: 'https://evil.example.com/calendar/ical/a/private-1/basic.ics' }, network);
  assert.equal(response.status, 400);
  assert.equal(network.calls.filter((c) => !c.url.includes('supabase')).length, 0);
  assert.equal((await run({}, network)).status, 400);
});

test('een geldig adres geeft de agenda, met een tijdslimiet en zonder doorverwijzingen te volgen naar andere hosts', async () => {
  const network = fakeNetwork();
  const response = await run({ url: GOOGLE_URL }, network);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ics: ICS });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const google = network.calls.find((c) => c.url === GOOGLE_URL);
  assert.equal(google.init.redirect, 'manual');
  assert.ok(google.init.signal, 'met een tijdslimiet');
});

test('een doorverwijzing naar een andere host (zoals inloggen) volgen we niet: het adres werkt niet meer', async () => {
  const network = fakeNetwork({ google: () => new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/signin' } }) });
  assert.deepEqual(await (await run({ url: GOOGLE_URL }, network)).json(), { ok: false, reason: 'not_found' });
  assert.equal(network.calls.filter((c) => !c.url.includes('supabase')).length, 1);
});

test('een doorverwijzing binnen dezelfde host mag, maar niet eindeloos', async () => {
  const moved = GOOGLE_URL.replace('private-0123456789abcdef', 'private-fedcba9876543210');
  const network = fakeNetwork({ google: (url) => (url === GOOGLE_URL ? new Response(null, { status: 301, headers: { location: moved } }) : new Response(ICS, { status: 200 })) });
  assert.equal((await (await run({ url: GOOGLE_URL }, network)).json()).ok, true);
  assert.ok(network.calls.some((c) => c.url === moved));
  const endless = fakeNetwork({ google: () => new Response(null, { status: 302, headers: { location: GOOGLE_URL } }) });
  assert.deepEqual(await (await run({ url: GOOGLE_URL }, endless)).json(), { ok: false, reason: 'unavailable' });
});

test('wat er mis kan gaan bij Google, in woorden die de app kan vertalen', async () => {
  const outcome = async (google) => (await (await run({ url: GOOGLE_URL }, fakeNetwork({ google }))).json());
  assert.deepEqual(await outcome(() => new Response('nee', { status: 404 })), { ok: false, reason: 'not_found' });
  assert.deepEqual(await outcome(() => new Response('nee', { status: 403 })), { ok: false, reason: 'not_found' });
  assert.deepEqual(await outcome(() => new Response('stuk', { status: 500 })), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await outcome(() => new Response('<html>Log in</html>', { status: 200 })), { ok: false, reason: 'not_calendar' });
  assert.deepEqual(await outcome(() => { throw new TypeError('netwerk'); }), { ok: false, reason: 'unavailable' });
  const slow = await outcome((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })))));
  assert.deepEqual(slow, { ok: false, reason: 'timeout' });
});

test('te groot: we stoppen met lezen zodra het over de grens gaat', async () => {
  assert.equal(await readLimited(new Response('x'.repeat(100)), 50), null);
  assert.equal(await readLimited(new Response('x'.repeat(50)), 50), 'x'.repeat(50));
  const big = fakeNetwork({ google: () => new Response('BEGIN:VCALENDAR\r\n' + 'x'.repeat(feed.MAX_BYTES + 10), { status: 200 }) });
  assert.deepEqual(await (await run({ url: GOOGLE_URL }, big)).json(), { ok: false, reason: 'too_large' });
});

test('het geheime adres staat nergens in het antwoord of in de logs, ook niet bij een fout', async () => {
  const logged = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => logged.push(a.join(' '));
  console.error = console.log;
  console.warn = console.log;
  try {
    for (const google of [() => new Response('nee', { status: 404 }), () => { throw new Error(`kapot bij ${GOOGLE_URL}`); }, () => new Response(ICS)]) {
      const body = await (await run({ url: GOOGLE_URL }, fakeNetwork({ google }))).text();
      assert.ok(!body.includes('private-0123456789abcdef'));
    }
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

test('een ontbrekende instelling wordt gemeld als niet ingesteld; andere methoden en CORS', async () => {
  const response = await handleRequest(post({ url: GOOGLE_URL }), { env: () => undefined, fetchImpl: fakeNetwork().fetchImpl });
  assert.equal(response.status, 500);
  assert.deepEqual((await response.json()).missing, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  const get = await handleRequest(new Request('https://functions.test/calendar-feed'), { env: env(), fetchImpl: fakeNetwork().fetchImpl });
  assert.equal(get.status, 405);
  const options = await handleRequest(new Request('https://functions.test/calendar-feed', { method: 'OPTIONS' }), { env: env(), fetchImpl: fakeNetwork().fetchImpl });
  assert.equal(options.status, 204);
});
