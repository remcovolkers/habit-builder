// @ts-nocheck
// (gewone JavaScript zonder typeannotaties: Supabase hoeft hem niet te typechecken)
// Edge Function `send-review-mails`: stuurt de e-mailherinnering voor de week- en maandreview aan accounts die er even niet waren.
//
//   • Wie: accounts met een e-mailadres, zonder activiteit in de laatste 14 dagen ("stale"), niet afgemeld, en hoogstens 3 onbeantwoorde mails
//     achter elkaar (zie review_mail_candidates in supabase/migrations/0008_review_mails.sql).
//   • Wanneer: op vrijdag de weekreview, op de 25e de maandreview (valt de 25e op een vrijdag, dan één gecombineerde mail). In de lokale tijd van
//     het account, tussen 16:00 en 20:00; de planning roept de functie elk uur aan, en per account gaat er hoogstens één mail per dag uit.
//   • Hoe: pg_cron roept hem aan met de header `x-cron-secret`. Mailen gaat via de HTTP-API van Resend (SMTP-poorten zijn op Supabase dicht).
//   • Afmelden: elke mail heeft een link naar de app en een List-Unsubscribe-header. Beide werken zonder inloggen, met een ondertekende code.
//
// Bewust één bestand, zonder imports: je kunt het in het Supabase-dashboard plakken, en de tests laden precies dit bestand (tests/push/*).
//
// Geheimen (Edge Functions → Secrets), nooit in de repo:
//   RESEND_API_KEY, MAIL_FROM ("Habit Builder <herinnering@jouwdomein.nl>"), APP_URL (https://remcovolkers.github.io/habit-builder/),
//   UNSUBSCRIBE_SECRET (lang en willekeurig), CRON_SECRET (hetzelfde als bij send-reminders)
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zet Supabase zelf in de omgeving van de functie.

const encoder = new TextEncoder();

export const STALE_DAYS = 14;
export const MAX_UNANSWERED = 3;
/** Het venster (lokale tijd) waarin de mail uitgaat: vanaf dit uur en nog `SEND_WINDOW_HOURS` uur, voor als een uurlijkse aanroep wordt overgeslagen. */
export const SEND_FROM_HOUR = 16;
export const SEND_WINDOW_HOURS = 4;
/** Hoeveel mails één aanroep hoogstens verstuurt (de rest volgt een uur later, binnen het venster). */
export const MAX_PER_RUN = 100;

