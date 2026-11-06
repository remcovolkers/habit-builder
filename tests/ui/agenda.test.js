// De agenda in de app: koppelen, bewaren op dit toestel, verversen en samenvoegen van twee bronnen (docs/AGENDA.md). Zonder netwerk, opslag of telefoon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgenda } from '../../src/ui/agenda.js';

const GOOGLE = 'https://calendar.google.com/calendar/ical/remco%40example.com/private-0123456789abcdef/basic.ics';
const TODAY = '2026-11-02';
const NOW = Date.parse('2026-11-02T09:00:00Z');
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const TANDARTS = ['UID:t1', 'SUMMARY:Tandarts', 'DTSTART;TZID=Europe/Amsterdam:20261104T143000', 'DTEND;TZID=Europe/Amsterdam:20261104T153000'];
const LUNCH = ['UID:l1', 'SUMMARY:Lunch', 'DTSTART;TZID=Europe/Amsterdam:20261104T123000', 'DTEND;TZID=Europe/Amsterdam:20261104T133000'];

function setup({ signedIn = true, online = true, texts = [ics(TANDARTS, LUNCH)], device = null, stored = {} } = {}) {
  const store = new Map(Object.entries(stored));
  const clock = { now: NOW };
  const notified = [];
  const calls = { fetch: [], device: [] };
  let nextText = 0;
  const deviceState = { available: device !== null, access: device?.access ?? 'prompt', onRequest: device?.onRequest ?? 'granted', events: device?.events ?? [] };
  const world = { signedIn, online, fail: null };
  const agenda = createAgenda({
    storage: { get: (key) => store.get(key) ?? null, set: (key, value) => store.set(key, value), remove: (key) => store.delete(key) },
    now: () => clock.now,
    today: () => TODAY,
    zone: () => 'Europe/Amsterdam',
    signedIn: () => world.signedIn,
    online: () => world.online,
    getClient: async () => ({ client: true }),
    fetchText: async ({ url }) => {
      calls.fetch.push(url);
      if (world.fail) return { ok: false, reason: world.fail };
      return { ok: true, text: texts[Math.min(nextText++, texts.length - 1)] };
    },
    device: {
      available: () => deviceState.available,
      access: async () => deviceState.access,
      request: async () => { calls.device.push('request'); deviceState.access = deviceState.onRequest; return deviceState.access; },
      read: async (range) => { calls.device.push(range); return deviceState.events; },
    },
    notify: () => notified.push('view'),
  });
  return { agenda, store, clock, notified, calls, world, deviceState };
}

const titles = (items) => items.map((i) => `${i.date} ${i.start ?? 'dag'} ${i.title}`);

test('koppelen: het adres wordt gecontroleerd, de agenda opgehaald en pas daarna bewaard; Vandaag wordt opnieuw getekend', async () => {
  const { agenda, store, calls, notified } = setup();
  const result = await agenda.connectFeed(`  ${GOOGLE}  `);
  assert.deepEqual(result, { ok: true, count: 2 });
  assert.deepEqual(calls.fetch, [GOOGLE]);
  assert.equal(agenda.model.feedUrl, GOOGLE);
  assert.deepEqual(titles(agenda.itemsFor('2026-11-04')), ['2026-11-04 12:30 Lunch', '2026-11-04 14:30 Tandarts']);
  assert.deepEqual(JSON.parse(store.get('hb-agenda')), { feedUrl: GOOGLE, device: false });
  assert.ok(JSON.parse(store.get('hb-agenda-cache')).feed.items.length === 2);
  assert.ok(notified.length > 0);
});

test('koppelen: een verkeerd adres, geen account of geen internet haalt niets op en bewaart niets', async () => {
  const wrong = setup();
  assert.deepEqual(await wrong.agenda.connectFeed('https://evil.example.com/x'), { ok: false, reason: 'host' });
  assert.deepEqual(await wrong.agenda.connectFeed(''), { ok: false, reason: 'empty' });
  assert.equal(wrong.calls.fetch.length, 0);
  assert.equal(wrong.store.size, 0);

  const anonymous = setup({ signedIn: false });
  assert.deepEqual(await anonymous.agenda.connectFeed(GOOGLE), { ok: false, reason: 'signed_out' });
  const offline = setup({ online: false });
  assert.deepEqual(await offline.agenda.connectFeed(GOOGLE), { ok: false, reason: 'offline' });
  assert.equal(anonymous.calls.fetch.length + offline.calls.fetch.length, 0);
});

