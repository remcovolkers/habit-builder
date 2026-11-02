// Laadt de Edge Function calendar-feed als gewone module: het bestand heeft geen imports, dus een data-URL is genoeg.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FUNCTION_PATH = fileURLToPath(new URL('../../supabase/functions/calendar-feed/index.ts', import.meta.url));
export const feed = await import(`data:text/javascript;base64,${Buffer.from(readFileSync(FUNCTION_PATH, 'utf8')).toString('base64')}`);

export const GOOGLE_URL = 'https://calendar.google.com/calendar/ical/remco%40example.com/private-0123456789abcdef/basic.ics';
export const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Tandarts', 'DTSTART;VALUE=DATE:20261104', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

/** Een nagebootste server: Supabase (wie ben jij) en Google (de agenda). `google` is een functie (url) → Response. */
export function fakeNetwork({ user = { id: 'user-1' }, google = () => new Response(ICS, { status: 200 }) } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://project.supabase.test/auth/v1/user')) {
      return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response('{}', { status: 401 });
    }
    return google(String(url), init);
  };
  return { fetchImpl, calls };
}

export const env = (extra = {}) => (name) => ({ SUPABASE_URL: 'https://project.supabase.test', SUPABASE_ANON_KEY: 'anon', ...extra })[name];

export const post = (body, headers = { authorization: 'Bearer sessie' }) => new Request('https://functions.test/calendar-feed', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