// ============================================================================================
// Wanneer en wat: puur, dus testbaar
// ============================================================================================
/** De lokale datum ('2026-10-23'), het uur en de weekdag (0 = maandag … 6 = zondag) in een tijdzone. Gooit bij een onbekende tijdzone. */
export function localMoment(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  return { date: iso, hour: Number(parts.hour), weekday: (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7, day: Number(parts.day) };
}

/** Wat er op deze lokale dag te mailen valt: vrijdag = weekreview, de 25e = maandreview. Beide op dezelfde dag = één gecombineerde mail. */
export function kindsFor(moment) {
  const week = moment.weekday === 4;
  const month = moment.day === 25;
  return { week, month, any: week || month };
}

/** Is dit account nu aan de beurt? (juiste dag, binnen het venster en vandaag nog geen mail.) */
export function isMailDue({ moment, lastSentOn }) {
  return kindsFor(moment).any
    && moment.hour >= SEND_FROM_HOUR && moment.hour < SEND_FROM_HOUR + SEND_WINDOW_HOURS
    && lastSentOn !== moment.date;
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * De mail. Zonder namen van habits (de server kent die niet), kort en zonder verwijt. Geeft { subject, text, html }.
 * `kinds` komt uit kindsFor; bij beide staan er twee knoppen.
 */
export function composeMail({ kinds, name, appUrl, date, unsubscribeUrl }) {
  const base = String(appUrl).replace(/#.*$/, '');
  const link = (review) => `${base}#/stats?review=${review}&date=${date}`;
  const hello = name ? `Hoi ${name},` : 'Hoi,';
  const both = kinds.week && kinds.month;
  const subject = both ? 'Je week- en maandreview staan klaar' : kinds.month ? 'Je maandreview staat klaar' : 'Je weekreview staat klaar';
  const intro = both
    ? 'Het is vrijdag, en de maand loopt bijna af. Tijd om even terug te kijken op je week én je maand.'
    : kinds.month
      ? 'De maand loopt bijna af. Tijd om even terug te kijken en te kiezen wat je volgende maand aanpast.'
      : 'Het is vrijdag. Tijd om even terug te kijken op je week.';
  const how = both
    ? 'Bij de week: wat ging goed en wat ging slecht? Bij de maand: wat pas je aan? Dat wordt op de eerste van de volgende maand een kleine taak op Vandaag.'
    : kinds.month
      ? 'Wat pas je aan? Dat wordt op de eerste van de volgende maand een kleine taak op Vandaag.'
      : 'Wat ging goed en wat ging slecht? Het kost twee minuten.';
  const gap = 'Je hebt Habit Builder even niet gebruikt. Dat is niet erg: je gewoontes staan nog voor je klaar.';
  const links = [];
  if (kinds.week) links.push({ label: 'Naar je weekreview', href: link('week') });
  if (kinds.month) links.push({ label: 'Naar je maandreview', href: link('month') });
  const footer = 'Je krijgt deze mail omdat je een account hebt bij Habit Builder en er een tijdje niet was. Hoogstens drie keer achter elkaar, en alleen op vrijdag (week) en de 25e (maand).';

  const text = [hello, '', intro, how, '', gap, '', ...links.map((l) => `${l.label}: ${l.href}`), '', '--', footer, `Geen mails meer: ${unsubscribeUrl}`].join('\n');
  const html = `<!doctype html><html lang="nl"><body style="margin:0;padding:24px;background:#f4f6f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14201c">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 12px;font-size:16px">${escapeHtml(hello)}</p>
<p style="margin:0 0 12px;font-size:16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 12px;font-size:16px">${escapeHtml(how)}</p>
<p style="margin:0 0 20px;font-size:14px;color:#4b5a54">${escapeHtml(gap)}</p>
${links.map((l) => `<p style="margin:0 0 12px"><a href="${escapeHtml(l.href)}" style="display:inline-block;background:#1f9d76;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px">${escapeHtml(l.label)}</a></p>`).join('\n')}
<hr style="border:none;border-top:1px solid #e1e7e4;margin:20px 0">
<p style="margin:0 0 6px;font-size:12px;color:#6b7a74">${escapeHtml(footer)}</p>
<p style="margin:0;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7a74">Geen mails meer</a></p>
</div></body></html>`;
  return { subject, text, html };
}

// ============================================================================================
// Afmeldcode: ondertekend met UNSUBSCRIBE_SECRET, zodat niemand een ander kan afmelden
// ============================================================================================
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sign(userId, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`unsubscribe:${userId}`))));
}

/** '<gebruiker>.<handtekening>' */
export async function unsubscribeToken(userId, secret) {
  return `${userId}.${await sign(userId, secret)}`;
}

/** Het account waar de code bij hoort, of null als de code niet klopt. */
export async function verifyUnsubscribeToken(token, secret) {
  const [userId, signature, ...rest] = String(token ?? '').split('.');
  if (rest.length > 0 || !UUID.test(userId ?? '') || !signature) return null;
  return safeEqual(signature, await sign(userId, secret)) ? userId : null;
}