test('koppelen: werkt het adres niet, dan blijft alles zoals het was en wordt het adres niet bewaard', async () => {
  const { agenda, store, world } = setup();
  world.fail = 'not_found';
  assert.deepEqual(await agenda.connectFeed(GOOGLE), { ok: false, reason: 'not_found' });
  assert.equal(agenda.model.feedUrl, null);
  assert.equal(agenda.model.feedError, null);
  assert.equal(store.has('hb-agenda'), false);

  world.fail = null;
  await agenda.connectFeed(GOOGLE);
  world.fail = 'unavailable';
  const other = GOOGLE.replace('private-0123456789abcdef', 'private-aaaa');
  assert.deepEqual(await agenda.connectFeed(other), { ok: false, reason: 'unavailable' });
  assert.equal(agenda.model.feedUrl, GOOGLE, 'het oude adres blijft gekoppeld');
  assert.equal(agenda.itemsFor('2026-11-04').length, 2);
});

test('verversen: een verse agenda wordt niet opnieuw opgehaald, een oude wel, en "nu" altijd', async () => {
  const { agenda, clock, calls } = setup();
  await agenda.connectFeed(GOOGLE);
  assert.equal(calls.fetch.length, 1);
  await agenda.refresh();
  assert.equal(calls.fetch.length, 1, 'net opgehaald');
  clock.now += 29 * 60_000;
  await agenda.refresh();
  assert.equal(calls.fetch.length, 1, 'nog geen half uur');
  clock.now += 2 * 60_000;
  await agenda.refresh();
  assert.equal(calls.fetch.length, 2, 'ouder dan een half uur');
  await agenda.refresh({ force: true });
  assert.equal(calls.fetch.length, 3);
});

test('verversen: zonder account of internet gebeurt er niets, en een mislukte poging laat de oude agenda staan met de reden erbij', async () => {
  const { agenda, clock, calls, world } = setup();
  await agenda.connectFeed(GOOGLE);
  clock.now += 60 * 60_000;

  world.online = false;
  await agenda.refresh();
  assert.equal(calls.fetch.length, 1);
  world.online = true;
  world.signedIn = false;
  await agenda.refresh();
  assert.equal(calls.fetch.length, 1);

  world.signedIn = true;
  world.fail = 'timeout';
  await agenda.refresh();
  assert.equal(agenda.model.feedError, 'timeout');
  assert.equal(agenda.itemsFor('2026-11-04').length, 2, 'een agenda die even niet bereikbaar is, is niet leeg');
  world.fail = null;
  await agenda.refresh({ force: true });
  assert.equal(agenda.model.feedError, null);
});

test('verversingen lopen een voor een, ook als ze door elkaar worden aangeroepen', async () => {
  const { agenda, calls } = setup();
  await agenda.connectFeed(GOOGLE);
  await Promise.all([agenda.refresh({ force: true }), agenda.refresh({ force: true }), agenda.refresh()]);
  assert.equal(calls.fetch.length, 3, 'de koppeling en twee geforceerde verversingen; de derde vond het vers genoeg');
});

test('een nieuwe versie van de agenda vervangt de oude: een verplaatste afspraak staat niet dubbel', async () => {
  const moved = ['UID:t1', 'SUMMARY:Tandarts', 'DTSTART;TZID=Europe/Amsterdam:20261105T090000', 'DTEND;TZID=Europe/Amsterdam:20261105T100000'];
  const { agenda } = setup({ texts: [ics(TANDARTS), ics(moved)] });
  await agenda.connectFeed(GOOGLE);
  await agenda.refresh({ force: true });
  assert.deepEqual(agenda.itemsFor('2026-11-04'), []);
  assert.deepEqual(titles(agenda.itemsFor('2026-11-05')), ['2026-11-05 09:00 Tandarts']);
});

test('na een herstart staat alles er weer: adres, afspraken en de keuze voor de telefoon', async () => {
  const first = setup();
  await first.agenda.connectFeed(GOOGLE);
  const second = setup({ stored: Object.fromEntries(first.store) });
  assert.equal(second.agenda.model.feedUrl, null, 'voor het laden is er niets');
  second.agenda.load();
  assert.equal(second.agenda.model.feedUrl, GOOGLE);
  assert.equal(second.agenda.itemsFor('2026-11-04').length, 2);
  assert.equal(second.calls.fetch.length, 0, 'laden haalt niets op');
});

