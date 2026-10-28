// De widget (src/app/widget.js): de sleutels, het einde van de dag, de momentopname en het verwerken van acties uit de widget, met een echte repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appointmentKey, applyWidgetActions, buildWidgetSnapshot, colorToHex, counterKey, endOfToday, habitKey, normalizeColors, parseWidgetKey,
} from '../../src/app/widget.js';
import { TODAY, testRepo, validHabit } from './helpers.js';

const settings = { timezone: 'Europe/Amsterdam', dayStartHour: 4 };
const NOW = new Date('2026-10-15T08:00:00.000Z'); // 10:00 in Amsterdam (zomertijd), op TODAY

async function setup() {
  const { repo } = testRepo();
  const water = await repo.saveHabit(validHabit({ name: 'Water', daypart: 'morning', counter: { unit: 'glazen', target: 3 } }));
  const lezen = await repo.saveHabit(validHabit({ name: 'Lezen', daypart: 'morning', sortOrder: 1 }));
  const tanden = await repo.saveHabit(validHabit({ name: 'Tandenpoetsen', daypart: 'morning', dayparts: ['morning', 'evening'], sortOrder: 2 }));
  const afspraak = await repo.saveAppointment({ title: 'Tandarts', date: TODAY, daypart: 'afternoon' });
  return { repo, water, lezen, tanden, afspraak };
}

const snapshotOf = async (repo) => buildWidgetSnapshot({ snapshot: await repo.snapshot(), today: TODAY, settings, now: NOW });
const find = (snapshot, key) => snapshot.items.find((item) => item.key === key);

test('sleutels: heen en terug, ook met een dagdeel en met rommel', () => {
  assert.deepEqual(parseWidgetKey(habitKey('h1')), { kind: 'habit', habitId: 'h1', part: null });
  assert.deepEqual(parseWidgetKey(habitKey('h1', 'evening')), { kind: 'habit', habitId: 'h1', part: 'evening' });
  assert.deepEqual(parseWidgetKey(counterKey('h2')), { kind: 'counter', habitId: 'h2' });
  assert.deepEqual(parseWidgetKey(appointmentKey('a1')), { kind: 'appointment', id: 'a1' });
  for (const bad of [undefined, null, 42, '', 'x|1|', 'h||', 'c|', 'onzin']) assert.equal(parseWidgetKey(bad), null, String(bad));
});

test('einde van de dag: het begin van je dag (04:00 in je tijdzone), ook over een zomertijdwissel heen', () => {
  assert.equal(new Date(endOfToday({ now: NOW, timeZone: 'Europe/Amsterdam', dayStartHour: 4 })).toISOString(), '2026-10-16T02:00:00.000Z'); // 04:00 zomertijd
  // de nacht van 24 op 25 oktober 2026 is de overgang naar wintertijd: 04:00 is dan 03:00 UTC
  const before = new Date('2026-10-24T20:00:00.000Z');
  assert.equal(new Date(endOfToday({ now: before, timeZone: 'Europe/Amsterdam', dayStartHour: 4 })).toISOString(), '2026-10-25T03:00:00.000Z');
  // vóór het begin van je dag hoort nog bij gisteren: 02:00 lokaal eindigt om 04:00 diezelfde dag
  const night = new Date('2026-10-15T00:00:00.000Z'); // 02:00 zomertijd
  assert.equal(new Date(endOfToday({ now: night, timeZone: 'Europe/Amsterdam', dayStartHour: 4 })).toISOString(), '2026-10-15T02:00:00.000Z');
});

