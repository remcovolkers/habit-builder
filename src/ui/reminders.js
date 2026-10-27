// De ochtendherinnering: toestemming vragen, dit apparaat aanmelden, het tijdstip en de samenvatting naar de server sturen.
// De server (Edge Function send-reminders) doet het versturen.
//
// Twee soorten apparaat, met dezelfde server-kant en dezelfde kaart in Instellingen:
//   • de browser (of de geïnstalleerde PWA): Web Push, het apparaat is zijn webadres (endpoint);
//   • de Android-app (Capacitor, zie docs/ANDROID-APP.md): een FCM-melding via Google, het apparaat is zijn FCM-token.
//
// Status voor de UI: 'unconfigured' (web: nog geen VAPID-sleutel in config), 'unsupported', 'signed-out', 'denied', 'off', 'on'.
import { config } from '../config.js';
import * as auth from '../data/auth.js';
import { deleteAppDevice, deleteSubscription, saveAppDevice, saveSubscription, sendTestReminder } from '../data/push-remote.js';
import { base64UrlToBytes, buildReminderSummary, DEFAULT_REMINDER_TIME, notificationHash, rearmDate, validateReminderTime } from '../app/reminder.js';
import { nl } from '../content/nl.js';
import { isNativeApp, nativePlugin } from '../native.js';
import { account, onAccountChanged, onBeforeLeave } from './account.js';
import { onChanged, state } from './state.js';

const TIME_KEY = 'hb-reminder-time';
const TOKEN_KEY = 'hb-fcm-token'; // het FCM-token van dit toestel, zolang de herinnering aanstaat (alleen in de app)
/** Het meldingskanaal; de server noemt hetzelfde kanaal in elk bericht (FCM_CHANNEL_ID in de Edge Function). */
const CHANNEL_ID = 'morning-reminder';

// tot de eerste controle verborgen: anders flitst de kaart even op voor wie hem niet kan gebruiken
export const reminders = { status: 'unconfigured', time: DEFAULT_REMINDER_TIME };

const events = new EventTarget();
export function onRemindersChanged(listener) {
  events.addEventListener('reminders', listener);
  return () => events.removeEventListener('reminders', listener);
}
const emit = () => events.dispatchEvent(new Event('reminders'));

/** De push-plugin van de Android-app, of null in de browser. */
const appPush = () => (isNativeApp() ? nativePlugin('PushNotifications') : null);

const supported = () => appPush() !== null || ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* opslag geblokkeerd: de herinnering werkt, maar de app weet na een herstart niet dat hij aanstaat */
  }
}

function readStoredTime() {
  try {
    const stored = localStorage.getItem(TIME_KEY);
    return validateReminderTime(stored, 0) === null ? stored : DEFAULT_REMINDER_TIME;
  } catch {
    return DEFAULT_REMINDER_TIME;
  }
}

function storeTime(time) {
  try {
    localStorage.setItem(TIME_KEY, time);
  } catch {
    /* opslag geblokkeerd: het tijdstip staat dan alleen op de server */
  }
}

/** De registratie van de service worker, of null als die er niet (op tijd) is. */
async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(() => resolve(null), 8000))]);
}

const currentSubscription = async () => {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
};

/** Dit apparaat bij de server: { kind: 'app', id: token } in de Android-app, { kind: 'web', id: endpoint, subscription } in de browser, of null. */
async function currentDevice() {
  if (appPush()) {
    const token = readStoredToken();
    return token ? { kind: 'app', id: token } : null;
  }
  const subscription = await currentSubscription();
  return subscription ? { kind: 'web', id: subscription.endpoint, subscription } : null;
}

/** Bepaalt de status opnieuw en laat de UI tekenen. */
export async function refreshReminders() {
  reminders.time = readStoredTime();
  const plugin = appPush();
  if (!plugin && !config.vapidPublicKey) reminders.status = 'unconfigured'; // de app heeft geen VAPID-sleutel nodig
  else if (!supported()) reminders.status = 'unsupported';
  else if (account.status === 'restoring') reminders.status = 'unconfigured'; // verborgen tot we weten of je bent ingelogd (anders flitst "log in")
  else if (account.status !== 'signed-in') reminders.status = 'signed-out';
  else if (plugin) {
    const permission = (await plugin.checkPermissions().catch(() => null))?.receive; // Android 13+: de gebruiker kan meldingen in de instellingen blokkeren
    reminders.status = permission === 'denied' ? 'denied' : readStoredToken() ? 'on' : 'off';
  } else if (Notification.permission === 'denied') reminders.status = 'denied';
  else reminders.status = (await currentSubscription().catch(() => null)) ? 'on' : 'off';
  emit();
  return reminders.status;
}

