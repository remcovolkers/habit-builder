// De ochtendherinnering in de Android-app (src/ui/reminders.js): aanzetten, uitzetten, een nieuw FCM-token en een tik op een melding,
// met een nagebootste Capacitor-plugin en de echte Supabase-client tegen een nagebootste fetch.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// De Supabase-client onthoudt de fetch van het moment dat hij wordt gemaakt: één keer instellen, de werking zit in `handler`.
let handler = async () => new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (input, init) => handler(input, init);

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.location = { hostname: 'remcovolkers.github.io', href: 'https://remcovolkers.github.io/habit-builder/', hash: '' };

const reminders = await import('../../src/ui/reminders.js');
Object.assign(reminders.appTimeouts, { channel: 60, token: 60, upload: 60 }); // de echte limieten zijn seconden; de tests willen niet zo lang wachten
const { account } = await import('../../src/ui/account.js');
const { state } = await import('../../src/ui/state.js');

/** De push-plugin zoals Capacitor hem aanbiedt, met wat we ermee kunnen laten gebeuren. */
function fakePlugin({ permission = 'granted', token = 'tok-1', registerFails = false, channelHangs = false, tokenNeverComes = false, registrationError = null, plainListeners = false } = {}) {
  const calls = [];
  const listeners = new Map();
  const plugin = {
    calls,
    permission,
    token,
    checkPermissions: async () => ({ receive: plugin.permission }),
    requestPermissions: async () => { calls.push('requestPermissions'); return { receive: plugin.permission }; },
    createChannel: (channel) => { calls.push(['createChannel', channel]); return channelHangs ? new Promise(() => {}) : Promise.resolve(); },
    register: async () => {
      calls.push('register');
      if (registerFails) throw new Error('Default FirebaseApp is not initialized');
      if (registrationError) setTimeout(() => plugin.emit('registrationError', { error: registrationError }), 0);
      else if (!tokenNeverComes) setTimeout(() => plugin.emit('registration', { value: plugin.token }), 0);
    },
    unregister: async () => { calls.push('unregister'); },
    addListener: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      // plainListeners: zoals Capacitor.Plugins in de app het kan doen: geen Promise met een handle, maar alleen een id
      return plainListeners ? 'callback-id-7' : Promise.resolve({ remove: async () => listeners.get(name).delete(fn) });
    },
    emit: (name, payload) => { for (const fn of [...(listeners.get(name) ?? [])]) fn(payload); },
    listenerCount: (name) => listeners.get(name)?.size ?? 0,
  };
  return plugin;
}

let requests;
let plugin;
beforeEach(() => {
  store.clear();
  requests = [];
  handler = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    requests.push({ method: init.method ?? 'GET', path: url.pathname, search: url.search, body: init.body ? JSON.parse(init.body) : null });
    return new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  plugin = fakePlugin();
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } };
  account.status = 'signed-in';
  account.user = { id: 'user-1', email: 'a@x.nl' };
  state.today = '2026-10-16';
  state.settings = { timezone: 'Europe/Amsterdam', dayStartHour: 4, displayName: 'Remco' };
  state.repo = { snapshot: async () => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], reviews: [] }) };
  location.hash = '';
});

// alleen schrijfacties: de kaart vraagt op de achtergrond ook (met een GET) of er een herinnering in een browser staat
const writes = () => requests.filter((request) => request.path === '/rest/v1/push_subscriptions' && request.method !== 'GET');

test('in de app is de herinnering beschikbaar zonder VAPID-sleutel, en staat hij uit tot je hem aanzet', async () => {
  assert.equal(await reminders.refreshReminders(), 'off');
});

test('de app zonder push-plugin valt terug op "niet ondersteund" (geen crash)', async () => {
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  const status = await reminders.refreshReminders();
  assert.ok(['unsupported', 'unconfigured'].includes(status), status); // geen PushManager in Node, en geen VAPID-sleutel in de dev-config
});

