// De agenda op Vandaag (docs/AGENDA.md): afspraken uit je Google-agenda, alleen om te lezen. Ze zijn geen habit en geen losse afspraak van de app en tellen
// nergens mee. Puur: welk adres mag, welke dag en welk dagdeel, en hoe twee bronnen samengaan.
//
//   item = { id, title, date, start, end, allDay, calendar }   (zie domain/ical.js)
//   Een item van Vandaag heeft er een `daypart` bij.
import { addDays, isValidDate } from './dates.js';
import { BACKFILL_DAYS, PLAN_AHEAD_DAYS } from './constants.js';
import { byDayAndTime, CALENDAR_MAX, instantOf, TITLE_MAX, timedItems, wholeDayItems } from './ical.js';

const DAY_MS = 86_400_000;

/**
 * Van welke servers we een agenda-feed ophalen. Dezelfde lijst staat in de Edge Function calendar-feed (die bepaalt het echt: anders was het een open
 * doorgeefluik); een test bewaakt dat ze gelijk blijven. Een andere agenda (Outlook, iCloud) erbij is hier en daar een regel.
 */
export const FEED_HOSTS = Object.freeze(['calendar.google.com']);
/** Het pad van het "geheime adres in iCal-indeling" van Google, of van een openbare agenda. */
export const FEED_PATH = /^\/calendar\/ical\/[^/]+\/(?:private-[^/]+|public)\/basic\.ics$/;

/** Zo vaak (ms) halen we de agenda hoogstens opnieuw op zolang de app openstaat: Google ververst zijn feed zelf maar een paar keer per dag. */
export const AGENDA_REFRESH_MS = 30 * 60_000;
/** Zo ver terug en vooruit houden we de agenda bij: de dagen die Vandaag laat zien, met een week speling zodat een paar dagen niet-ververst niets mist. */
export const AGENDA_BACK_DAYS = BACKFILL_DAYS;
export const AGENDA_AHEAD_DAYS = PLAN_AHEAD_DAYS + 7;

/**
 * Het adres dat de gebruiker plakt, opgeschoond: { ok: true, url } of { ok: false, reason } met reason 'empty', 'invalid' (geen adres), 'host' (niet Google)
 * of 'path' (wel Google, maar niet het geheime iCal-adres: bijvoorbeeld de link naar de agenda zelf). webcal:// is hetzelfde als https://.
 */