/** `rearm`: het tijdstip is net ingesteld of gewijzigd, dus "vandaag al gemeld" opnieuw bepalen (zie rearmDate). `device`: zie currentDevice. */
async function upload(device, time, { rearm = false } = {}) {
  const client = await auth.getClient();
  const snapshot = await state.repo.snapshot();
  const summary = buildReminderSummary({ snapshot, today: state.today, settings: state.settings });
  const common = {
    client, userId: account.user.id, remindTime: time, timezone: state.settings.timezone, summary,
    lastNotifiedDate: rearm ? rearmDate({ time, now: new Date(), timeZone: state.settings.timezone }) : undefined,
  };
  if (device.kind === 'app') await saveAppDevice({ ...common, token: device.id });
  else await saveSubscription({ ...common, subscription: device.subscription.toJSON() });
  lastUploaded = JSON.stringify([device.id, time, state.settings.timezone, summary]);
}

let lastUploaded = '';
let uploadTimer = null;

/** Houdt de server bij: tijdstip, tijdzone en de samenvatting van de komende dagen. Doet niets als er niets veranderd is. */
export async function syncReminder({ force = false, rearm = false } = {}) {
  if (reminders.status !== 'on' || !navigator.onLine) return;
  try {
    const device = await currentDevice();
    if (!device) return;
    const snapshot = await state.repo.snapshot();
    const summary = buildReminderSummary({ snapshot, today: state.today, settings: state.settings });
    const signature = JSON.stringify([device.id, reminders.time, state.settings.timezone, summary]);
    if (!force && signature === lastUploaded) return;
    await upload(device, reminders.time, { rearm });
  } catch (error) {
    console.warn('herinnering bijwerken mislukt', error);
  }
}

const scheduleUpload = () => {
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(syncReminder, 4000);
};

/** Aanzetten. Aanroepen direct vanuit een tik van de gebruiker: de browser vraagt dan om toestemming. */
export async function enableReminder(time) {
  const problem = validateReminderTime(time, state.settings.dayStartHour);
  if (problem) return { ok: false, reason: problem };
  if (!navigator.onLine) return { ok: false, reason: 'offline' };

  const plugin = appPush();
  if (plugin) return enableInApp(plugin, time);

  const permission = await Notification.requestPermission(); // eerste await: de tik telt dan nog als gebaar
  if (permission !== 'granted') {
    await refreshReminders();
    return { ok: false, reason: 'denied' };
  }

  let subscription = null;
  try {
    const reg = await registration();
    if (!reg) return { ok: false, reason: 'failed' };
    const key = base64UrlToBytes(config.vapidPublicKey);
    subscription = await reg.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, key)) { // abonnement bij een andere server-sleutel: opnieuw beginnen
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    storeTime(time);
    reminders.time = time;
    await upload({ kind: 'web', id: subscription.endpoint, subscription }, time, { rearm: true });
  } catch (error) {
    console.warn('herinnering aanzetten mislukt', error);
    await subscription?.unsubscribe().catch(() => {}); // geen half abonnement achterlaten
    await refreshReminders();
    return { ok: false, reason: navigator.onLine ? 'failed' : 'offline' };
  }
  await refreshReminders();
  return { ok: true };
}

/** Het FCM-token van dit toestel: de plugin meldt het in het event 'registration'. */
function registerForPush(plugin) {
  return new Promise((resolve, reject) => {
    const handles = [];
    const finish = (settle, value) => {
      clearTimeout(timer);
      for (const handle of handles) handle.then((listener) => listener.remove()).catch(() => {});
      settle(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('geen FCM-token ontvangen')), 15000);
    handles.push(plugin.addListener('registration', ({ value }) => finish(resolve, value)));
    handles.push(plugin.addListener('registrationError', (error) => finish(reject, new Error(error?.error ?? 'registreren mislukt'))));
    plugin.register().catch((error) => finish(reject, error));
  });
}

/** Aanzetten in de Android-app: meldingstoestemming (Android 13+), het kanaal, een FCM-token, en het toestel bij de server aanmelden. */
async function enableInApp(plugin, time) {
  const permission = (await plugin.requestPermissions().catch(() => null))?.receive; // eerste await: de tik telt dan nog als gebaar
  if (permission !== 'granted') {
    await refreshReminders();
    return { ok: false, reason: 'denied' };
  }
  let token = null;
  try {
    // zonder bestaand kanaal toont Android de melding in een stil standaardkanaal; de server noemt dit kanaal in elk bericht
    await plugin.createChannel({ id: CHANNEL_ID, name: nl.reminder.channelName, description: nl.reminder.channelDescription, importance: 4, visibility: 0, vibration: true });
    token = await registerForPush(plugin);
    storeToken(token);
    storeTime(time);
    reminders.time = time;
    await upload({ kind: 'app', id: token }, time, { rearm: true });
  } catch (error) {
    console.warn('herinnering aanzetten mislukt', error);
    if (token) { // geen half aangemeld toestel achterlaten
      storeToken(null);
      await plugin.unregister().catch(() => {});
    }
    await refreshReminders();
    return { ok: false, reason: navigator.onLine ? 'failed' : 'offline' };
  }
  await refreshReminders();
  return { ok: true };
}