test('momentopname: rijen per dagdeel in de volgorde van de app, met de teksten voor de widget', async () => {
  const { repo, afspraak } = await setup();
  const snapshot = await snapshotOf(repo);
  assert.equal(snapshot.date, TODAY);
  assert.deepEqual(snapshot.items.map((i) => [i.group, i.title]), [
    ['Ochtend', 'Water'], ['Ochtend', 'Lezen'], ['Ochtend', 'Tandenpoetsen'], ['Middag', 'Tandarts'], ['Avond', 'Tandenpoetsen'],
  ]);
  assert.equal(find(snapshot, appointmentKey(afspraak.id)).kind, 'appointment');
  assert.deepEqual([snapshot.done, snapshot.total], [0, 3]);
  assert.equal(snapshot.labels.allDone, 'Alles gedaan voor vandaag');
  assert.equal(snapshot.unsynced, 0);
  assert.deepEqual(snapshot.colors, {});
  assert.ok(snapshot.expiresAt > NOW.getTime());
  JSON.stringify(snapshot); // moet als tekst naar Android kunnen
});

test('momentopname: "Overdag" staat vóór de avond, niet erachter', async () => {
  const { repo } = await setup();
  await repo.saveHabit(validHabit({ name: 'Wandelen', daypart: 'anytime', sortOrder: 3 }));
  const snapshot = await snapshotOf(repo);
  assert.deepEqual([...new Set(snapshot.items.map((i) => i.group))], ['Ochtend', 'Middag', 'Overdag', 'Avond']);
});

test('kleuren: hex met of zonder doorzichtigheid, en alleen bekende namen met een geldige waarde', () => {
  assert.equal(colorToHex(41, 255, 185), '#29ffb9');
  assert.equal(colorToHex(255, 255, 255, 20), '#14ffffff', 'doorzichtig: eerst de doorzichtigheid, zoals Android het leest');
  assert.equal(colorToHex(300, -5, 0.4), '#ff0000', 'waarden buiten 0-255 worden begrensd');
  assert.deepEqual(normalizeColors({ accent: '#29ffb9', text: '#aae4e9f2', muted: 'rood', onAccent: '#fff', onbekend: '#000000', background: 42 }), { accent: '#29ffb9', text: '#aae4e9f2' });
  assert.deepEqual(normalizeColors(undefined), {});
});

test('momentopname: kleuren van het thema en het aantal niet-gesyncte wijzigingen gaan mee', async () => {
  const { repo } = await setup();
  const snapshot = buildWidgetSnapshot({ snapshot: await repo.snapshot(), today: TODAY, settings, now: NOW, colors: { accent: '#29ffb9', kapot: 'x' }, unsynced: 3.9 });
  assert.deepEqual(snapshot.colors, { accent: '#29ffb9' });
  assert.equal(snapshot.unsynced, 3);
  assert.equal(buildWidgetSnapshot({ snapshot: await repo.snapshot(), today: TODAY, settings, now: NOW, unsynced: -2 }).unsynced, 0);
});

test('momentopname: een teller toont waarde en doel, en een dagdeel heeft een eigen sleutel', async () => {
  const { repo, water, tanden } = await setup();
  await repo.setCheckIn({ habitId: water.id, date: TODAY, status: 'partial', value: 2 });
  const snapshot = await snapshotOf(repo);
  assert.deepEqual(find(snapshot, counterKey(water.id)), { key: counterKey(water.id), kind: 'counter', group: 'Ochtend', title: 'Water', value: 2, target: 3, unit: 'glazen', done: false });
  assert.ok(find(snapshot, habitKey(tanden.id, 'morning')));
  assert.ok(find(snapshot, habitKey(tanden.id, 'evening')));
});

test('momentopname: wat is overgeslagen of opgegeven staat er niet in en telt niet mee', async () => {
  const { repo, lezen } = await setup();
  await repo.setCheckIn({ habitId: lezen.id, date: TODAY, status: 'skipped' });
  const snapshot = await snapshotOf(repo);
  assert.equal(find(snapshot, habitKey(lezen.id)), undefined);
  assert.equal(snapshot.total, 2);
});

test('actie: vinken en weer wissen van een gewone habit', async () => {
  const { repo, lezen } = await setup();
  const key = habitKey(lezen.id);
  assert.deepEqual(await applyWidgetActions({ repo, actions: [{ key, date: TODAY, done: true }], today: TODAY }), { applied: 1, skipped: 0 });
  assert.equal((await repo.getCheckIn(lezen.id, TODAY)).status, 'done');
  assert.equal(find(await snapshotOf(repo), key).done, true);
  await applyWidgetActions({ repo, actions: [{ key, date: TODAY, done: false }], today: TODAY });
  assert.equal(await repo.getCheckIn(lezen.id, TODAY), null);
});

