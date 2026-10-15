// De push- en klik-afhandeling van de service worker, in een nagebootste omgeving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(fileURLToPath(new URL('../../sw.js', import.meta.url)), 'utf8');
const ORIGIN = 'https://app.test';
const SCOPE = `${ORIGIN}/habit-builder/`;

function loadWorker({ clients = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = {
    location: new URL(`${SCOPE}sw.js`),
    registration: { scope: SCOPE, showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: {
      matchAll: async () => clients,
      openWindow: async (url) => { opened.push(url); },
      claim: async () => {},
    },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  vm.runInNewContext(source, { self, URL, Request, Response, caches: {}, fetch: async () => new Response() });

  const run = async (type, event) => {
    const pending = [];
    await listeners[type]({ ...event, waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  };
  const push = (payload) => run('push', {
    data: payload === undefined ? null : { json: () => (typeof payload === 'function' ? payload() : JSON.parse(payload)) },
  });
  const click = (url) => {
    const notification = { closed: false, data: url === undefined ? undefined : { url }, close() { this.closed = true; } };
    return run('notificationclick', { notification }).then(() => notification);
  };
  return { shown, opened, push, click };
}

test('push: toont de titel en tekst uit het bericht, met icoon en een vaste tag (vervangt de vorige)', async () => {
  const worker = loadWorker();
  await worker.push(JSON.stringify({ title: 'Goedemorgen, Remco', body: 'Vandaag staan 3 gewoontes op je lijst.', url: './#/today' }));
  assert.equal(worker.shown.length, 1);
  const { title, options } = worker.shown[0];
  assert.equal(title, 'Goedemorgen, Remco');
  assert.equal(options.body, 'Vandaag staan 3 gewoontes op je lijst.');
  assert.equal(options.icon, 'icons/icon-192.png');
  assert.equal(options.tag, 'morning-reminder');
  assert.equal(options.renotify, true, 'een melding met dezelfde tag moet opnieuw aankondigen (geluid en trilling), niet stilletjes vervangen');
  assert.deepEqual([...options.vibrate], [200, 100, 200]);
  assert.equal(options.data.url, './#/today');
});

test('push: een leeg of onleesbaar bericht geeft toch een melding (verplicht bij userVisibleOnly)', async () => {
  for (const payload of [undefined, '{kapot', () => { throw new Error('nee'); }, JSON.stringify({ title: 7, body: null })]) {
    const worker = loadWorker();
    await worker.push(payload);
    assert.equal(worker.shown.length, 1);
    assert.equal(worker.shown[0].title, 'Habit Builder');
    assert.equal(worker.shown[0].options.body, 'Bekijk wat er vandaag op je lijst staat.');
  }
});

test('push: absurd lange teksten worden afgekapt', async () => {
  const worker = loadWorker();
  await worker.push(JSON.stringify({ title: 'T'.repeat(1000), body: 'B'.repeat(1000) }));
  assert.ok(worker.shown[0].title.length <= 200 && worker.shown[0].options.body.length <= 200);
});

test('klik: sluit de melding en opent de app op Vandaag als er geen venster open is', async () => {
  const worker = loadWorker();
  const notification = await worker.click('./#/today');
  assert.equal(notification.closed, true);
  assert.deepEqual(worker.opened, [`${SCOPE}#/today`]);
});

test('klik: een al open venster krijgt de focus (en gaat naar Vandaag) in plaats van een tweede venster', async () => {
  const log = [];
  const client = { url: `${SCOPE}#/habits`, focus: async () => log.push('focus'), navigate: async (url) => log.push(`navigate ${url}`) };
  const worker = loadWorker({ clients: [client] });
  await worker.click('./#/today');
  assert.deepEqual(log, ['focus', `navigate ${SCOPE}#/today`]);
  assert.deepEqual(worker.opened, []);
});

test('klik: een venster van een andere site telt niet mee', async () => {
  const stranger = { url: 'https://elders.example/', focus: async () => assert.fail('mag niet'), navigate: async () => assert.fail('mag niet') };
  const worker = loadWorker({ clients: [stranger] });
  await worker.click('./#/today');
  assert.deepEqual(worker.opened, [`${SCOPE}#/today`]);
});

test('klik: een adres buiten de app in het bericht wordt genegeerd', async () => {
  for (const url of ['https://kwaad.example/pagina', '//kwaad.example/', undefined]) {
    const worker = loadWorker();
    await worker.click(url);
    assert.deepEqual(worker.opened, [`${SCOPE}#/today`], String(url));
  }
});

test('push: renotify mag alleen samen met een tag (anders gooit showNotification een fout en komt er geen melding)', async () => {
  const worker = loadWorker();
  await worker.push(JSON.stringify({ title: 't', body: 'b' }));
  const { options } = worker.shown[0];
  assert.ok(options.renotify !== true || (typeof options.tag === 'string' && options.tag !== ''));
});