function sameKey(subscription, key) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
}

/** Uitzetten op dit apparaat: server-rij weg en het abonnement bij de browser opzeggen. */
export async function disableReminder() {
  const plugin = appPush();
  if (plugin) {
    const token = readStoredToken();
    if (token) {
      try {
        await deleteAppDevice({ client: await auth.getClient(), token });
      } catch (error) {
        console.warn('server-rij verwijderen mislukt (ruimt zichzelf op bij de volgende melding)', error);
      }
      await plugin.unregister().catch(() => {}); // het token vervalt: een rij die blijft staan geeft bij de volgende melding UNREGISTERED en ruimt zichzelf op
      storeToken(null);
    }
    lastUploaded = '';
    await refreshReminders();
    return;
  }
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) {
    try {
      await deleteSubscription({ client: await auth.getClient(), endpoint: subscription.endpoint });
    } catch (error) {
      console.warn('server-rij verwijderen mislukt (ruimt zichzelf op bij de volgende melding)', error);
    }
    await subscription.unsubscribe().catch(() => {});
  }
  lastUploaded = '';
  await refreshReminders();
}

/** Een ander tijdstip. Geeft null bij succes, anders de foutcode. */
export async function setReminderTime(time) {
  const problem = validateReminderTime(time, state.settings.dayStartHour);
  if (problem) return problem;
  storeTime(time);
  reminders.time = time;
  emit();
  await syncReminder({ force: true, rearm: true });
  return null;
}

/** De laatste melding die op dit toestel aankwam: { sent, received } (ms), of null. Geschreven door de service worker. */
export async function readPushLog() {
  try {
    const cache = await caches.open('hb-meta');
    const hit = await cache.match('./push-log.json');
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

/** Laat de server een melding sturen (met `delaySeconds` pas na een paar seconden). Geeft { ok } of { ok: false, reason }. */
export async function testReminder({ delaySeconds = 0 } = {}) {
  const device = await currentDevice().catch(() => null);
  if (!device) return { ok: false, reason: 'no_device' };
  try {
    await upload(device, reminders.time); // eerst bijwerken: de testtekst komt uit de actuele samenvatting
    const target = device.kind === 'app' ? { token: device.id } : { endpoint: device.id };
    return await sendTestReminder({ client: await auth.getClient(), ...target, delaySeconds });
  } catch (error) {
    console.warn('testmelding mislukt', error);
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * De Android-app luistert naar twee dingen: een tik op een melding (ook als de app daardoor start) opent de bijbehorende pagina, en een nieuw
 * FCM-token (Firebase vernieuwt het soms) wordt aan de server doorgegeven, waarna de rij met het oude token verdwijnt.
 */
function watchApp(plugin) {
  plugin.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const hash = notificationHash(notification?.data?.url, location.href);
    if (hash) location.hash = hash;
  });
  plugin.addListener('registration', async ({ value }) => {
    const old = readStoredToken();
    if (!old || !value || value === old) return; // niet aangezet, of niets veranderd (het aanzetten regelt dit zelf)
    try {
      storeToken(value);
      await upload({ kind: 'app', id: value }, reminders.time);
      await deleteAppDevice({ client: await auth.getClient(), token: old });
    } catch (error) {
      console.warn('nieuw FCM-token doorgeven mislukt', error);
    }
  });
  // Meldt zich opnieuw aan zodra de herinnering aanstaat: dat levert het actuele token op (het 'registration'-event hierboven).
  // Op de stored token letten, niet op de status: die is nog verborgen zolang het inloggen wordt hersteld.
  if (readStoredToken()) plugin.register().catch(() => {});
}

let started = false;

export function initReminders() {
  if (started) return;
  started = true;
  const plugin = appPush();
  refreshReminders().then(() => {
    if (plugin) watchApp(plugin);
    return syncReminder();
  });
  let lastAccount = account.status;
  onAccountChanged(() => { // ook bij elke sync-melding: alleen reageren als inloggen of uitloggen is veranderd
    if (account.status === lastAccount) return;
    lastAccount = account.status;
    refreshReminders().then(() => syncReminder());
  });
  onChanged(() => { if (reminders.status === 'on') scheduleUpload(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncReminder(); });
  // uitloggen of account verwijderen: dit apparaat meldt zich af, anders krijgt de volgende gebruiker van dit toestel jouw melding
  onBeforeLeave(disableReminder);
}