export function normalizeFeedUrl(input) {
  const text = String(input ?? '').trim();
  if (text === '') return { ok: false, reason: 'empty' };
  let url;
  try {
    url = new URL(text.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return { ok: false, reason: 'invalid' };
  if (!FEED_HOSTS.includes(url.hostname)) return { ok: false, reason: 'host' };
  if (!FEED_PATH.test(url.pathname)) return { ok: false, reason: 'path' };
  return { ok: true, url: `${url.origin}${url.pathname}` };
}

/** De dagen die de agenda bijhoudt, vanaf de echte vandaag. */
export const agendaWindow = (today) => ({ from: addDays(today, -AGENDA_BACK_DAYS), to: addDays(today, AGENDA_AHEAD_DAYS) });

/** Is wat we bewaard hebben ({ fetchedAt, span: { from, to } }) aan een verversing toe? Te oud, of de dagen die Vandaag laat zien liggen niet meer binnen wat we hebben. */
export function agendaStale({ cache, today, now, maxAgeMs = AGENDA_REFRESH_MS }) {
  if (!cache || !cache.span || !Number.isFinite(cache.fetchedAt)) return true;
  if (now - cache.fetchedAt > maxAgeMs || now < cache.fetchedAt) return true; // een klok die terugsprong telt ook als verouderd
  return cache.span.from > addDays(today, -BACKFILL_DAYS) || cache.span.to < addDays(today, PLAN_AHEAD_DAYS);
}

/** Ochtend tot 12:00, middag tot 18:00, daarna avond; een hele dag (of zonder tijd) staat bij "Overdag". */
export function daypartOf(item) {
  if (item.allDay || !item.start) return 'anytime';
  const hour = Number(item.start.slice(0, 2));
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

/** De items van één dag met hun dagdeel, op dagdeel en tijd. */
export function agendaOn({ items, date }) {
  return items.filter((item) => item.date === date).sort(byDayAndTime).map((item) => ({ ...item, daypart: daypartOf(item) }));
}

/**
 * Waaraan we een afspraak herkennen: dezelfde dag, begintijd en naam. Zo telt dezelfde afspraak uit twee bronnen één keer (mergeAgenda), en blijft hij
 * afgevinkt als hij de volgende keer uit de andere bron komt. Verplaats of hernoem je hem in je agenda, dan is het een nieuwe afspraak en staat hij weer open.
 */
export const agendaKey = (item) => `${item.date}|${item.allDay ? 'dag' : item.start}|${item.title.trim().toLowerCase()}`;
const sameThing = agendaKey;

/**
 * Het nummer waaronder we bewaren dat een afspraak is afgevinkt. Een onleesbaar getal in plaats van de naam: wat je afvinkt, zegt zo niets over je agenda
 * als iemand de opslag van je toestel leest, en het hoeft niet mee te verdwijnen als je ontkoppelt. (cyrb53: geen beveiliging, wel zo weinig botsingen dat
 * twee afspraken van een paar weken elkaar niet raken.)
 */
export function doneId(item) {
  const text = agendaKey(item);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Wat afgevinkt is ({ [doneId]: dag }) zonder de dagen die je niet meer kunt bekijken, zodat het niet eindeloos groeit. */
export function pruneDone(done, today) {
  const oldest = addDays(today, -AGENDA_BACK_DAYS);
  return Object.fromEntries(Object.entries(done ?? {}).filter(([, date]) => typeof date === 'string' && date >= oldest));
}

/**
 * Voegt lijsten samen. Dezelfde afspraak uit twee bronnen (je Google-agenda zit ook op je telefoon) telt één keer: dezelfde dag, begintijd en naam.
 * Staat hij in beide, dan wint de eerste lijst.
 */
export function mergeAgenda(...lists) {
  const seen = new Set();
  const merged = [];
  for (const item of lists.flat()) {
    const key = sameThing(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort(byDayAndTime);
}

/**
 * Het bereik (ms) dat we de telefoon vragen voor de dagen from..to. Een dag extra aan beide kanten: een hele dag staat daar als middernacht UTC, en een
 * afspraak vlak voor of na middernacht kan in onze tijdzone op een andere dag vallen. Wat te veel is, filtert deviceItems weg.
 */
export function deviceRange({ from, to, zone }) {
  return { begin: instantOf(addDays(from, -1), '00:00:00', zone), end: instantOf(addDays(to, 2), '00:00:00', zone) };
}

/**
 * Wat de telefoon geeft (CalendarContract.Instances) naar items: [{ id, title, begin, end, allDay, calendar }] met begin en einde in milliseconden. De telefoon
 * rekent herhalingen zelf uit. Een hele dag staat daar als middernacht UTC tot middernacht UTC (het einde is de volgende dag).
 */
export function deviceItems({ events, zone, from, to }) {
  const items = [];
  for (const event of Array.isArray(events) ? events : []) {
    const begin = Number(event?.begin);
    const end = Number(event?.end);
    if (!Number.isFinite(begin) || !Number.isFinite(end)) continue;
    const title = String(event.title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
    const id = `device|${event.id ?? title}|${begin}`;
    const calendar = String(event.calendar ?? '').replace(/\s+/g, ' ').trim().slice(0, CALENDAR_MAX) || null;
    if (event.allDay) {
      const date = new Date(begin).toISOString().slice(0, 10);
      if (!isValidDate(date)) continue;
      items.push(...wholeDayItems({ id, title, date, days: Math.max(1, Math.round((end - begin) / DAY_MS)), from, to, calendar }));
    } else {
      items.push(...timedItems({ id, title, startMs: begin, endMs: end, from, to, zone, calendar }));
    }
  }
  return items.sort(byDayAndTime);
}