test('aanzetten: toestemming, kanaal, token, opslaan bij de server als app-toestel, en daarna staat hij aan', async () => {
  const result = await reminders.enableReminder('07:30');
  assert.deepEqual(result, { ok: true });
  assert.equal(plugin.calls[0], 'requestPermissions', 'de toestemming komt als eerste, direct na de tik');
  const channel = plugin.calls.find((call) => call[0] === 'createChannel')[1];
  assert.deepEqual({ id: channel.id, importance: channel.importance, vibration: channel.vibration }, { id: 'morning-reminder', importance: 4, vibration: true });
  assert.ok(plugin.calls.indexOf('register') > plugin.calls.findIndex((call) => call[0] === 'createChannel'), 'het kanaal bestaat vóór het eerste bericht');

  const [write] = writes();
  assert.equal(write.method, 'POST');
  assert.match(write.search, /on_conflict=user_id%2Cfcm_token/);
  const row = Array.isArray(write.body) ? write.body[0] : write.body;
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.platform, 'android');
  assert.equal(row.fcm_token, 'tok-1');
  assert.equal(row.remind_time, '07:30');
  assert.equal(row.timezone, 'Europe/Amsterdam');
  assert.ok(!('endpoint' in row) && !('p256dh' in row), 'geen webadres of sleutels');
  assert.equal(row.summary.name, 'Remco');
  assert.equal(store.get('hb-fcm-token'), 'tok-1');
  assert.equal(reminders.reminders.status, 'on');
  assert.equal(reminders.reminders.time, '07:30');
  assert.equal(plugin.listenerCount('registration'), 0, 'de tijdelijke luisteraars zijn opgeruimd');
});

test('aanzetten zonder toestemming: geen token, niets bij de server, status "denied"', async () => {
  plugin.permission = 'denied';
  assert.deepEqual(await reminders.enableReminder('08:00'), { ok: false, reason: 'denied' });
  assert.equal(writes().length, 0);
  assert.equal(store.has('hb-fcm-token'), false);
  assert.equal(reminders.reminders.status, 'denied');
});

test('aanzetten als de server weigert: het toestel meldt zich weer af, er blijft geen half token achter', async () => {
  handler = async () => new Response(JSON.stringify({ message: 'kapot', code: '23514' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const result = await reminders.enableReminder('08:00');
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: 'failed' });
  assert.equal(result.detail, 'kapot', 'de reden van de server komt mee');
  assert.equal(store.has('hb-fcm-token'), false);
  assert.ok(plugin.calls.includes('unregister'));
  assert.equal(reminders.reminders.status, 'off');
});

test('aanzetten als Firebase niet is ingericht (register mislukt): nette fout, geen crash, niets opgeslagen', async () => {
  plugin = fakePlugin({ registerFails: true });
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } };
  const result = await reminders.enableReminder('08:00');
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: 'failed' });
  assert.equal(writes().length, 0);
  assert.equal(store.has('hb-fcm-token'), false);
});

const withPlugin = (options) => {
  plugin = fakePlugin(options);
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } };
};

test('aanzetten meldt elke stap, zodat te zien is waar het vastloopt', async () => {
  const steps = [];
  await reminders.enableReminder('08:00', { onStep: (text) => steps.push(text) });
  assert.deepEqual(steps.map((text) => text.slice(0, 6)), ['Stap 1', 'Stap 2', 'Stap 3', 'Stap 4']);
});

test('addListener geeft geen Promise terug (alleen een callback-id): het token komt toch aan en aanzetten lukt', async () => {
  withPlugin({ plainListeners: true });
  const result = await reminders.enableReminder('08:00');
  assert.deepEqual(result, { ok: true });
  assert.equal(store.get('hb-fcm-token'), 'tok-1');
  assert.equal(writes().length, 1);
});

test('addListener geeft undefined of een kapot object terug: ook dan geen vastlopen', async () => {
  withPlugin();
  for (const odd of [undefined, null, 42, {}, { then: 'geen functie' }]) {
    const original = plugin.addListener;
    plugin.addListener = (name, fn) => { original(name, fn); return odd; };
    store.clear();
    const result = await reminders.enableReminder('08:00');
    assert.equal(result.ok, true, String(odd));
    plugin.addListener = original;
  }
});

test('een kanaal dat nooit antwoordt laat de knop niet eeuwig grijs: na de limiet een fout met de naam van de stap', async () => {
  withPlugin({ channelHangs: true });
  const result = await reminders.enableReminder('08:00');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'failed');
  assert.match(result.detail, /^kanaal: geen antwoord/);
  assert.equal(writes().length, 0);
  assert.equal(store.has('hb-fcm-token'), false);
});

test('een token dat nooit aankomt: na de limiet "token: …", niets opgeslagen en de status blijft uit', async () => {
  withPlugin({ tokenNeverComes: true });
  const result = await reminders.enableReminder('08:00');
  assert.equal(result.ok, false);
  assert.match(result.detail, /^token: geen FCM-token ontvangen/);
  assert.equal(writes().length, 0);
  assert.equal(reminders.reminders.status, 'off');
  assert.equal(plugin.listenerCount('registration'), 0, 'ook na een time-out zijn de tijdelijke luisteraars opgeruimd');
});