test('kapotte of aangepaste opslag levert een lege agenda op, geen fout en geen adres dat we niet zouden toestaan', () => {
  const evil = setup({ stored: { 'hb-agenda': JSON.stringify({ feedUrl: 'https://evil.example.com/calendar/ical/a/private-1/basic.ics', device: false }), 'hb-agenda-cache': '{kapot' } });
  evil.agenda.load();
  assert.equal(evil.agenda.model.feedUrl, null);
  assert.deepEqual(evil.agenda.itemsFor('2026-11-04'), []);
  const junk = setup({ stored: { 'hb-agenda': 'geen json', 'hb-agenda-cache': '[1,2]' } });
  junk.agenda.load();
  assert.equal(junk.agenda.model.feedUrl, null);
});

test('ontkoppelen en alles wissen (uitloggen) halen het adres en de afspraken weg', async () => {
  const { agenda, store } = setup();
  await agenda.connectFeed(GOOGLE);
  agenda.disconnectFeed();
  assert.equal(agenda.model.feedUrl, null);
  assert.deepEqual(agenda.itemsFor('2026-11-04'), []);
  assert.equal(store.has('hb-agenda'), false);

  await agenda.connectFeed(GOOGLE);
  agenda.clear();
  assert.equal(store.size, 0, 'niets blijft achter op het toestel');
  assert.equal(agenda.model.feedUrl, null);
});

const DEVICE_EVENTS = [
  { id: 7, title: 'Tandarts', begin: Date.UTC(2026, 10, 4, 13, 30), end: Date.UTC(2026, 10, 4, 14, 30), allDay: false, calendar: 'Mel' },
  { id: 8, title: 'Verjaardag Anna', begin: Date.UTC(2026, 10, 5), end: Date.UTC(2026, 10, 6), allDay: true },
];

test('telefoon: de toestemming wordt gevraagd, daarna staan de afspraken van de telefoon op Vandaag', async () => {
  const { agenda, calls, store } = setup({ signedIn: false, device: { access: 'prompt', onRequest: 'granted', events: DEVICE_EVENTS } });
  assert.deepEqual(await agenda.enableDevice(), { ok: true });
  assert.ok(calls.device.includes('request'));
  assert.equal(agenda.model.device, true);
  assert.deepEqual(titles(agenda.itemsFor('2026-11-04')), ['2026-11-04 14:30 Tandarts']);
  assert.deepEqual(titles(agenda.itemsFor('2026-11-05')), ['2026-11-05 dag Verjaardag Anna']);
  assert.deepEqual(JSON.parse(store.get('hb-agenda')), { feedUrl: null, device: true });
  const range = calls.device.find((c) => typeof c === 'object');
  assert.ok(range.begin < Date.UTC(2026, 9, 19) && range.end > Date.UTC(2026, 10, 16), 'het hele venster, met speling');
});

test('telefoon: geen toestemming betekent niet aanzetten, met de reden; zonder app is het niet beschikbaar', async () => {
  const denied = setup({ device: { access: 'prompt', onRequest: 'denied' } });
  assert.deepEqual(await denied.agenda.enableDevice(), { ok: false, reason: 'denied' });
  assert.equal(denied.agenda.model.device, false);
  assert.equal(denied.store.has('hb-agenda'), false);
  const browser = setup();
  assert.deepEqual(await browser.agenda.enableDevice(), { ok: false, reason: 'unavailable' });
});

test('telefoon: wordt de toestemming later ingetrokken, dan verdwijnen de afspraken en zegt de kaart waarom', async () => {
  const { agenda, clock, deviceState } = setup({ device: { access: 'granted', events: DEVICE_EVENTS } });
  await agenda.enableDevice();
  assert.equal(agenda.itemsFor('2026-11-04').length, 1);
  deviceState.access = 'denied';
  clock.now += 5 * 60_000;
  await agenda.refresh();
  assert.equal(agenda.model.deviceAccess, 'denied');
  assert.deepEqual(agenda.itemsFor('2026-11-04'), []);
  assert.equal(agenda.model.device, true, 'de keuze blijft staan: zet je het weer aan in Android, dan werkt het weer');
});

