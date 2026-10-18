// Datumlogica op lokale datums als tekst ('YYYY-MM-DD'). Nooit timestamps in de domeinlogica:
// zo zijn zomertijd en tijdzones geen bron van bugs. Intern rekenen we in UTC-dagen.
// Weekdagen: 0 = maandag … 6 = zondag.
import { MAX_DAY_START_HOUR } from './constants.js';

const DAY_MS = 86_400_000;
const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const m = FORMAT.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function toUtc(date) {
  if (!isValidDate(date)) throw new RangeError(`Ongeldige datum: ${date}`);
  const m = FORMAT.exec(date);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms) {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export const addDays = (date, n) => fromUtc(toUtc(date) + n * DAY_MS);

/** a – b in hele dagen. */
export const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / DAY_MS);

export const weekday = (date) => (new Date(toUtc(date)).getUTCDay() + 6) % 7;
export const startOfWeek = (date) => addDays(date, -weekday(date));
export const endOfWeek = (date) => addDays(date, 6 - weekday(date));

/** Weeknummer volgens ISO 8601 (de week met de eerste donderdag van het jaar is week 1). */
export function isoWeek(date) {
  const thursday = addDays(startOfWeek(date), 3);
  return Math.floor(diffDays(thursday, `${thursday.slice(0, 4)}-01-01`) / 7) + 1;
}

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const dayOfMonth = (date) => Number(date.slice(8, 10));

export function startOfMonth(date) {
  toUtc(date);
  return `${date.slice(0, 8)}01`;
}

export function endOfMonth(date) {
  toUtc(date);
  const dim = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  return `${date.slice(0, 8)}${String(dim).padStart(2, '0')}`;
}

/** Eerste dag van de maand, n maanden verder (of terug). */
export function addMonths(date, n) {
  toUtc(date);
  const index = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

/** Alle datums from..to inclusief; leeg als from > to. */
export function eachDay(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * De lokale muurtijd in `timeZone` als 'YYYY-MM-DDTHH:MM', zonder dagwissel. Voor momenten die op de klok liggen, zoals het openen en
 * sluiten van een review (vrijdag 00:00, maandag 12:00). Tekst in dit formaat is op volgorde te vergelijken.
 */
export function localNow(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * De "vandaag" van de gebruiker: lokale muurtijd in `timeZone`, min `dayStartHour` uur.
 * Om 02:00 's nachts met dagwissel 04:00 is het dus nog gisteren. Rekent op de muurklok,
 * dus een zomertijdwissel verschuift niets.
 */
export function todayFor(now, timeZone, dayStartHour) {
  if (!Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > MAX_DAY_START_HOUR) {
    throw new RangeError(`dayStartHour moet een geheel getal van 0 t/m ${MAX_DAY_START_HOUR} zijn`);
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  const local = `${get('year')}-${get('month')}-${get('day')}`;
  return Number(get('hour')) < dayStartHour ? addDays(local, -1) : local;
}
