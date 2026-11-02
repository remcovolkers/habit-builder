// De agenda op Vandaag: welk adres mag, welk dagdeel, twee bronnen samen, en wat de telefoon geeft (docs/AGENDA.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENDA_AHEAD_DAYS, AGENDA_BACK_DAYS, AGENDA_REFRESH_MS, agendaKey, agendaOn, agendaStale, agendaWindow, daypartOf, deviceItems, doneId, mergeAgenda, normalizeFeedUrl, pruneDone } from '../../src/domain/agenda.js';

const item = (over = {}) => ({ id: 'x', title: 'Tandarts', date: '2026-11-04', start: '14:30', end: '15:30', allDay: false, ...over });
const GOOGLE = 'https://calendar.google.com/calendar/ical/remco%40example.com/private-0123456789abcdef/basic.ics';

test('adres: het geheime iCal-adres van Google wordt gebruikt, webcal:// en spaties worden opgeschoond', () => {
  assert.deepEqual(normalizeFeedUrl(`  ${GOOGLE}  `), { ok: true, url: GOOGLE });
  assert.deepEqual(normalizeFeedUrl(GOOGLE.replace('https://', 'webcal://')), { ok: true, url: GOOGLE });
  assert.deepEqual(normalizeFeedUrl(`${GOOGLE}?hl=nl#x`), { ok: true, url: GOOGLE }, 'zoekopdracht en anker horen er niet bij');
});

