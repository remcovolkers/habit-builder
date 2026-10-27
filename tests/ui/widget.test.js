// De widget aan de kant van de app (src/ui/widget.js), met een nagebootste plugin: de lijst schrijven, de wachtrij verwerken, en de volgorde daarvan.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TODAY, testRepo, validHabit } from '../app/helpers.js';

const visibilityListeners = [];
globalThis.document = { hidden: false, addEventListener: (name, fn) => { if (name === 'visibilitychange') visibilityListeners.push(fn); }, documentElement: { setAttribute() {} } };

const { drainWidgetQueue, initWidget, widgetTiming, writeWidgetSnapshot } = await import('../../src/ui/widget.js');
const { notifyChanged, state } = await import('../../src/ui/state.js');
widgetTiming.delay = 20; // de echte wachttijd is seconden

/** De widget-plugin zoals Android hem aanbiedt: een momentopname bewaren, en een wachtrij die bij ophalen leeg wordt. */
function fakePlugin(queue = []) {
  const plugin = {
    snapshots: [],
    queue,
    log: [],
    setSnapshot: async ({ json }) => { plugin.log.push('setSnapshot'); plugin.snapshots.push(JSON.parse(json)); },
    takeQueue: async () => { plugin.log.push('takeQueue'); const json = JSON.stringify(plugin.queue); plugin.queue = []; return { json }; },
  };
  return plugin;
}

let repo;
let lezen;
let started = null; // de plugin waaraan initWidget (één keer per proces) is gekoppeld
beforeEach(async () => {
  ({ repo } = testRepo());
  lezen = await repo.saveHabit(validHabit({ name: 'Lezen' }));
  state.repo = repo;
  state.today = TODAY;
  state.settings = { timezone: 'Europe/Amsterdam', dayStartHour: 4 };
  globalThis.Capacitor = undefined; // de luisteraars van initWidget (één keer per proces) blijven bewust staan
});

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

test('de lijst van vandaag gaat als tekst naar de plugin', async () => {
  const plugin = fakePlugin();
  assert.equal(await writeWidgetSnapshot(plugin), true);
  assert.equal(plugin.snapshots[0].date, TODAY);
  assert.deepEqual(plugin.snapshots[0].items.map((item) => item.title), ['Lezen']);
});

test('buiten de app (geen plugin) gebeurt er niets', async () => {
  assert.equal(await writeWidgetSnapshot(null), false);
  assert.equal(await drainWidgetQueue(null), null);
});

test('de wachtrij uit de widget wordt uitgevoerd en meldt een wijziging aan de rest van de app', async () => {
  const plugin = fakePlugin([{ key: `h|${lezen.id}|`, date: TODAY, done: true }]);
  const result = await drainWidgetQueue(plugin);
  assert.deepEqual(result, { applied: 1, skipped: 0 });
  assert.equal((await repo.getCheckIn(lezen.id, TODAY)).status, 'done');
  assert.deepEqual(plugin.queue, [], 'de wachtrij is leeg na het ophalen');
});

test('een lege of kapotte wachtrij geeft geen fout', async () => {
  assert.deepEqual(await drainWidgetQueue(fakePlugin([])), { applied: 0, skipped: 0 });
  const broken = { takeQueue: async () => ({ json: '{niet json' }) };
  assert.deepEqual(await drainWidgetQueue(broken), { applied: 0, skipped: 0 });
  const nothing = { takeQueue: async () => undefined };
  assert.deepEqual(await drainWidgetQueue(nothing), { applied: 0, skipped: 0 });
});

test('initWidget: eerst de wachtrij verwerken, dan de lijst schrijven (met het nieuwe vinkje erin)', async () => {
  const plugin = fakePlugin([{ key: `h|${lezen.id}|`, date: TODAY, done: true }]);
  started = plugin;
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { HabitWidget: plugin } };
  initWidget();
  await settle();
  assert.equal(plugin.log[0], 'takeQueue');
  assert.ok(plugin.log.includes('setSnapshot'));
  assert.ok(plugin.log.indexOf('takeQueue') < plugin.log.indexOf('setSnapshot'));
  assert.equal(plugin.snapshots.at(-1).items[0].done, true);
});

test('initWidget: een wijziging in de app werkt de widget even later bij, en naar de achtergrond gaan meteen', async () => {
  // initWidget start één keer per proces; de plugin van de vorige test blijft gekoppeld, dus we kijken naar die
  const plugin = started;
  plugin.snapshots.length = 0;
  await repo.setCheckIn({ habitId: lezen.id, date: TODAY, status: 'done' });
  notifyChanged();
  assert.equal(plugin.snapshots.length, 0, 'niet meteen: een tweede tik volgt vaak snel');
  await settle();
  assert.equal(plugin.snapshots.length, 1);
  assert.equal(plugin.snapshots[0].items[0].done, true);

  await repo.clearCheckIn(lezen.id, TODAY);
  document.hidden = true;
  for (const listener of visibilityListeners) listener();
  await settle(5);
  assert.equal(plugin.snapshots.length, 2, 'bij naar de achtergrond gaan is de lijst meteen bijgewerkt');
  assert.equal(plugin.snapshots[1].items[0].done, false);
  document.hidden = false;
});