test('Google geeft een fout bij het token (bijvoorbeeld een beperkte API-sleutel): de reden komt in het resultaat', async () => {
  withPlugin({ registrationError: 'FIS_AUTH_ERROR' });
  const result = await reminders.enableReminder('08:00');
  assert.equal(result.reason, 'failed');
  assert.equal(result.detail, 'token: FIS_AUTH_ERROR');
});

test('register() zelf mislukt (Firebase niet ingericht): "token: …" met de melding van Android', async () => {
  withPlugin({ registerFails: true });
  const result = await reminders.enableReminder('08:00');
  assert.match(result.detail, /^token: .*FirebaseApp is not initialized/);
});

test('opslaan bij de server blijft hangen: na de limiet "opslaan: …", en het token wordt weer ingetrokken', async () => {
  handler = () => new Promise(() => {});
  const result = await reminders.enableReminder('08:00');
  assert.match(result.detail, /^opslaan: geen antwoord/);
  assert.equal(store.has('hb-fcm-token'), false);
  assert.ok(plugin.calls.includes('unregister'));
});

test('een ongeldig tijdstip wordt geweigerd zonder de plugin aan te roepen', async () => {
  assert.deepEqual(await reminders.enableReminder('3:00'), { ok: false, reason: 'invalid' });
  assert.deepEqual(plugin.calls, []);
});

test('uitzetten: de rij bij de server weg (op token), het token ingetrokken en vergeten', async () => {
  await reminders.enableReminder('08:00');
  requests.length = 0;
  await reminders.disableReminder();
  const [removal] = writes();
  assert.equal(removal.method, 'DELETE');
  assert.match(removal.search, /fcm_token=eq\.tok-1/);
  assert.ok(plugin.calls.includes('unregister'));
  assert.equal(store.has('hb-fcm-token'), false);
  assert.equal(reminders.reminders.status, 'off');
});

test('uitzetten zonder verbinding: het toestel meldt zich lokaal toch af (de server ruimt de rij zelf op bij de volgende melding)', async () => {
  await reminders.enableReminder('08:00');
  handler = async () => { throw new TypeError('Failed to fetch'); };
  await reminders.disableReminder();
  assert.equal(store.has('hb-fcm-token'), false);
  assert.ok(plugin.calls.includes('unregister'));
});

test('na een herstart (token bewaard) staat de herinnering aan, en een ingetrokken meldingstoestemming geeft "denied"', async () => {
  store.set('hb-fcm-token', 'tok-1');
  assert.equal(await reminders.refreshReminders(), 'on');
  plugin.permission = 'denied';
  assert.equal(await reminders.refreshReminders(), 'denied');
  plugin.permission = 'granted';
  assert.equal(await reminders.refreshReminders(), 'on');
});

test('uitgelogd: de kaart vraagt eerst in te loggen', async () => {
  account.status = 'anonymous';
  assert.equal(await reminders.refreshReminders(), 'signed-out');
});

test('het tijdstip wijzigen werkt de rij van dit toestel bij en zet "vandaag al gemeld" opnieuw', async () => {
  await reminders.enableReminder('08:00');
  requests.length = 0;
  assert.equal(await reminders.setReminderTime('09:15'), null);
  const [write] = writes();
  const row = Array.isArray(write.body) ? write.body[0] : write.body;
  assert.equal(row.fcm_token, 'tok-1');
  assert.equal(row.remind_time, '09:15');
  assert.ok('last_notified_date' in row, 'rearm: het nieuwe tijdstip geldt vanaf de eerstvolgende keer');
});

test('testmelding: de functie wordt aangeroepen met het token van dit toestel', async () => {
  await reminders.enableReminder('08:00');
  requests.length = 0;
  handler = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    requests.push({ path: url.pathname, body: init.body ? JSON.parse(init.body) : null });
    return Response.json({ mode: 'test', sent: 1 });
  };
  assert.deepEqual(await reminders.testReminder(), { ok: true });
  const call = requests.find((request) => request.path === '/functions/v1/send-reminders');
  assert.deepEqual(call.body, { test: true, token: 'tok-1' });
});

test('testmelding zonder aangemeld toestel: "no_device"', async () => {
  assert.deepEqual(await reminders.testReminder(), { ok: false, reason: 'no_device' });
});