test('adres: wat er mis is wordt benoemd', () => {
  assert.deepEqual(normalizeFeedUrl(''), { ok: false, reason: 'empty' });
  assert.deepEqual(normalizeFeedUrl('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(normalizeFeedUrl('remco@example.com'), { ok: false, reason: 'invalid' });
  assert.deepEqual(normalizeFeedUrl('http://calendar.google.com/calendar/ical/a/private-1/basic.ics'), { ok: false, reason: 'invalid' });
  assert.deepEqual(normalizeFeedUrl('https://outlook.live.com/owa/calendar/x/reachcalendar.ics'), { ok: false, reason: 'host' });
  assert.deepEqual(normalizeFeedUrl('https://calendar.google.com/calendar/u/0/r'), { ok: false, reason: 'path' });
});

test('dagdeel: ochtend tot 12:00, middag tot 18:00, daarna avond; een hele dag is "Overdag"', () => {
  assert.equal(daypartOf(item({ start: '00:30' })), 'morning');
  assert.equal(daypartOf(item({ start: '11:59' })), 'morning');
  assert.equal(daypartOf(item({ start: '12:00' })), 'afternoon');
  assert.equal(daypartOf(item({ start: '17:59' })), 'afternoon');
  assert.equal(daypartOf(item({ start: '18:00' })), 'evening');
  assert.equal(daypartOf(item({ start: '23:30' })), 'evening');
  assert.equal(daypartOf(item({ start: null, end: null, allDay: true })), 'anytime');
});

test('een dag: alleen die dag, op tijd, met dagdeel', () => {
  const items = [
    item({ id: 'a', title: 'Lunch', date: '2026-11-04', start: '12:30' }),
    item({ id: 'b', title: 'Ander', date: '2026-11-05' }),
    item({ id: 'c', title: 'Stand-up', date: '2026-11-04', start: '09:00' }),
    item({ id: 'd', title: 'Verjaardag', date: '2026-11-04', start: null, end: null, allDay: true }),
  ];
  assert.deepEqual(agendaOn({ items, date: '2026-11-04' }).map((i) => [i.title, i.daypart]), [['Verjaardag', 'anytime'], ['Stand-up', 'morning'], ['Lunch', 'afternoon']]);
  assert.deepEqual(agendaOn({ items, date: '2026-11-09' }), []);
});

test('twee bronnen: dezelfde afspraak telt één keer (je Google-agenda staat ook op je telefoon), de eerste lijst wint', () => {
  const device = [item({ id: 'device|1', title: 'Tandarts' })];
  const feed = [item({ id: 'feed|1', title: ' tandarts ' }), item({ id: 'feed|2', title: 'Lunch', start: '12:00' })];
  assert.deepEqual(mergeAgenda(device, feed).map((i) => i.id), ['feed|2', 'device|1'], 'op tijd: eerst de lunch van 12:00, dan de tandarts, en van de tandarts alleen die van de telefoon');
});

test('twee bronnen: een andere tijd of een andere dag is een andere afspraak', () => {
  const merged = mergeAgenda([item({ id: 'a' })], [item({ id: 'b', start: '15:00' }), item({ id: 'c', date: '2026-11-05' }), item({ id: 'd', start: null, end: null, allDay: true })]);
  assert.deepEqual(merged.map((i) => i.id).sort(), ['a', 'b', 'c', 'd']);
});

test('venster en veroudering: een verse bewaarde agenda blijft, een oude of te smalle wordt ververst', () => {
  const today = '2026-11-02';
  const now = Date.parse('2026-11-02T10:00:00Z');
  const window = agendaWindow(today);
  assert.deepEqual(window, { from: '2026-10-19', to: '2026-11-16' });
  assert.equal(AGENDA_BACK_DAYS, 14, 'zo ver terug als Vandaag kan bladeren');
  assert.equal(AGENDA_AHEAD_DAYS, 14, 'de week vooruit van Vandaag, met een week speling');
  const cache = { fetchedAt: now - 60_000, span: window };
  assert.equal(agendaStale({ cache, today, now }), false);
  assert.equal(agendaStale({ cache: { ...cache, fetchedAt: now - AGENDA_REFRESH_MS - 1 }, today, now }), true);
  assert.equal(agendaStale({ cache: { ...cache, fetchedAt: now + 60_000 }, today, now }), true, 'een klok die terugsprong');
  assert.equal(agendaStale({ cache, today: '2026-11-20', now }), true, 'vandaag ligt te dicht bij het einde van wat we hebben');
  assert.equal(agendaStale({ cache: null, today, now }), true);
  assert.equal(agendaStale({ cache: { fetchedAt: now }, today, now }), true);
});

test('de telefoon: tijden op jouw tijd, hele dagen als datum (middernacht UTC), herhalingen heeft de telefoon al uitgerekend', () => {
  const events = [
    { id: 1, title: 'Tandarts', begin: Date.UTC(2026, 10, 4, 13, 30), end: Date.UTC(2026, 10, 4, 14, 30), allDay: false },
    { id: 2, title: 'Verjaardag Anna', begin: Date.UTC(2026, 10, 5), end: Date.UTC(2026, 10, 6), allDay: true },
    { id: 3, title: 'Vakantie', begin: Date.UTC(2026, 10, 6), end: Date.UTC(2026, 10, 9), allDay: true },
    { id: 4, title: '  Kapot  ', begin: 'morgen', end: 'later', allDay: false },
  ];
  const items = deviceItems({ events, zone: 'Europe/Amsterdam', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(items.map((i) => [i.date, i.start ?? 'hele dag', i.title]), [
    ['2026-11-04', '14:30', 'Tandarts'],
    ['2026-11-05', 'hele dag', 'Verjaardag Anna'],
    ['2026-11-06', 'hele dag', 'Vakantie'],
    ['2026-11-07', 'hele dag', 'Vakantie'],
    ['2026-11-08', 'hele dag', 'Vakantie'],
  ]);
  assert.deepEqual(deviceItems({ events: null, zone: 'Europe/Amsterdam', from: '2026-11-02', to: '2026-11-08' }), []);
});

test('de telefoon geeft de naam van de agenda mee (bijvoorbeeld een gedeelde agenda), opgeschoond en afgekort', () => {
  const events = [
    { id: 1, title: 'Tandarts', begin: Date.UTC(2026, 10, 4, 13, 30), end: Date.UTC(2026, 10, 4, 14, 30), allDay: false, calendar: '  Mel   Volkers ' },
    { id: 2, title: 'Verjaardag', begin: Date.UTC(2026, 10, 5), end: Date.UTC(2026, 10, 6), allDay: true, calendar: 'x'.repeat(100) },
    { id: 3, title: 'Zonder', begin: Date.UTC(2026, 10, 6, 9), end: Date.UTC(2026, 10, 6, 10), allDay: false },
  ];
  const items = deviceItems({ events, zone: 'Europe/Amsterdam', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(items.map((i) => i.calendar), ['Mel Volkers', 'x'.repeat(40), null]);
});

test('samenvoegen: de afspraak van de telefoon wint en brengt de naam van de agenda mee', () => {
  const merged = mergeAgenda([item({ id: 'device|1', calendar: 'Mel' })], [item({ id: 'feed|1', calendar: 'Remco en Mel' })]);
  assert.deepEqual(merged.map((i) => [i.id, i.calendar]), [['device|1', 'Mel']]);
});

test('afvinken: dezelfde afspraak heeft hetzelfde nummer uit elke bron, een andere tijd of naam een ander nummer, en het nummer verraadt de naam niet', () => {
  const a = item({ id: 'feed|1', calendar: 'Remco en Mel' });
  assert.equal(agendaKey(a), '2026-11-04|14:30|tandarts');
  assert.equal(doneId(a), doneId(item({ id: 'device|9', title: '  TANDARTS ', calendar: 'Mel' })));
  assert.notEqual(doneId(a), doneId(item({ start: '15:00' })));
  assert.notEqual(doneId(a), doneId(item({ date: '2026-11-05' })));
  assert.notEqual(doneId(a), doneId(item({ title: 'Lunch' })));
  assert.match(doneId(a), /^[0-9a-z]+$/);
  assert.ok(!doneId(a).includes('tandarts'));
  const many = new Set(Array.from({ length: 2000 }, (_, i) => doneId(item({ title: `Afspraak ${i}`, start: `${String(i % 24).padStart(2, '0')}:00` }))));
  assert.equal(many.size, 2000, 'geen botsingen tussen een paar duizend afspraken');
});

test('afvinken: wat je niet meer kunt bekijken wordt opgeruimd, en rommel levert niets op', () => {
  const done = { a: '2026-10-18', b: '2026-10-19', c: '2026-11-02', d: 5 };
  assert.deepEqual(pruneDone(done, '2026-11-02'), { b: '2026-10-19', c: '2026-11-02' });
  assert.deepEqual(pruneDone(null, '2026-11-02'), {});
});