test('actie: al zo staan telt niet als wijziging en wist geen notitie', async () => {
  const { repo, lezen } = await setup();
  await repo.setCheckIn({ habitId: lezen.id, date: TODAY, status: 'done', note: 'goed gedaan' });
  const result = await applyWidgetActions({ repo, actions: [{ key: habitKey(lezen.id), date: TODAY, done: true }], today: TODAY });
  assert.deepEqual(result, { applied: 0, skipped: 1 });
  assert.equal((await repo.getCheckIn(lezen.id, TODAY)).note, 'goed gedaan');
});

test('actie: een dagdeel van een habit met meerdere dagdelen', async () => {
  const { repo, tanden } = await setup();
  await applyWidgetActions({ repo, actions: [{ key: habitKey(tanden.id, 'evening'), date: TODAY, done: true }], today: TODAY });
  let checkIn = await repo.getCheckIn(tanden.id, TODAY);
  assert.equal(checkIn.status, 'partial');
  assert.deepEqual(checkIn.parts, ['evening']);
  await applyWidgetActions({ repo, actions: [{ key: habitKey(tanden.id, 'morning'), date: TODAY, done: true }], today: TODAY });
  checkIn = await repo.getCheckIn(tanden.id, TODAY);
  assert.equal(checkIn.status, 'done');
});

test('actie: een teller gaat op en neer, nooit onder nul', async () => {
  const { repo, water } = await setup();
  const key = counterKey(water.id);
  await applyWidgetActions({ repo, actions: [{ key, date: TODAY, delta: 1 }, { key, date: TODAY, delta: 1 }], today: TODAY });
  assert.equal((await repo.getCheckIn(water.id, TODAY)).value, 2);
  await applyWidgetActions({ repo, actions: [{ key, date: TODAY, delta: 1 }], today: TODAY });
  assert.equal((await repo.getCheckIn(water.id, TODAY)).status, 'done', 'het doel van 3 is gehaald');
  await applyWidgetActions({ repo, actions: [{ key, date: TODAY, delta: -10 }], today: TODAY });
  assert.equal(await repo.getCheckIn(water.id, TODAY), null);
});

test('actie: een afspraak afvinken en weer openzetten', async () => {
  const { repo, afspraak } = await setup();
  const key = appointmentKey(afspraak.id);
  await applyWidgetActions({ repo, actions: [{ key, date: TODAY, done: true }], today: TODAY });
  assert.equal((await repo.getAppointment(afspraak.id)).doneOn, TODAY);
  await applyWidgetActions({ repo, actions: [{ key, date: TODAY, done: false }], today: TODAY });
  assert.equal((await repo.getAppointment(afspraak.id)).doneOn, null);
});

test('actie: een dag die te ver terug ligt, een verdwenen habit en rommel worden overgeslagen, de rest gaat door', async () => {
  const { repo, lezen } = await setup();
  const result = await applyWidgetActions({
    repo,
    actions: [
      { key: habitKey(lezen.id), date: '2026-09-01', done: true }, // buiten het venster om terug te vinken
      { key: habitKey('bestaat-niet'), date: TODAY, done: true },
      { key: 'onzin', date: TODAY, done: true },
      { key: habitKey(lezen.id), date: 'vandaag', done: true },
      { key: counterKey(lezen.id), date: TODAY, delta: 1 }, // geen teller
      { key: habitKey(lezen.id), date: TODAY, done: true }, // deze lukt wel
    ],
    today: TODAY,
  });
  assert.deepEqual(result, { applied: 1, skipped: 5 });
  assert.equal((await repo.getCheckIn(lezen.id, TODAY)).status, 'done');
  assert.deepEqual(await applyWidgetActions({ repo, actions: null, today: TODAY }), { applied: 0, skipped: 0 });
});
