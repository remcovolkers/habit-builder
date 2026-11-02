// iCalendar (RFC 5545) lezen, genoeg voor de agenda-feed die Google geeft (docs/AGENDA.md). Puur: tekst in, items uit.
//
// Erin: VEVENT met SUMMARY, DTSTART, DTEND of DURATION (datum, UTC, TZID of zwevend), RRULE (DAILY, WEEKLY, MONTHLY en YEARLY met INTERVAL, COUNT, UNTIL,
// BYDAY met ordinalen, BYMONTHDAY, BYMONTH, BYSETPOS en WKST), EXDATE, RDATE, RECURRENCE-ID (een los gewijzigde keer) en STATUS:CANCELLED.
// Er niet in: BYYEARDAY, BYWEEKNO en dergelijke (zo'n regel telt dan alleen de eerste keer), en of je een uitnodiging hebt afgewezen.
//
//   item = { id, title, date, start, end, allDay }
//   date  de dag in de tijdzone van de gebruiker; start en end 'HH:MM' (of null bij een hele dag); een afspraak over meer dagen krijgt een item per dag
import { addDays, addMonths, dayOfMonth, daysInMonth, diffDays, isValidDate, weekday } from './dates.js';

const DAY_MS = 86_400_000;
const WEEKDAYS = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const UNSUPPORTED_PARTS = ['BYYEARDAY', 'BYWEEKNO', 'BYHOUR', 'BYMINUTE', 'BYSECOND'];
/** Meer perioden dan dit gaan we niet af voor één afspraak (een dagelijkse afspraak van dertig jaar oud is 11.000 dagen). */
const MAX_PERIODS = 20_000;
export const TITLE_MAX = 120;

// ============================================================================================
// Tijdzones: een muurtijd ('2026-11-02' + '14:00:00') in een zone naar een moment, en terug
// ============================================================================================
const formatters = new Map();
const zoneChecks = new Map();

/** Kent dit toestel deze tijdzone? (Een Outlook-naam als "W. Europe Standard Time" niet.) */
export function knownZone(zone) {
  if (typeof zone !== 'string' || zone === '') return false;
  if (!zoneChecks.has(zone)) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: zone });
      zoneChecks.set(zone, true);
    } catch {
      zoneChecks.set(zone, false);
    }
  }
  return zoneChecks.get(zone);
}

function formatterFor(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formatters.get(zone);
}

/** De muurtijd van moment `ms` in `zone`: { date, minutes, seconds, asUtc } (asUtc = diezelfde muurtijd alsof hij in UTC lag). */
export function wallOf(ms, zone) {
  const p = Object.fromEntries(formatterFor(zone).formatToParts(ms).map((part) => [part.type, part.value]));
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes,
    seconds: Number(p.second),
    asUtc: Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)),
  };
}