test('telefoon: de telefoon wordt niet elke seconde gelezen', async () => {
  const { agenda, clock, calls } = setup({ device: { access: 'granted', events: DEVICE_EVENTS } });
  await agenda.enableDevice();
  const reads = () => calls.device.filter((c) => typeof c === 'object').length;
  const first = reads();
  await agenda.refresh();
  assert.equal(reads(), first);
  clock.now += 61_000;
  await agenda.refresh();
  assert.equal(reads(), first + 1);
});

test('twee bronnen: dezelfde afspraak van de telefoon en uit de feed staat één keer op Vandaag, de telefoon wint', async () => {
  const { agenda } = setup({ device: { access: 'granted', events: DEVICE_EVENTS } });
  await agenda.enableDevice();
  await agenda.connectFeed(GOOGLE);
  assert.deepEqual(titles(agenda.itemsFor('2026-11-04')), ['2026-11-04 12:30 Lunch', '2026-11-04 14:30 Tandarts']);
  assert.ok(agenda.itemsFor('2026-11-04').some((i) => i.id.startsWith('device|')), 'de afspraak van de telefoon wint');
});

test('telefoon uitzetten laat de feed staan, en andersom', async () => {
  const { agenda } = setup({ device: { access: 'granted', events: DEVICE_EVENTS } });
  await agenda.enableDevice();
  await agenda.connectFeed(GOOGLE);
  agenda.disableDevice();
  assert.deepEqual(titles(agenda.itemsFor('2026-11-04')), ['2026-11-04 12:30 Lunch', '2026-11-04 14:30 Tandarts']);
  assert.ok(agenda.itemsFor('2026-11-04').every((i) => !i.id.startsWith('device|')));
  agenda.disconnectFeed();
  assert.deepEqual(agenda.itemsFor('2026-11-04'), []);
});

test('afvinken: een afspraak uit je agenda vink je af en weer open, met ongedaan maken, en het blijft op het toestel staan', async () => {
  const { agenda, store, notified } = setup();
  await agenda.connectFeed(GOOGLE);
  const tandarts = () => agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts');
  assert.equal(tandarts().done, false);
  const before = notified.length;
  const { undo } = agenda.setDone(tandarts(), true);
  assert.equal(tandarts().done, true);
  assert.equal(agenda.itemsFor('2026-11-04').find((i) => i.title === 'Lunch').done, false, 'alleen deze afspraak');
  assert.ok(notified.length > before, 'Vandaag tekent opnieuw');
  assert.deepEqual(Object.values(JSON.parse(store.get('hb-agenda-done'))), ['2026-11-04']);
  assert.ok(!store.get('hb-agenda-done').toLowerCase().includes('tandarts'), 'de opslag bevat geen naam van een afspraak');
  undo();
  assert.equal(tandarts().done, false);
  assert.equal(store.has('hb-agenda-done'), false);
  agenda.setDone(tandarts(), true);
  agenda.setDone(tandarts(), false);
  assert.equal(tandarts().done, false);
});

