// De ochtendherinnering in de browser: toestemming vragen, dit apparaat aanmelden voor Web Push, het tijdstip en de
// samenvatting naar de server sturen. De server (Edge Function send-reminders) doet het versturen.
//
// Status voor de UI: 'unconfigured' (nog geen VAPID-sleutel in config), 'unsupported', 'signed-out', 'denied', 'off', 'on'.
import { config } from '../config.js';
import * as auth from '../data/auth.js';
import { deleteSubscription, saveSubscription, sendTestReminder } from '../data/push-remote.js';
import { base64UrlToBytes, buildReminderSummary, DEFAULT_REMINDER_TIME, rearmDate, validateReminderTime } from '../app/reminder.js';
import { account, onAccountChanged, onBeforeLeave } from './account.js';
import { onChanged, state } from './state.js';

const TIME_KEY = 'hb-reminder-time';

// tot de eerste controle verborgen: anders flitst de kaart even op voor wie hem niet kan gebruiken
export const reminders = { status: 'unconfigured', time: DEFAULT_REMINDER_TIME };

const events = new EventTarget();
export function onRemindersChanged(listener) {
  events.addEventListener('reminders', listener);
  return () => events.removeEventListener('reminders', listener);
}
const emit = () => events.dispatchEvent(new Event('reminders'));

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

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

/** Bepaalt de status opnieuw en laat de UI tekenen. */
export async function refreshReminders() {
  reminders.time = readStoredTime();
  if (!config.vapidPublicKey) reminders.status = 'unconfigured';
  else if (!supported()) reminders.status = 'unsupported';
  else if (account.status === 'restoring') reminders.status = 'unconfigured'; // verborgen tot we weten of je bent ingelogd (anders flitst "log in")
  else if (account.status !== 'signed-in') reminders.status = 'signed-out';
  else if (Notification.permission === 'denied') reminders.status = 'denied';
  else reminders.status = (await currentSubscription().catch(() => null)) ? 'on' : 'off';
  emit();
  return reminders.status;
}

/** `rearm`: het tijdstip is net ingesteld of gewijzigd, dus "vandaag al gemeld" opnieuw bepalen (zie rearmDate). */
async function upload(subscription, time, { rearm = false } = {}) {
  const client = await auth.getClient();
  const snapshot = await state.repo.snapshot();
  const summary = buildReminderSummary({ snapshot, today: state.today, settings: state.settings });
  await saveSubscription({
    client, userId: account.user.id, subscription: subscription.toJSON(), remindTime: time, timezone: state.settings.timezone, summary,
    lastNotifiedDate: rearm ? rearmDate({ time, now: new Date(), timeZone: state.settings.timezone }) : undefined,
  });
  lastUploaded = JSON.stringify([subscription.endpoint, time, state.settings.timezone, summary]);
}

let lastUploaded = '';
let uploadTimer = null;

/** Houdt de server bij: tijdstip, tijdzone en de samenvatting van de komende dagen. Doet niets als er niets veranderd is. */
export async function syncReminder({ force = false, rearm = false } = {}) {
  if (reminders.status !== 'on' || !navigator.onLine) return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    const snapshot = await state.repo.snapshot();
    const summary = buildReminderSummary({ snapshot, today: state.today, settings: state.settings });
    const signature = JSON.stringify([subscription.endpoint, reminders.time, state.settings.timezone, summary]);
    if (!force && signature === lastUploaded) return;
    await upload(subscription, reminders.time, { rearm });
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
    await upload(subscription, time, { rearm: true });
  } catch (error) {
    console.warn('herinnering aanzetten mislukt', error);
    await subscription?.unsubscribe().catch(() => {}); // geen half abonnement achterlaten
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
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return { ok: false, reason: 'no_device' };
  try {
    await upload(subscription, reminders.time); // eerst bijwerken: de testtekst komt uit de actuele samenvatting
    return await sendTestReminder({ client: await auth.getClient(), endpoint: subscription.endpoint, delaySeconds });
  } catch (error) {
    console.warn('testmelding mislukt', error);
    return { ok: false, reason: 'unknown' };
  }
}

let started = false;

export function initReminders() {
  if (started) return;
  started = true;
  refreshReminders().then(() => syncReminder());
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