/** Het moment waarop het in `zone` `date` `time` ('HH:MM:SS') is. Bij een uur dat niet bestaat of twee keer voorkomt (zomertijd) kiest dit een van de twee. */
export function instantOf(date, time, zone) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetAt = (ms) => wallOf(ms, zone).asUtc - Math.floor(ms / 1000) * 1000;
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// ============================================================================================
// Regels lezen
// ============================================================================================
function splitOutsideQuotes(text, separator) {
  const parts = [];
  let current = '';
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (char === separator && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** "DTSTART;TZID=Europe/Amsterdam:20261102T140000" → { name, params, value }, of null. */
function parseLine(line) {
  let quoted = false;
  let split = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const [name, ...rawParams] = splitOutsideQuotes(line.slice(0, split), ';');
  const params = {};
  for (const raw of rawParams) {
    const eq = raw.indexOf('=');
    if (eq > 0) params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.trim().toUpperCase(), params, value: line.slice(split + 1) };
}

const unfold = (text) => String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');

const unescapeText = (value) => value.replace(/\\([nN,;\\])/g, (_, char) => (char === 'n' || char === 'N' ? ' ' : char)).replace(/\s+/g, ' ').trim();

/**
 * Een datum of datum met tijd: { date, time, tz }. time = null is een hele dag; tz = 'UTC' (Z achter de tijd), een bekende tijdzone (TZID) of null (zwevend:
 * de tijdzone van de gebruiker). Een TZID die dit toestel niet kent, telt als zwevend.
 */
export function parseDateValue(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidDate(date)) return null;
  if (m[4] === undefined || String(params.VALUE ?? '').toUpperCase() === 'DATE') return { date, time: null, tz: null };
  const time = `${m[4]}:${m[5]}:${m[6] ?? '00'}`;
  return { date, time, tz: m[7] ? 'UTC' : (knownZone(params.TZID) ? params.TZID : null) };
}

/** "P1DT2H30M", "PT45M", "P2W" → milliseconden, of null. */
function parseDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const [weeks, days, hours, minutes, seconds] = m.slice(2).map((part) => Number(part ?? 0));
  const ms = (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60_000 + seconds * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRule(value) {
  const parts = {};
  for (const piece of String(value).split(';')) {
    const [key, val] = piece.split('=');
    if (key && val !== undefined) parts[key.trim().toUpperCase()] = val.trim();
  }
  if (!FREQUENCIES.includes(parts.FREQ)) return null;
  const numbers = (text) => (text ? text.split(',').map(Number).filter(Number.isInteger) : []);
  const byday = (parts.BYDAY ? parts.BYDAY.split(',') : []).map((entry) => {
    const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(entry.trim().toUpperCase());
    return m ? { ord: m[1] ? Number(m[1]) : 0, wd: WEEKDAYS[m[2]] } : null;
  }).filter(Boolean);
  return {
    freq: parts.FREQ,
    interval: Math.max(1, parseInt(parts.INTERVAL, 10) || 1),
    count: Number.isInteger(parseInt(parts.COUNT, 10)) ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL ? parseDateValue(parts.UNTIL) : null,
    byday,
    bymonthday: numbers(parts.BYMONTHDAY),
    bymonth: numbers(parts.BYMONTH),
    bysetpos: numbers(parts.BYSETPOS),
    wkst: WEEKDAYS[parts.WKST] ?? 0,
    unsupported: UNSUPPORTED_PARTS.some((key) => key in parts),
  };
}

/** Alle VEVENT's uit de tekst, als { uid, title, start, end, durationMs, rule, exdates, rdates, recurrenceId, cancelled }. Zonder geldige DTSTART valt een afspraak weg. */
export function parseEvents(text) {
  const events = [];
  let current = null;
  let nested = 0; // een VALARM of ander onderdeel binnen de afspraak: de regels daarin zijn niet van de afspraak zelf
  for (const line of unfold(text)) {
    const prop = line === '' ? null : parseLine(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      if (prop.value.trim().toUpperCase() === 'VEVENT') {
        current = { uid: '', title: '', start: null, end: null, durationMs: null, rule: null, exdates: [], rdates: [], recurrenceId: null, cancelled: false };
        nested = 0;
      } else if (current) {
        nested++;
      }
      continue;
    }
    if (prop.name === 'END') {
      if (prop.value.trim().toUpperCase() === 'VEVENT') {
        if (current?.start) events.push(current);
        current = null;
      } else if (current) {
        nested--;
      }
      continue;
    }
    if (!current || nested > 0) continue;
    const dates = () => prop.value.split(',').map((one) => parseDateValue(one, prop.params)).filter(Boolean);
    switch (prop.name) {
      case 'UID': current.uid = prop.value.trim(); break;
      case 'SUMMARY': current.title = unescapeText(prop.value).slice(0, TITLE_MAX); break;
      case 'DTSTART': current.start = parseDateValue(prop.value, prop.params); break;
      case 'DTEND': current.end = parseDateValue(prop.value, prop.params); break;
      case 'DURATION': current.durationMs = parseDuration(prop.value); break;
      case 'RRULE': current.rule = parseRule(prop.value); break;
      case 'EXDATE': current.exdates.push(...dates()); break;
      case 'RDATE': current.rdates.push(...dates()); break;
      case 'RECURRENCE-ID': current.recurrenceId = parseDateValue(prop.value, prop.params); break;
      case 'STATUS': current.cancelled = prop.value.trim().toUpperCase() === 'CANCELLED'; break;
      default: break;
    }
  }
  return events;
}

// ============================================================================================
// Herhalingen
// ============================================================================================
const ordinalDay = (monthFirst, { ord, wd }) => {
  const all = [];
  for (let d = monthFirst; d.slice(0, 7) === monthFirst.slice(0, 7); d = addDays(d, 1)) if (weekday(d) === wd) all.push(d);
  if (ord === 0) return all;
  const picked = ord > 0 ? all[ord - 1] : all[all.length + ord];
  return picked ? [picked] : [];
};

/** De dagen van één maand die de regel kiest (BYDAY met of zonder ordinaal, BYMONTHDAY, of de dag van de eerste keer). */
function monthCandidates(rule, monthFirst, startDay) {
  const year = Number(monthFirst.slice(0, 4));
  const month = Number(monthFirst.slice(5, 7));
  const last = daysInMonth(year, month);
  const dayDate = (n) => `${monthFirst.slice(0, 8)}${String(n).padStart(2, '0')}`;
  const monthDays = rule.bymonthday.map((n) => (n > 0 ? n : last + 1 + n)).filter((n) => n >= 1 && n <= last);
  let days;
  if (rule.byday.length > 0) {
    days = rule.byday.flatMap((entry) => ordinalDay(monthFirst, entry));
    if (rule.bymonthday.length > 0) days = days.filter((d) => monthDays.includes(dayOfMonth(d)));
  } else if (rule.bymonthday.length > 0) {
    days = monthDays.map(dayDate);
  } else {
    days = startDay <= last ? [dayDate(startDay)] : []; // de 31e bestaat niet elke maand: die maand telt dan niet
  }
  return days;
}

/** De dagen die de regel kiest in periode `i` (de i-de stap van INTERVAL). Gesorteerd en zonder dubbelen. */
function periodCandidates(rule, start, i) {
  const step = i * rule.interval;
  let days;
  if (rule.freq === 'DAILY') {
    const day = addDays(start, step);
    days = [day].filter((d) => rule.byday.length === 0 || rule.byday.some((e) => e.wd === weekday(d)));
    if (rule.bymonthday.length > 0) days = days.filter((d) => rule.bymonthday.some((n) => (n > 0 ? n === dayOfMonth(d) : dayOfMonth(d) === daysInMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7))) + 1 + n)));
  } else if (rule.freq === 'WEEKLY') {
    const weekStart = addDays(start, -((weekday(start) - rule.wkst + 7) % 7) + 7 * step);
    const wanted = rule.byday.length > 0 ? [...new Set(rule.byday.map((e) => e.wd))] : [weekday(start)];
    days = wanted.map((wd) => addDays(weekStart, (wd - rule.wkst + 7) % 7));
  } else if (rule.freq === 'MONTHLY') {
    days = monthCandidates(rule, addMonths(start, step), dayOfMonth(start));
  } else {
    const year = Number(start.slice(0, 4)) + step;
    const months = rule.bymonth.length > 0 ? rule.bymonth : [Number(start.slice(5, 7))];
    days = months.flatMap((month) => monthCandidates(rule, `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`, dayOfMonth(start)));
  }
  if (rule.bymonth.length > 0 && rule.freq !== 'YEARLY') days = days.filter((d) => rule.bymonth.includes(Number(d.slice(5, 7))));
  days = [...new Set(days)].sort();
  if (rule.bysetpos.length > 0) {
    days = [...new Set(rule.bysetpos.map((pos) => (pos > 0 ? days[pos - 1] : days[days.length + pos])).filter(Boolean))].sort();
  }
  return days;
}

