// De Edge Function send-review-mails: wanneer er gemaild wordt (vrijdag, de 25e, of beide in één mail), wat erin staat, de afmeldcode en de aanroep.
// Het bestand heeft geen imports, dus een data-URL is genoeg om het als gewone module te laden (zoals bij send-reminders).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../../supabase/functions/send-review-mails/index.ts', import.meta.url)), 'utf8');
const mails = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { kindsFor, isMailDue, localMoment, composeMail, unsubscribeToken, verifyUnsubscribeToken, handleRequest, run } = mails;

const AMS = 'Europe/Amsterdam';
// 2026-10-23 is een vrijdag; 2026-10-25 een zondag; 2026-09-25 is zowel de 25e als een vrijdag
const at = (iso) => new Date(iso);
const moment = (iso, zone = AMS) => localMoment(at(iso), zone);

test('kindsFor: vrijdag is de week, de 25e is de maand, en beide op dezelfde dag is één gecombineerde mail', () => {
  assert.deepEqual(kindsFor(moment('2026-10-23T14:00:00Z')), { week: true, month: false, any: true });
  assert.deepEqual(kindsFor(moment('2026-10-25T14:00:00Z')), { week: false, month: true, any: true });
  assert.deepEqual(kindsFor(moment('2026-09-25T14:00:00Z')), { week: true, month: true, any: true });
  assert.deepEqual(kindsFor(moment('2026-10-22T14:00:00Z')), { week: false, month: false, any: false });
  assert.equal(moment('2026-10-23T14:00:00Z').weekday, 4);
});

test('localMoment: de lokale dag telt, niet die van de server (vrijdag 23:30 in Amsterdam is al zaterdag in Sydney)', () => {
  assert.equal(moment('2026-10-23T21:30:00Z').date, '2026-10-23');
  assert.equal(localMoment(at('2026-10-23T21:30:00Z'), 'Australia/Sydney').date, '2026-10-24');
  assert.throws(() => localMoment(at('2026-10-23T14:00:00Z'), 'Mars/Olympus'));
});

test('isMailDue: alleen binnen het venster van 16:00 tot 20:00 lokaal, en hoogstens één mail per dag', () => {
  const due = (iso, lastSentOn = null) => isMailDue({ moment: moment(iso), lastSentOn });
  assert.equal(due('2026-10-23T13:59:00Z'), false, '15:59 lokaal is te vroeg');
  assert.equal(due('2026-10-23T14:00:00Z'), true, '16:00 lokaal');
  assert.equal(due('2026-10-23T17:59:00Z'), true, '19:59 lokaal');
  assert.equal(due('2026-10-23T18:00:00Z'), false, '20:00 lokaal is voorbij het venster');
  assert.equal(due('2026-10-23T14:00:00Z', '2026-10-23'), false, 'vandaag al gemaild');
  assert.equal(due('2026-10-23T14:00:00Z', '2026-10-16'), true, 'vorige week gemaild: nu weer');
  assert.equal(due('2026-10-22T14:00:00Z'), false, 'donderdag');
});

test('composeMail: week, maand en gecombineerd; de links wijzen naar de review, zonder namen van habits', () => {
  const base = { name: 'Remco', appUrl: 'https://remcovolkers.github.io/habit-builder/', date: '2026-09-25', unsubscribeUrl: 'https://app/#/mail-uit/abc' };
  const week = composeMail({ ...base, kinds: { week: true, month: false } });
  assert.equal(week.subject, 'Je weekreview staat klaar');
  assert.match(week.text, /^Hoi Remco,/);
  assert.ok(week.text.includes('https://remcovolkers.github.io/habit-builder/#/stats?review=week&date=2026-09-25'));
  assert.ok(!week.text.includes('review=month'));

  const month = composeMail({ ...base, name: '', kinds: { week: false, month: true } });
  assert.equal(month.subject, 'Je maandreview staat klaar');
  assert.match(month.text, /^Hoi,/);
  assert.ok(month.text.includes('#/stats?review=month&date=2026-09-25'));

  const both = composeMail({ ...base, kinds: { week: true, month: true } });
  assert.equal(both.subject, 'Je week- en maandreview staan klaar');
  assert.ok(both.text.includes('review=week') && both.text.includes('review=month'));
  assert.equal((both.html.match(/<a href="https:\/\/remcovolkers[^"]*review=/g) ?? []).length, 2, 'twee knoppen');
  for (const mail of [week, month, both]) {
    assert.ok(mail.text.includes('Geen mails meer: https://app/#/mail-uit/abc'));
    assert.ok(mail.html.includes('https://app/#/mail-uit/abc'));
  }
});

test('composeMail: een naam met HTML wordt in de HTML-versie onschadelijk gemaakt', () => {
  const mail = composeMail({ kinds: { week: true, month: false }, name: '<script>alert(1)</script>', appUrl: 'https://x/', date: '2026-10-23', unsubscribeUrl: 'https://x/u' });
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(mail.html.includes('&lt;script&gt;'));
});