test('een melding terwijl de app open staat wordt als balk getoond, met "Openen" alleen naar een pagina binnen de app', () => {
  const opened = [];
  const toast = reminders.foregroundToast({ title: 'Testmelding', body: 'Het werkt.', data: { url: './#/today' } }, (hash) => opened.push(hash));
  assert.equal(toast.message, 'Testmelding: Het werkt.');
  assert.equal(toast.actionLabel, 'Openen');
  toast.onAction();
  assert.deepEqual(opened, ['#/today']);

  const foreign = reminders.foregroundToast({ title: 'Hoi', data: { url: 'https://kwaad.example/#/today' } }, () => assert.fail('nooit naar een andere site'));
  assert.equal(foreign.message, 'Hoi');
  assert.equal(foreign.actionLabel, null);

  assert.equal(reminders.foregroundToast({}, () => {}), null);
  assert.equal(reminders.foregroundToast(undefined, () => {}), null);
});

test('de kaart weet of er voor dit account ook een herinnering in een browser staat (dan komen er twee meldingen), en meldt het zonder te blokkeren', async () => {
  const answer = (rows) => async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    requests.push({ method: init.method ?? 'GET', path: url.pathname, search: url.search, body: null });
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

  handler = answer([{ id: 'web-1' }]);
  await reminders.refreshReminders();
  await settle();
  assert.equal(reminders.reminders.alsoInBrowser, true);
  assert.ok(requests.some((request) => request.method === 'GET' && request.search.includes('platform=eq.web')), 'alleen de webrijen worden gevraagd');

  handler = answer([]);
  await reminders.refreshReminders();
  await settle();
  assert.equal(reminders.reminders.alsoInBrowser, false);

  handler = async () => { throw new TypeError('Failed to fetch'); }; // een fout telt als "nee": nooit een verkeerde waarschuwing
  await reminders.refreshReminders();
  await settle();
  assert.equal(reminders.reminders.alsoInBrowser, false);
});

// initReminders loopt maar één keer per proces en hangt zijn luisteraars aan de plugin van dat moment: daarom één test voor alles wat daarbij hoort.
test('initReminders in de app: een tik op een melding opent de pagina (nooit een andere site) en een vernieuwd FCM-token vervangt het oude', async () => {
  store.set('hb-fcm-token', 'tok-1');
  reminders.initReminders();
  await new Promise((resolve) => setTimeout(resolve, 50)); // refreshReminders en de luisteraars
  assert.ok(plugin.listenerCount('pushNotificationActionPerformed') >= 1);
  assert.ok(plugin.listenerCount('pushNotificationReceived') >= 1, 'ook een melding bij een open app wordt opgevangen');
  plugin.emit('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: './#/stats?review=week&date=2026-10-16' } } });
  assert.equal(location.hash, '#/stats?review=week&date=2026-10-16');
  plugin.emit('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: 'https://kwaad.example/#/today' } } });
  assert.equal(location.hash, '#/stats?review=week&date=2026-10-16', 'een adres buiten de app wordt genegeerd');
  plugin.emit('pushNotificationActionPerformed', { actionId: 'tap', notification: {} });
  assert.equal(location.hash, '#/stats?review=week&date=2026-10-16');

  // bij het starten meldt de app zich opnieuw aan (dat levert het actuele token op)
  assert.ok(plugin.calls.includes('register'));

  // hetzelfde token: niets te doen
  requests.length = 0;
  plugin.emit('registration', { value: 'tok-1' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(writes().length, 0);

  // Firebase geeft een nieuw token: dat wordt opgeslagen, bij de server aangemeld, en de rij met het oude token verdwijnt
  plugin.emit('registration', { value: 'tok-2' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(store.get('hb-fcm-token'), 'tok-2');
  const [save, removal] = writes();
  assert.equal(save.method, 'POST');
  assert.equal((Array.isArray(save.body) ? save.body[0] : save.body).fcm_token, 'tok-2');
  assert.equal(removal.method, 'DELETE');
  assert.match(removal.search, /fcm_token=eq.tok-1/);

  // uitgezet (geen bewaard token): een los token-event verandert niets, want het aanzetten regelt zijn eigen token
  store.delete('hb-fcm-token');
  requests.length = 0;
  plugin.emit('registration', { value: 'tok-zwerver' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(writes().length, 0);
  assert.equal(store.has('hb-fcm-token'), false);
});