test('afvinken: het blijft staan na een herstart en na een verversing, ook als de afspraak daarna van de andere bron komt', async () => {
  const first = setup();
  await first.agenda.connectFeed(GOOGLE);
  first.agenda.setDone(first.agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts'), true);

  const second = setup({ stored: Object.fromEntries(first.store) });
  second.agenda.load();
  assert.equal(second.agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts').done, true);

  // dezelfde afspraak, nu van de telefoon in plaats van uit de feed: nog steeds af
  const third = setup({ stored: { 'hb-agenda-done': first.store.get('hb-agenda-done') }, device: { access: 'granted', events: DEVICE_EVENTS } });
  third.agenda.load();
  await third.agenda.enableDevice();
  const fromPhone = third.agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts');
  assert.ok(fromPhone.id.startsWith('device|'));
  assert.equal(fromPhone.done, true);

  await first.agenda.refresh({ force: true });
  assert.equal(first.agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts').done, true);
});

test('afvinken: ontkoppelen laat geen afspraken achter, en alles wissen (uitloggen) ook het afgevinkte niet', async () => {
  const { agenda, store } = setup();
  await agenda.connectFeed(GOOGLE);
  agenda.setDone(agenda.itemsFor('2026-11-04')[0], true);
  agenda.disconnectFeed();
  assert.deepEqual(agenda.itemsFor('2026-11-04'), []);
  assert.ok(store.has('hb-agenda-done'), 'het blijft staan als je later opnieuw koppelt; het zijn alleen onleesbare nummers');
  agenda.clear();
  assert.equal(store.size, 0);
  assert.deepEqual(agenda.model.done, {});
});

test('afvinken: oude afgevinkte afspraken worden opgeruimd en kapotte opslag geeft niets af', () => {
  const { agenda } = setup({ stored: { 'hb-agenda-done': JSON.stringify({ oud: '2026-09-01', nieuw: '2026-11-03', raar: 5 }) } });
  agenda.load();
  assert.deepEqual(agenda.model.done, { nieuw: '2026-11-03' });
  const broken = setup({ stored: { 'hb-agenda-done': '[1,2' } });
  broken.agenda.load();
  assert.deepEqual(broken.agenda.model.done, {});
  const list = setup({ stored: { 'hb-agenda-done': '[1,2]' } });
  list.agenda.load();
  assert.deepEqual(list.agenda.model.done, {});
});

test('niet tonen: de afspraak verdwijnt van Vandaag, met ongedaan maken, en het blijft op het toestel staan', async () => {
  const { agenda, store, notified } = setup();
  await agenda.connectFeed(GOOGLE);
  const names = () => agenda.itemsFor('2026-11-04').map((i) => i.title);
  assert.ok(names().includes('Tandarts'));
  const before = notified.length;
  const { undo } = agenda.hide(agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts'));
  assert.ok(!names().includes('Tandarts'));
  assert.ok(names().includes('Lunch'), 'alleen deze afspraak');
  assert.ok(notified.length > before, 'Vandaag tekent opnieuw');
  assert.deepEqual(Object.values(JSON.parse(store.get('hb-agenda-hidden'))), ['2026-11-04']);
  assert.ok(!store.get('hb-agenda-hidden').toLowerCase().includes('tandarts'), 'de opslag bevat geen naam van een afspraak');
  undo();
  assert.ok(names().includes('Tandarts'));
  assert.equal(store.has('hb-agenda-hidden'), false);
});

test('niet tonen: blijft verborgen na een herstart en een verversing, en alles wissen (uitloggen) wist het ook', async () => {
  const first = setup();
  await first.agenda.connectFeed(GOOGLE);
  first.agenda.hide(first.agenda.itemsFor('2026-11-04').find((i) => i.title === 'Tandarts'));

  const second = setup({ stored: Object.fromEntries(first.store) });
  second.agenda.load();
  assert.ok(!second.agenda.itemsFor('2026-11-04').some((i) => i.title === 'Tandarts'));

  await first.agenda.refresh({ force: true });
  assert.ok(!first.agenda.itemsFor('2026-11-04').some((i) => i.title === 'Tandarts'));

  first.agenda.clear();
  assert.equal(first.store.size, 0);
  assert.deepEqual(first.agenda.model.hidden, {});
});

test('niet tonen: oude nummers worden opgeruimd en kapotte opslag geeft niets af', () => {
  const { agenda } = setup({ stored: { 'hb-agenda-hidden': JSON.stringify({ oud: '2026-09-01', nieuw: '2026-11-03', raar: 5 }) } });
  agenda.load();
  assert.deepEqual(agenda.model.hidden, { nieuw: '2026-11-03' });
  const broken = setup({ stored: { 'hb-agenda-hidden': '[1,2' } });
  broken.agenda.load();
  assert.deepEqual(broken.agenda.model.hidden, {});
});

test('de naam van de agenda komt mee: uit de feed en van de telefoon (die wint bij dezelfde afspraak)', async () => {
  const named = ics(TANDARTS, LUNCH).replace('VERSION:2.0', 'VERSION:2.0\r\nX-WR-CALNAME:Remco en Mel');
  const feedOnly = setup({ texts: [named] });
  await feedOnly.agenda.connectFeed(GOOGLE);
  assert.deepEqual(feedOnly.agenda.itemsFor('2026-11-04').map((i) => i.calendar), ['Remco en Mel', 'Remco en Mel']);
  const both = setup({ texts: [named], device: { access: 'granted', events: DEVICE_EVENTS } });
  await both.agenda.enableDevice();
  await both.agenda.connectFeed(GOOGLE);
  const byTitle = Object.fromEntries(both.agenda.itemsFor('2026-11-04').map((i) => [i.title, i.calendar]));
  assert.deepEqual(byTitle, { Lunch: 'Remco en Mel', Tandarts: 'Mel' });
});