test('afmeldcode: ondertekend, dus niemand kan een ander afmelden', async () => {
  const user = '00000000-0000-4000-8000-000000000001';
  const token = await unsubscribeToken(user, 'geheim');
  assert.equal(await verifyUnsubscribeToken(token, 'geheim'), user);
  assert.equal(await verifyUnsubscribeToken(token, 'ander geheim'), null);
  assert.equal(await verifyUnsubscribeToken(`00000000-0000-4000-8000-000000000002.${token.split('.')[1]}`, 'geheim'), null, 'andere gebruiker, dezelfde handtekening');
  for (const bad of [undefined, '', 'x', `${user}.`, `${user}.a.b`, 'niet-een-uuid.abc']) assert.equal(await verifyUnsubscribeToken(bad, 'geheim'), null, String(bad));
});

// --- de aanroep ------------------------------------------------------------------------------------------------------------------------

const ENV = {
  SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sleutel', CRON_SECRET: 'cron', RESEND_API_KEY: 're_x',
  MAIL_FROM: 'Habit Builder <herinnering@example.nl>', APP_URL: 'https://remcovolkers.github.io/habit-builder/', UNSUBSCRIBE_SECRET: 'geheim',
};
const env = (overrides = {}) => (name) => ({ ...ENV, ...overrides })[name];
const USER = '00000000-0000-4000-8000-000000000001';
const candidate = (over = {}) => ({ user_id: USER, email: 'anna@x.nl', display_name: 'Anna', timezone: AMS, last_activity: '2026-09-01T10:00:00Z', last_sent_on: null, ...over });