/** De eerste periode die nog de moeite van het bekijken waard is, zodat een agenda van tien jaar oud niet elke keer helemaal wordt doorlopen. */
function firstPeriod(rule, start, skipBefore) {
  if (skipBefore === null || skipBefore <= start) return 0;
  let periods;
  if (rule.freq === 'DAILY') periods = diffDays(skipBefore, start);
  else if (rule.freq === 'WEEKLY') periods = Math.floor(diffDays(skipBefore, addDays(start, -((weekday(start) - rule.wkst + 7) % 7))) / 7);
  else if (rule.freq === 'MONTHLY') periods = (Number(skipBefore.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(skipBefore.slice(5, 7)) - Number(start.slice(5, 7));
  else periods = Number(skipBefore.slice(0, 4)) - Number(start.slice(0, 4));
  return Math.max(0, Math.floor(periods / rule.interval) - 1);
}

/**
 * De dagen waarop de regel valt, oplopend, vanaf `start` tot en met `limit`. Met `skipBefore` mogen dagen daarvoor ontbreken, maar alleen zonder
 * COUNT (anders moet je vanaf het begin tellen).
 */
function* ruleDays(rule, start, limit, skipBefore) {
  const first = rule.count === null ? firstPeriod(rule, start, skipBefore) : 0;
  for (let i = first; i < first + MAX_PERIODS; i++) {
    const days = periodCandidates(rule, start, i);
    for (const day of days) {
      if (day > limit) return;
      if (day >= start) yield day;
    }
    // een periode zonder dagen kan nog volgen (de 31e); stoppen doen we pas als de periode zelf voorbij de grens ligt
    if (days.length === 0 && periodAnchor(rule, start, i) > limit) return;
  }
}

/** De eerste dag van periode `i`, om te weten wanneer we voorbij de grens zijn. */
function periodAnchor(rule, start, i) {
  const step = i * rule.interval;
  if (rule.freq === 'DAILY') return addDays(start, step);
  if (rule.freq === 'WEEKLY') return addDays(start, 7 * step - 7);
  if (rule.freq === 'MONTHLY') return addMonths(start, step);
  return `${String(Number(start.slice(0, 4)) + step).padStart(4, '0')}-01-01`;
}

// ============================================================================================
// Van afspraken naar items per dag
// ============================================================================================
const zoneOf = (dt, fallback) => dt.tz ?? fallback;

/** Waaraan we een keer herkennen voor EXDATE en RECURRENCE-ID: de dag bij een hele dag, anders het moment. */
function keyOf(dt, fallback) {
  return dt.time === null ? `d:${dt.date}` : `t:${instantOf(dt.date, dt.time, zoneOf(dt, fallback))}`;
}

/**
 * Items voor een afspraak die van moment `startMs` tot `endMs` duurt, voor de dagen from..to in de tijdzone van de gebruiker.
 * Eindigt hij precies om middernacht, dan hoort die laatste dag er niet meer bij. Op de eerste dag staat de begintijd; de dagen daarna zijn "hele dag".
 */
export function timedItems({ id, title, startMs, endMs, from, to, zone }) {
  const begin = wallOf(startMs, zone);
  const finish = endMs > startMs ? wallOf(endMs, zone) : null;
  const endsAtMidnight = finish !== null && finish.minutes === 0 && finish.seconds === 0;
  let lastDate = finish ? finish.date : begin.date;
  if (endsAtMidnight) lastDate = addDays(lastDate, -1);
  if (lastDate < begin.date) lastDate = begin.date;
  const items = [];
  for (let date = begin.date < from ? from : begin.date; date <= lastDate && date <= to; date = addDays(date, 1)) {
    const first = date === begin.date;
    items.push({
      id: `${id}|${date}`,
      title,
      date,
      start: first ? clock(begin.minutes) : null,
      end: first && finish && !endsAtMidnight && date === lastDate ? clock(finish.minutes) : null, // tot middernacht: alleen de begintijd
      allDay: !first,
    });
  }
  return items;
}

/** Items voor een hele-dag-afspraak die op `date` begint en `days` dagen duurt. */
export function wholeDayItems({ id, title, date, days, from, to }) {
  const items = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(date, i);
    if (day >= from && day <= to) items.push({ id: `${id}|${day}`, title, date: day, start: null, end: null, allDay: true });
  }
  return items;
}

function occurrenceItems(event, { from, to, zone, overridden }) {
  const { start, rule } = event;
  const eventZone = zoneOf(start, zone);
  const wholeDay = start.time === null;
  const id = event.uid || `${event.title}|${start.date}`;

  // hoe lang: een hele dag telt in dagen, de rest in milliseconden
  let spanDays = 1;
  let durationMs = 0;
  if (wholeDay) {
    if (event.end) spanDays = Math.max(1, diffDays(event.end.date, start.date));
    else if (event.durationMs !== null) spanDays = Math.max(1, Math.round(event.durationMs / DAY_MS));
  } else if (event.end?.time) {
    durationMs = Math.max(0, instantOf(event.end.date, event.end.time, zoneOf(event.end, zone)) - instantOf(start.date, start.time, eventZone));
  } else if (event.end) { // een datum als einde bij een afspraak met tijd: tot het begin van die dag
    durationMs = Math.max(0, instantOf(event.end.date, '00:00:00', eventZone) - instantOf(start.date, start.time, eventZone));
  } else if (event.durationMs !== null) {
    durationMs = Math.max(0, event.durationMs);
  }

  const excluded = new Set(event.exdates.map((dt) => keyOf(dt, zone)));
  const emit = (date, time) => {
    const key = wholeDay ? `d:${date}` : `t:${instantOf(date, time, eventZone)}`;
    if (excluded.has(key) || overridden.has(key)) return [];
    if (wholeDay) return wholeDayItems({ id: `${id}|${key}`, title: event.title, date, days: spanDays, from, to });
    const startMs = instantOf(date, time, eventZone);
    return timedItems({ id: `${id}|${key}`, title: event.title, startMs, endMs: startMs + durationMs, from, to, zone });
  };

  const time = start.time ?? '00:00:00';
  const extra = () => event.rdates.flatMap((dt) => emit(dt.date, dt.time ?? time)); // losse extra keren (RDATE)
  if (!rule || rule.unsupported) return [...emit(start.date, time), ...extra()];

  // Een keer die al begonnen is vóór `from` kan nog doorlopen (een afspraak van drie dagen): daarom beginnen we een dag per dag duur eerder.
  const reach = wholeDay ? spanDays : Math.ceil(durationMs / DAY_MS) + 1;
  const lookBack = addDays(from, -(reach + 1));
  const limit = addDays(to, 1); // een keer laat op de avond in een zone die ver van de onze ligt kan op een andere dag vallen
  let untilKey = Infinity;
  if (rule.until) untilKey = rule.until.time === null ? instantOf(addDays(rule.until.date, 1), '00:00:00', eventZone) - 1 : instantOf(rule.until.date, rule.until.time, zoneOf(rule.until, zone));

  const items = [];
  let counted = 0;
  for (const day of ruleDays(rule, start.date, limit, rule.count === null ? lookBack : null)) {
    if (instantOf(day, time, eventZone) > untilKey) break;
    if (rule.count !== null && ++counted > rule.count) break;
    items.push(...emit(day, time));
  }
  return [...items, ...extra()];
}

/**
 * Alle items van de agenda-tekst voor de dagen from..to ('YYYY-MM-DD', in de tijdzone `zone` van de gebruiker), oplopend op dag en begintijd.
 * Een afspraak met een eigen RECURRENCE-ID (een keer die je los hebt aangepast) vervangt die keer in de reeks; een geannuleerde keer verdwijnt.
 */
export function expandIcal(text, { from, to, zone }) {
  const events = parseEvents(text);
  const overrides = new Map(); // uid → de keren die door een los gewijzigde afspraak zijn vervangen
  for (const event of events) {
    if (!event.recurrenceId || !event.uid) continue;
    if (!overrides.has(event.uid)) overrides.set(event.uid, new Set());
    overrides.get(event.uid).add(keyOf(event.recurrenceId, zone));
  }
  const reach = (event) => (event.end ?? event.start).date;
  const items = [];
  for (const event of events) {
    if (event.cancelled) continue;
    // snel voorbij: een losse afspraak ver buiten het venster heeft geen tijdzonerekenwerk nodig
    if (!event.rule && event.rdates.length === 0 && (event.start.date > addDays(to, 2) || reach(event) < addDays(from, -2))) continue;
    if (event.rule?.until && event.rule.until.date < addDays(from, -2)) continue;
    const overridden = event.recurrenceId ? new Set() : (overrides.get(event.uid) ?? new Set());
    items.push(...occurrenceItems(event, { from, to, zone, overridden }));
  }
  return items.filter((item) => item.date >= from && item.date <= to).sort(byDayAndTime);
}

/** Op dag, dan op begintijd (een hele dag eerst), dan op naam. */
export const byDayAndTime = (a, b) => a.date.localeCompare(b.date) || String(a.start ?? '').localeCompare(String(b.start ?? '')) || a.title.localeCompare(b.title, 'nl');
