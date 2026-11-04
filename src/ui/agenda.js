// De agenda op Vandaag, de kant van de app (docs/AGENDA.md): koppelen, bewaren op dit toestel, verversen en aan Vandaag geven.
//
// Twee bronnen, die samen op Vandaag komen (en dubbele afspraken maar één keer):
//   • feed    het geheime iCal-adres van je Google-agenda; de Edge Function calendar-feed haalt hem op (alleen met een account), wij lezen hem (domain/ical.js)
//   • toestel de agenda op je telefoon (alleen in de Android-app); de telefoon rekent zelf herhalingen uit
//
// Alles staat alleen op dit toestel: het adres, de toestemming en de afspraken van de komende en vorige dagen. Niets gaat mee in de synchronisatie, de
// back-up of naar vrienden. Bij uitloggen of het verwijderen van je account wordt het gewist.
import { agendaOn, agendaStale, agendaWindow, deviceItems, deviceRange, doneId, mergeAgenda, normalizeFeedUrl, pruneDone } from '../domain/agenda.js';
import { expandIcal } from '../domain/ical.js';
import * as auth from '../data/auth.js';
import { fetchFeedText } from '../data/calendar-remote.js';
import { deviceCalendarAccess, deviceCalendarAvailable, readDeviceEvents, requestDeviceCalendarAccess } from '../data/device-calendar.js';
import { account, onAccountChanged, onBeforeLeave } from './account.js';
import { notifyViewChanged, state } from './state.js';

const SETTINGS_KEY = 'hb-agenda';
const CACHE_KEY = 'hb-agenda-cache';
const DONE_KEY = 'hb-agenda-done'; // wat je hebt afgevinkt, als { nummer: dag } (zie doneId)
/** Meer dan dit bewaren we niet per bron: een agenda met honderden afspraken per dag is geen agenda meer. */
const MAX_ITEMS = 1500;
/** De telefoon lezen kost niets, maar ook niet elke seconde: bij elke terugkeer naar de app is genoeg. */
const DEVICE_REFRESH_MS = 60_000;

const emptySource = () => ({ items: [], fetchedAt: null, span: null }); // span: welke dagen we hebben ({ from, to })

/**
 * De agenda met alles wat van buiten komt als parameter, zodat de tests hem zonder netwerk, opslag of telefoon kunnen draaien.
 * deps: { storage: { get, set, remove }, now, today, zone, signedIn, online, getClient, fetchText, device: { available, access, request, read }, notify }
 */