/** Een nagebootste server: Supabase (RPC) en Resend. `calls` houdt bij wat er gebeurde. */
function fakeNetwork({ candidates = [candidate()], resend = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, headers: init?.headers });
    if (String(url).startsWith('https://api.resend.com/')) return new Response('{}', { status: resend });
    if (String(url).endsWith('/rpc/review_mail_candidates')) return new Response(JSON.stringify(candidates), { status: 200 });
    return new Response('null', { status: 200 });
  };
  return { fetchImpl, calls, sent: () => calls.filter((c) => c.url.startsWith('https://api.resend.com/')), rpcs: (name) => calls.filter((c) => c.url.endsWith(`/rpc/${name}`)) };
}
const post = (body, headers = {}, query = '') => new Request(`https://p.supabase.co/functions/v1/send-review-mails${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const cron = (body = {}) => post(body, { 'x-cron-secret': 'cron' });

test('cron: op vrijdag om 16:00 lokaal gaat er een weekmail uit, en daarna wordt het gemeld', async () => {
  const net = fakeNetwork();
  const response = await handleRequest(cron(), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-23T14:00:00Z') });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual([result.checked, result.due, result.sent, result.failed], [1, 1, 1, 0]);
  const [mail] = net.sent();
  assert.equal(mail.body.to[0], 'anna@x.nl');
  assert.equal(mail.body.from, 'Habit Builder <herinnering@example.nl>');
  assert.equal(mail.body.subject, 'Je weekreview staat klaar');
  assert.match(mail.body.headers['List-Unsubscribe'], /^<https:\/\/p\.supabase\.co\/functions\/v1\/send-review-mails\?u=00000000-0000-4000-8000-000000000001\./);
  assert.equal(mail.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal(mail.headers.Authorization, 'Bearer re_x');
  assert.deepEqual(net.rpcs('review_mail_mark_sent')[0].body, { p_user: USER, p_on: '2026-10-23' });
});

test('cron: de 25e op een vrijdag geeft één gecombineerde mail, geen twee', async () => {
  const net = fakeNetwork();
  const result = await (await handleRequest(cron(), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-09-25T14:00:00Z') })).json();
  assert.equal(result.sent, 1);
  assert.equal(net.sent().length, 1);
  assert.equal(net.sent()[0].body.subject, 'Je week- en maandreview staan klaar');
});

test('cron: de 25e op een andere dag is alleen de maandmail', async () => {
  const net = fakeNetwork();
  // 25 oktober 2026 is de dag dat de klok teruggaat: 16:00 lokaal is dan 15:00 UTC (daarvoor was het 14:00 UTC)
  await handleRequest(cron(), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-25T15:00:00Z') });
  assert.equal(net.sent()[0].body.subject, 'Je maandreview staat klaar');
});

test('cron: niets op andere dagen, buiten het venster, of als er vandaag al gemaild is; een onbekende tijdzone slaat alleen die over', async () => {
  const net = fakeNetwork({ candidates: [candidate(), candidate({ user_id: '00000000-0000-4000-8000-000000000002', timezone: 'Mars/Olympus' }), candidate({ user_id: '00000000-0000-4000-8000-000000000003', last_sent_on: '2026-10-23' })] });
  const friday = await (await handleRequest(cron(), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-23T14:00:00Z') })).json();
  assert.deepEqual(friday.decisions.map((d) => d.outcome), ['verstuurd', 'onbekende_tijdzone', 'vandaag_al_gemaild']);
  for (const [label, iso] of [['donderdag', '2026-10-22T14:00:00Z'], ['te vroeg', '2026-10-23T10:00:00Z'], ['te laat', '2026-10-23T19:00:00Z']]) {
    const quiet = fakeNetwork();
    const result = await (await handleRequest(cron(), { env: env(), fetchImpl: quiet.fetchImpl, now: at(iso) })).json();
    assert.equal(result.sent, 0, label);
    assert.equal(quiet.sent().length, 0, label);
  }
});

test('cron: een weigering van de mailservice telt als mislukt en wordt niet als verstuurd gemeld (volgend uur opnieuw)', async () => {
  const net = fakeNetwork({ resend: 422 });
  const result = await (await handleRequest(cron(), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-23T14:00:00Z') })).json();
  assert.deepEqual([result.sent, result.failed], [0, 1]);
  assert.equal(result.decisions[0].outcome, 'mailservice_weigerde_422');
  assert.equal(net.rpcs('review_mail_mark_sent').length, 0);
});

test('cron: dryRun toont wie een mail zou krijgen zonder te mailen, en `now` laat een andere dag nabootsen', async () => {
  const net = fakeNetwork();
  const result = await (await handleRequest(cron({ dryRun: true, now: '2026-10-23T14:00:00Z' }), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-01-01T00:00:00Z') })).json();
  assert.equal(result.mode, 'dry-run');
  assert.deepEqual(result.decisions.map((d) => d.outcome), ['zou_mailen']);
  assert.equal(net.sent().length, 0);
  assert.equal(net.rpcs('review_mail_mark_sent').length, 0);
});

test('cron: hoogstens MAX_PER_RUN mails per aanroep; de rest volgt een uur later', async () => {
  const many = Array.from({ length: mails.MAX_PER_RUN + 5 }, (_, i) => candidate({ user_id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}` }));
  const net = fakeNetwork({ candidates: many });
  const result = await (await handleRequest(cron(), { env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-23T14:00:00Z') })).json();
  assert.equal(result.sent, mails.MAX_PER_RUN);
  assert.equal(result.decisions.filter((d) => d.outcome === 'volgende_ronde').length, 5);
});

test('toegang: zonder of met een verkeerd cron-geheim gebeurt er niets, en een niet-POST wordt geweigerd', async () => {
  for (const request of [post({}), post({}, { 'x-cron-secret': 'fout' })]) {
    const net = fakeNetwork();
    const response = await handleRequest(request, { env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-23T14:00:00Z') });
    assert.equal(response.status, 401);
    assert.equal(net.calls.length, 0, 'ook geen vraag aan de database');
  }
  assert.equal((await handleRequest(new Request('https://x/', { method: 'GET' }), { env: env() })).status, 405);
});

test('instellingen: ontbrekende geheimen worden bij naam genoemd', async () => {
  const response = await handleRequest(cron(), { env: env({ RESEND_API_KEY: '', MAIL_FROM: undefined }), fetchImpl: fakeNetwork().fetchImpl });
  assert.equal(response.status, 500);
  assert.deepEqual((await response.json()).missing, ['RESEND_API_KEY', 'MAIL_FROM']);
});

test('afmelden: met een goede code (body of one-click ?u=) zet de server de mail uit, zonder inloggen; "undo" zet hem weer aan', async () => {
  const token = await unsubscribeToken(USER, 'geheim');
  const net = fakeNetwork();
  const viaBody = await handleRequest(post({ unsubscribe: token }), { env: env(), fetchImpl: net.fetchImpl });
  assert.deepEqual([viaBody.status, (await viaBody.json()).subscribed], [200, false]);
  const oneClick = await handleRequest(post(undefined, { 'Content-Type': 'application/x-www-form-urlencoded' }, `?u=${token}`), { env: env(), fetchImpl: net.fetchImpl });
  assert.equal(oneClick.status, 200);
  const undo = await handleRequest(post({ unsubscribe: token, undo: true }), { env: env(), fetchImpl: net.fetchImpl });
  assert.equal((await undo.json()).subscribed, true);
  assert.deepEqual(net.rpcs('review_mail_set_opt_out').map((c) => c.body), [{ p_user: USER, p_opt_out: true }, { p_user: USER, p_opt_out: true }, { p_user: USER, p_opt_out: false }]);
});

test('afmelden: een verkeerde of aangepaste code doet niets', async () => {
  const net = fakeNetwork();
  const other = await unsubscribeToken('00000000-0000-4000-8000-000000000002', 'geheim');
  for (const token of ['rommel', `${USER}.${other.split('.')[1]}`]) {
    const response = await handleRequest(post({ unsubscribe: token }), { env: env(), fetchImpl: net.fetchImpl });
    assert.equal(response.status, 400);
  }
  assert.equal(net.rpcs('review_mail_set_opt_out').length, 0);
});

test('run: een kapotte kandidaat (bijvoorbeeld zonder tijdzone) stopt de rest niet', async () => {
  const net = fakeNetwork();
  const result = await run({ candidates: [candidate({ timezone: null }), candidate({ user_id: '00000000-0000-4000-8000-000000000009' })], db: { markSent: async () => {} }, env: env(), fetchImpl: net.fetchImpl, now: at('2026-10-23T14:00:00Z') });
  assert.deepEqual([result.sent, result.skipped], [1, 1]);
});
