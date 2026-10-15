// De ochtendherinnering: wat de app naar de server stuurt en welk tijdstip mag (pure logica).
//
// De server begrijpt de habits zelf niet. De app stuurt per dag van de komende week één getal-paar mee:
// [hoeveel gewoontes er gepland staan, hoeveel taken er nog in de stapel liggen]. De server maakt daar de tekst van.
// Zo staan er geen namen van habits op de server-kant van de herinnering, en blijft de logica van "wat staat er
// vandaag" op één plek: hier, in de app.
import { addDays } from '../domain/dates.js';
import { DISPLAY_NAME_MAX } from './settings.js';
import { buildDayView } from './day-view.js';

export const DEFAULT_REMINDER_TIME = '08:00';
/** Hoeveel dagen vooruit we de samenvatting meegeven: zo klopt de melding ook als je een paar dagen niet opent. */
export const REMINDER_DAYS = 7;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Geeft null als het tijdstip goed is, anders een code voor de foutmelding. */
export function validateReminderTime(time, dayStartHour) {
  const match = TIME_RE.exec(String(time ?? ''));
  if (!match) return 'invalid';
  // vóór het begin van je dag hoort een melding bij de vorige dag; dat zou een verkeerde tekst geven
  if (Number(match[1]) < dayStartHour) return 'before_day_start';
  return null;
}

/** { name, days: { 'YYYY-MM-DD': [gepland, in de stapel] } } voor vandaag en de dagen erna. */
export function buildReminderSummary({ snapshot, today, settings, days = REMINDER_DAYS }) {
  const entries = {};
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const view = buildDayView({ snapshot, date, today });
    const planned = view.progress.total;
    const pool = view.pool.filter((entry) => !entry.satisfied).length;
    entries[date] = [planned, pool];
  }
  return { name: String(settings.displayName ?? '').trim().slice(0, DISPLAY_NAME_MAX), days: entries };
}

/**
 * Wat `last_notified_date` wordt als je het tijdstip instelt of wijzigt, zodat een nieuw tijdstip meteen geldt vanaf de eerstvolgende keer:
 *   • ligt het tijdstip nog voor je (vandaag), dan `null`: de melding komt vandaag nog, ook als er vandaag al een kwam;
 *   • is het tijdstip vandaag al voorbij, dan vandaag: de eerste melding is morgen (anders krijg je er meteen een als je 's middags
 *     het standaardtijdstip 08:00 aanzet).
 */
export function rearmDate({ time, now, timeZone }) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((part) => [part.type, part.value]),
  );
  const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes > nowMinutes ? null : `${parts.year}-${parts.month}-${parts.day}`;
}

/** De publieke VAPID-sleutel (base64url) als bytes, zoals pushManager.subscribe die wil. */
export function base64UrlToBytes(text) {
  const base64 = String(text).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(text).length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