/** Gelijke strings vergelijken zonder dat de duur verraadt hoeveel tekens klopten. */
function safeEqual(a, b) {
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// ============================================================================================
// Supabase (service role) en Resend
// ============================================================================================
function createDb({ url, key, fetchImpl }) {
  const rpc = async (fn, args) => {
    const response = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`${fn}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    candidates: () => rpc('review_mail_candidates', { p_stale_days: STALE_DAYS, p_max_unanswered: MAX_UNANSWERED }),
    markSent: (userId, date) => rpc('review_mail_mark_sent', { p_user: userId, p_on: date }),
    setOptOut: (userId, optOut) => rpc('review_mail_set_opt_out', { p_user: userId, p_opt_out: optOut }),
  };
}

/** Eén mail via Resend. Geeft { ok, status }. */
export async function sendMail({ apiKey, from, to, mail, unsubscribeUrl, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  return { ok: response.ok, status: response.status };
}

// ============================================================================================
// De aanroep
// ============================================================================================
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const shortId = (id) => String(id).slice(0, 8);

/** Verwerkt de kandidaten. `dryRun`: alleen kijken wie er een mail zou krijgen, niets versturen. */
export async function run({ candidates, db, env, fetchImpl, now, dryRun = false }) {
  const appUrl = env('APP_URL');
  const functionUrl = `${env('SUPABASE_URL')}/functions/v1/send-review-mails`;
  const result = { checked: candidates.length, due: 0, sent: 0, failed: 0, skipped: 0, decisions: [] };
  const decide = (candidate, outcome) => result.decisions.push({ id: shortId(candidate.user_id), outcome });

  for (const candidate of candidates) {
    let moment;
    try {
      moment = localMoment(now, candidate.timezone);
    } catch {
      result.skipped++;
      decide(candidate, 'onbekende_tijdzone');
      continue;
    }
    if (!isMailDue({ moment, lastSentOn: candidate.last_sent_on })) {
      result.skipped++;
      decide(candidate, !kindsFor(moment).any ? 'geen_mailmoment_vandaag' : candidate.last_sent_on === moment.date ? 'vandaag_al_gemaild' : 'buiten_het_tijdvenster');
      continue;
    }
    result.due++;
    if (dryRun) {
      decide(candidate, 'zou_mailen');
      continue;
    }
    if (result.sent + result.failed >= MAX_PER_RUN) {
      result.skipped++;
      decide(candidate, 'volgende_ronde');
      continue;
    }
    try {
      const token = await unsubscribeToken(candidate.user_id, env('UNSUBSCRIBE_SECRET'));
      const mail = composeMail({
        kinds: kindsFor(moment),
        name: String(candidate.display_name ?? '').slice(0, 30),
        appUrl,
        date: moment.date,
        unsubscribeUrl: `${String(appUrl).replace(/#.*$/, '')}#/mail-uit/${token}`,
      });
      const outcome = await sendMail({
        apiKey: env('RESEND_API_KEY'),
        from: env('MAIL_FROM'),
        to: candidate.email,
        mail,
        unsubscribeUrl: `${functionUrl}?u=${token}`,
        fetchImpl,
      });
      if (!outcome.ok) {
        result.failed++;
        decide(candidate, `mailservice_weigerde_${outcome.status}`);
        continue;
      }
      result.sent++;
      decide(candidate, 'verstuurd');
      await db.markSent(candidate.user_id, moment.date);
    } catch (error) {
      console.error('mailen mislukt', shortId(candidate.user_id), error?.message);
      result.failed++;
      decide(candidate, 'fout_bij_versturen');
    }
  }
  return result;
}

export async function handleRequest(request, { env, fetchImpl = fetch, now = new Date() }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'alleen POST' });

  const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_URL', 'UNSUBSCRIBE_SECRET'];
  const missing = need.filter((name) => !env(name));
  if (missing.length > 0) return json(500, { error: 'niet ingesteld', missing });
  const db = createDb({ url: env('SUPABASE_URL'), key: env('SUPABASE_SERVICE_ROLE_KEY'), fetchImpl });

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* geen body (bijvoorbeeld de "one-click" afmelding van een mailprogramma): dan is het een lege aanvraag */
  }

  // 1. Afmelden (of weer aanmelden) met de code uit de mail: zonder inloggen. Ook de "one-click" van een mailprogramma (POST naar ?u=<code>).
  const token = new URL(request.url).searchParams.get('u') ?? body?.unsubscribe;
  if (token !== undefined && token !== null && request.headers.get('x-cron-secret') === null) {
    const userId = await verifyUnsubscribeToken(token, env('UNSUBSCRIBE_SECRET'));
    if (!userId) return json(400, { error: 'ongeldige code' });
    await db.setOptOut(userId, body?.undo !== true);
    return json(200, { ok: true, subscribed: body?.undo === true });
  }

  // 2. De planning
  const cron = request.headers.get('x-cron-secret');
  if (cron === null || !safeEqual(cron, env('CRON_SECRET'))) return json(401, { error: 'geen toegang' });
  // `now` meegeven kan alleen met het cron-geheim: handig om een vrijdag of de 25e na te bootsen (samen met dryRun)
  const at = typeof body?.now === 'string' && !Number.isNaN(Date.parse(body.now)) ? new Date(body.now) : now;
  const candidates = await db.candidates();
  const outcome = await run({ candidates: candidates ?? [], db, env, fetchImpl, now: at, dryRun: body?.dryRun === true });
  if (outcome.sent > 0 || outcome.failed > 0) console.log('cron', JSON.stringify({ at: at.toISOString(), ...outcome }));
  return json(200, { mode: body?.dryRun === true ? 'dry-run' : 'cron', at: at.toISOString(), ...outcome });
}

// Supabase start de functie met Deno.serve; in de tests (Node) bestaat Deno niet en gebeurt er niets.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((request) => handleRequest(request, { env: (name) => Deno.env.get(name) }).catch((error) => {
    console.error('onverwachte fout', error);
    return json(500, { error: 'onverwachte fout' });
  }));
}