export function createAgenda(deps) {
  const model = {
    feedUrl: null, // het geheime adres, of null als er geen agenda is gekoppeld
    device: false, // gebruik de agenda van dit toestel
    deviceAccess: 'prompt', // 'granted' | 'denied' | 'prompt' | 'unavailable'
    feed: emptySource(),
    local: emptySource(),
    done: {}, // afgevinkte afspraken: { [doneId]: de dag van de afspraak }
    loading: false,
    feedError: null, // de reden (zie data/calendar-remote.js) van de laatste mislukte poging, of null
  };
  const listeners = new Set();
  const changed = ({ view = true } = {}) => {
    for (const listener of listeners) listener();
    if (view) deps.notify();
  };
  let busy = null;

  const read = (key) => {
    try {
      return JSON.parse(deps.storage.get(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      deps.storage.set(key, JSON.stringify(value));
    } catch {
      /* opslag vol of geblokkeerd: dan blijft de agenda werken tot je de app sluit */
    }
  };
  const persist = () => {
    if (model.feedUrl || model.device) write(SETTINGS_KEY, { feedUrl: model.feedUrl, device: model.device });
    else deps.storage.remove(SETTINGS_KEY);
    write(CACHE_KEY, { feed: model.feed, local: model.local });
    saveDone();
  };
  const saveDone = () => {
    model.done = pruneDone(model.done, deps.today());
    if (Object.keys(model.done).length > 0) write(DONE_KEY, model.done);
    else deps.storage.remove(DONE_KEY);
  };

  const validSource = (source) => (source && Array.isArray(source.items) && source.span && Number.isFinite(source.fetchedAt)
    ? { items: source.items.filter((item) => item && typeof item.title === 'string' && typeof item.date === 'string').slice(0, MAX_ITEMS), fetchedAt: source.fetchedAt, span: source.span }
    : emptySource());

  /** Leest wat er op dit toestel stond. */
  function load() {
    const settings = read(SETTINGS_KEY);
    model.feedUrl = typeof settings?.feedUrl === 'string' && normalizeFeedUrl(settings.feedUrl).ok ? settings.feedUrl : null;
    model.device = settings?.device === true;
    const cache = read(CACHE_KEY);
    model.feed = model.feedUrl ? validSource(cache?.feed) : emptySource();
    model.local = model.device ? validSource(cache?.local) : emptySource();
    const done = read(DONE_KEY);
    model.done = done && typeof done === 'object' && !Array.isArray(done) ? pruneDone(done, deps.today()) : {};
  }

  const range = () => agendaWindow(deps.today());

  async function refreshFeed({ force }) {
    if (!model.feedUrl || !deps.signedIn() || !deps.online()) return false;
    if (!force && !agendaStale({ cache: model.feed, today: deps.today(), now: deps.now() })) return false;
    model.loading = true;
    changed({ view: false });
    try {
      const result = await deps.fetchText({ client: await deps.getClient(), url: model.feedUrl });
      if (result.ok) {
        const span = range();
        model.feed = { items: expandIcal(result.text, { ...span, zone: deps.zone() }).slice(0, MAX_ITEMS), fetchedAt: deps.now(), span };
        model.feedError = null;
      } else {
        model.feedError = result.reason; // wat we al hadden blijft staan: een agenda die even niet bereikbaar is, is niet leeg
      }
    } catch (error) {
      console.warn('agenda ophalen mislukt', error?.name);
      model.feedError = 'unknown';
    } finally {
      model.loading = false;
    }
    return true;
  }

  async function refreshDevice({ force }) {
    if (!model.device || !deps.device.available()) return false;
    if (!force && !agendaStale({ cache: model.local, today: deps.today(), now: deps.now(), maxAgeMs: DEVICE_REFRESH_MS })) return false;
    model.deviceAccess = await deps.device.access();
    if (model.deviceAccess !== 'granted') { // de toestemming is ingetrokken in de instellingen van de telefoon
      model.local = emptySource();
      return true;
    }
    try {
      const span = range();
      const events = await deps.device.read(deviceRange({ ...span, zone: deps.zone() }));
      model.local = { items: deviceItems({ events, ...span, zone: deps.zone() }).slice(0, MAX_ITEMS), fetchedAt: deps.now(), span };
    } catch (error) {
      console.warn('agenda van het toestel lezen mislukt', error?.name);
    }
    return true;
  }

  /**
   * Haalt bij wat verouderd is. `force`: nu, ook als het nog vers is. Veilig om vaak aan te roepen: verversingen lopen een voor een, en een
   * die niets te doen vindt kost niets.
   */
  function refresh({ force = false } = {}) {
    const run = async () => {
      const feedChanged = await refreshFeed({ force });
      const deviceChanged = await refreshDevice({ force });
      if (feedChanged || deviceChanged) {
        persist();
        changed();
      }
    };
    const next = (busy ?? Promise.resolve()).then(run).catch((error) => console.warn('agenda verversen mislukt', error?.name)).finally(() => {
      if (busy === next) busy = null;
    });
    busy = next;
    return next;
  }

  return {
    model,
    load,
    refresh,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** De afspraken van één dag, met hun dagdeel, uit alle bronnen. */
    itemsFor: (date) => agendaOn({ items: mergeAgenda(model.local.items, model.feed.items), date }).map((item) => ({ ...item, done: Object.hasOwn(model.done, doneId(item)) })),

    /**
     * Vinkt een afspraak af of zet hem weer open. Dat blijft op dit toestel (het gaat niet mee in de synchronisatie) en telt nergens mee.
     * Geeft { undo }.
     */
    setDone(item, done) {
      const id = doneId(item);
      const before = Object.hasOwn(model.done, id) ? model.done[id] : null;
      const apply = (value) => {
        if (value === null) delete model.done[id];
        else model.done[id] = value;
        saveDone();
        changed();
      };
      apply(done ? item.date : null);
      return { undo: () => apply(before) };
    },

    /**
     * Koppelt een agenda met het adres dat de gebruiker plakte. Het adres wordt pas bewaard als de agenda echt is opgehaald.
     * Geeft { ok: true, count } (afspraken vanaf vandaag) of { ok: false, reason } (zie normalizeFeedUrl en data/calendar-remote.js).
     */
    async connectFeed(input) {
      const parsed = normalizeFeedUrl(input);
      if (!parsed.ok) return parsed;
      if (!deps.signedIn()) return { ok: false, reason: 'signed_out' };
      if (!deps.online()) return { ok: false, reason: 'offline' };
      const before = { url: model.feedUrl, feed: model.feed, error: model.feedError };
      model.feedUrl = parsed.url;
      const ok = await refreshFeed({ force: true }).then(() => model.feedError === null);
      if (!ok) {
        const reason = model.feedError;
        Object.assign(model, { feedUrl: before.url, feed: before.feed, feedError: before.error });
        changed({ view: false });
        return { ok: false, reason };
      }
      persist();
      changed();
      return { ok: true, count: model.feed.items.filter((item) => item.date >= deps.today()).length };
    },

    disconnectFeed() {
      Object.assign(model, { feedUrl: null, feed: emptySource(), feedError: null });
      persist();
      changed();
    },

    /** Zet de agenda van het toestel aan, en vraagt daarvoor de toestemming als dat nog moet. { ok: true } of { ok: false, reason: 'unavailable' | 'denied' }. */
    async enableDevice() {
      if (!deps.device.available()) return { ok: false, reason: 'unavailable' };
      let access = await deps.device.access();
      if (access === 'prompt') access = await deps.device.request();
      model.deviceAccess = access;
      if (access !== 'granted') {
        changed({ view: false });
        return { ok: false, reason: access === 'unavailable' ? 'unavailable' : 'denied' };
      }
      model.device = true;
      await refresh({ force: true });
      persist();
      changed();
      return { ok: true };
    },

    disableDevice() {
      Object.assign(model, { device: false, local: emptySource() });
      persist();
      changed();
    },

    /** Alles wissen: bij uitloggen en het verwijderen van je account. */
    clear() {
      Object.assign(model, { feedUrl: null, device: false, feed: emptySource(), local: emptySource(), done: {}, feedError: null });
      deps.storage.remove(SETTINGS_KEY);
      deps.storage.remove(CACHE_KEY);
      deps.storage.remove(DONE_KEY);
      changed();
    },
  };
}

const storage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => { try { localStorage.removeItem(key); } catch { /* opslag geblokkeerd: dan is er ook niets om te wissen */ } },
};

export const agenda = createAgenda({
  storage,
  now: () => Date.now(),
  today: () => state.today,
  zone: () => state.settings.timezone,
  signedIn: () => account.status === 'signed-in',
  online: () => globalThis.navigator?.onLine !== false,
  getClient: () => auth.getClient(),
  fetchText: fetchFeedText,
  device: { available: deviceCalendarAvailable, access: deviceCalendarAccess, request: requestDeviceCalendarAccess, read: readDeviceEvents },
  notify: notifyViewChanged,
});

/** Start de agenda: lees wat er op dit toestel staat en houd hem bij zolang de app openstaat. */
export function initAgenda() {
  agenda.load();
  onBeforeLeave(() => agenda.clear());
  onAccountChanged(() => { if (account.status === 'signed-in') agenda.refresh(); }); // na het inloggen of herstellen van de sessie
  document.addEventListener('visibilitychange', () => { if (!document.hidden) agenda.refresh(); });
  window.addEventListener('online', () => agenda.refresh());
  setInterval(() => { if (!document.hidden) agenda.refresh(); }, 5 * 60_000); // haalt alleen op wat verouderd is
  agenda.refresh();
}
