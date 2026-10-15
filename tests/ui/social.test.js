// De besturing van vrienden en ranglijst (src/ui/social.js), met een nagebootste server, opslag, klok en account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocial } from '../../src/ui/social.js';
import { createSocialCache } from '../../src/data/social-cache.js';
import { SocialError } from '../../src/data/social-remote.js';
import { addDays } from '../../src/domain/dates.js';

const TODAY = '2026-10-15';
const ME = 'u-me';
const CODE = 'ab'.repeat(32);

// ---- hulpmiddelen --------------------------------------------------------------------------------------------------------------

const memoryStorage = () => {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

/** Eén dagelijkse habit van lang geleden, dagelijks gedaan over het hele venster: 70 punten. */
function snapshotWith(days = 7) {
  const habit = { id: 'h', name: 'Lezen', icon: 'x', color: 'c1', daypart: 'anytime', status: 'active', startDate: '2025-01-01', endDate: null, sortOrder: 0, maintenance: false,
    schedules: [{ effectiveFrom: '2025-01-01', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } }] };
  const checkIns = [{ habitId: 'h', date: '2025-01-02', status: 'done' }];
  for (let i = 0; i < days; i++) checkIns.push({ habitId: 'h', date: addDays(TODAY, -i), status: 'done' });
  return { habits: [habit], checkIns, pauses: [], dayPlans: [], ratings: [] };
}

/** Een nagebootste server met instelbare antwoorden. `calls` onthoudt wat er is aangeroepen. */
function fakeRemote(data = {}) {
  const calls = [];
  const d = {
    me: { username: 'remco', display_name: 'Remco', enabled: true },
    friends: [], board: [], find: null, invites: [], failWith: {}, ...data,
  };
  const call = (name, produce) => async (...args) => {
    calls.push([name, ...args]);
    if (d.failWith[name]) throw d.failWith[name];
    return typeof produce === 'function' ? produce(...args) : produce;
  };
  const remote = {
    me: call('me', () => d.me),
    enable: call('enable', (username, name) => { d.me = { username, display_name: name, enabled: true }; return d.me; }),
    disable: call('disable', () => { d.me = { ...d.me, enabled: false }; }),
    find: call('find', () => d.find),
    request: call('request', { status: 'pending' }),
    respond: call('respond', (id, accept) => ({ status: accept ? 'accepted' : 'declined' })),
    cancel: call('cancel', true),
    remove: call('remove', true),
    friends: call('friends', () => d.friends),
    createInvite: call('createInvite', { id: 'inv1', code: CODE, expires_at: '2026-10-22T00:00:00Z' }),
    invites: call('invites', () => d.invites),
    revokeInvite: call('revokeInvite', true),
    redeemInvite: call('redeemInvite', () => d.redeem ?? { status: 'ok', user_id: 'u-anna', username: 'anna', display_name: 'Anna' }),
    publish: call('publish', undefined),
    leaderboard: call('leaderboard', () => d.board),
  };
  return { remote, calls, data: d, names: () => calls.map((c) => c[0]) };
}

const boardRow = (id, username, points, extra = {}) => ({ user_id: id, username, display_name: username[0].toUpperCase() + username.slice(1), points, done: points / 10, streak: 2, active_habits: 3, last_active: TODAY, as_of: TODAY, ...extra });

function setup({ remoteData, signedIn = true, userId = ME, online = true, snapshot = snapshotWith(), settings = { displayName: 'Remco' }, storage = memoryStorage() } = {}) {
  const fake = fakeRemote(remoteData);
  const env = {
    signedIn: () => env.state.signedIn, userId: () => env.state.userId, settings: () => env.state.settings, today: () => TODAY,
    snapshot: async () => env.state.snapshot, online: () => env.state.online, now: () => env.state.now, baseUrl: () => 'https://x.test/app/',
    state: { signedIn, userId, online, snapshot, settings, now: 1_000_000 },
  };
  const timers = [];
  const schedule = { set: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clear: (id) => { if (id) timers[id - 1] = null; } };
  const cache = createSocialCache(storage);
  const app = createSocial({ remote: fake.remote, cache, env, schedule });
  return { app, social: app.social, env, fake, cache, storage, timers, fire: async () => { const t = timers.filter(Boolean).at(-1); await t?.fn(); } };
}

// ---- wie sociaal niet gebruikt merkt er niets van --------------------------------------------------------------------------------

test('niet ingelogd: status "signed-out" en er gebeurt niets', async () => {
  const { app, social, fake } = setup({ signedIn: false });
  app.syncAccount();
  assert.equal(social.status, 'signed-out');
  assert.deepEqual(await app.refresh(), { ok: false, reason: 'signed-out' });
  assert.deepEqual(fake.calls, []);
});

test('ingelogd zonder cache: status "unknown" en er gaat NIETS over het netwerk, ook niet na een wijziging', async () => {
  const { app, social, fake, timers } = setup();
  app.syncAccount();
  assert.equal(social.status, 'unknown');
  app.scheduleRecompute();
  assert.equal(timers.length, 0, 'er wordt niets ingepland');
  assert.deepEqual(await app.publish(), { ok: false, reason: 'skipped' });
  assert.deepEqual(fake.calls, []);
});

test('de scherm-ververs bij "unknown" vraagt alleen het profiel; doet je niet mee, dan is dat alles', async () => {
  const { app, social, fake } = setup({ remoteData: { me: null } });
  assert.deepEqual(await app.refresh(), { ok: true });
  assert.equal(social.status, 'off');
  assert.deepEqual(fake.names(), ['me'], 'geen vrienden, ranglijst of publicatie');
  assert.deepEqual(social.board, []);
});

// ---- ophalen --------------------------------------------------------------------------------------------------------------------

test('doe je mee: profiel, vrienden en ranglijst worden opgehaald en je eigen samenvatting wordt gepubliceerd', async () => {
  const { app, social, fake } = setup({
    remoteData: {
      friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend', since: '2026-10-01' }, { user_id: 'u-bram', username: 'bram', display_name: 'Bram', state: 'incoming', since: '2026-10-14' }],
      board: [boardRow('u-anna', 'anna', 120), boardRow(ME, 'remco', 10)],
    },
  });
  assert.deepEqual(await app.refresh(), { ok: true });
  assert.equal(social.status, 'on');
  assert.deepEqual(social.friends.map((p) => p.name), ['Anna']);
  assert.deepEqual(social.incoming.map((p) => p.name), ['Bram']);
  assert.deepEqual(fake.names().sort(), ['friends', 'leaderboard', 'me', 'publish']);
  assert.deepEqual(fake.calls.find((c) => c[0] === 'publish')[1], { p_as_of: TODAY, p_points: 70, p_done: 7, p_streak: 7, p_active_habits: 1, p_last_active: TODAY });
  assert.equal(social.stale, false);
  assert.equal(social.fetchedAt, 1_000_000);
  assert.equal(social.error, null);
});

test('de ranglijst gebruikt je eigen, lokale punten (de server liep achter), en iedereen is gerangschikt', async () => {
  const { app, social } = setup({ remoteData: { board: [boardRow('u-anna', 'anna', 120), boardRow(ME, 'remco', 10)] } });
  await app.refresh();
  assert.deepEqual(social.board.map((r) => [r.name, r.points, r.rank, r.isMe]), [['Remco', 70, 2, true], ['Anna', 120, 1, false]].sort((a, b) => a[2] - b[2]));
  assert.equal(social.summary.points, 70);
  assert.deepEqual(Object.keys(social.summary.breakdown), ['tasks', 'bonus', 'start', 'penalty']);
});

test('een vriend die 3 dagen niets deed staat niet in de lijst; jezelf wel', async () => {
  const { app, social } = setup({ remoteData: { board: [boardRow('u-anna', 'anna', 120, { last_active: '2026-10-11' }), boardRow('u-bram', 'bram', 40)] } });
  await app.refresh();
  assert.deepEqual(social.board.map((r) => r.name), ['Remco', 'Bram'].sort((a, b) => (a === 'Remco' ? -1 : 1)));
});

test('twee ophaalrondes tegelijk delen één rondje', async () => {
  const { app, fake } = setup();
  await Promise.all([app.refresh(), app.refresh(), app.refresh({ background: true })]);
  assert.equal(fake.names().filter((n) => n === 'me').length, 1);
});

test('een voorgrond-verversing meldt "loading", een achtergrond-verversing niet', async () => {
  const { app, social } = setup();
  const seen = [];
  app.onChanged(() => seen.push(social.loading));
  await app.refresh({ background: true });
  assert.ok(seen.every((v) => v === false), 'achtergrond: nooit loading');
  seen.length = 0;
  await app.refresh();
  assert.equal(seen[0], true);
  assert.equal(social.loading, false);
});

// ---- cache en offline ------------------------------------------------------------------------------------------------------------

test('na een ophaalronde staat de cache klaar; een volgende start toont hem meteen en ververst op de achtergrond', async () => {
  const storage = memoryStorage();
  const first = setup({ storage, remoteData: { friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend' }], board: [boardRow('u-anna', 'anna', 120)] } });
  await first.app.refresh();

  const second = setup({ storage, remoteData: { friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend' }], board: [boardRow('u-anna', 'anna', 150)] } });
  second.app.syncAccount();
  assert.equal(second.social.status, 'on', 'direct uit de cache');
  assert.deepEqual(second.social.friends.map((p) => p.name), ['Anna']);
  assert.equal(second.social.stale, true);
  assert.ok(second.social.board.length >= 1, 'de ranglijst is er al');
  await new Promise((resolve) => setTimeout(resolve, 20)); // de achtergrond-verversing loopt
  assert.ok(second.fake.names().includes('me'), 'er wordt bijgewerkt');
  assert.equal(second.social.stale, false);
  assert.equal(second.social.board.find((r) => r.name === 'Anna').points, 150);
});

test('offline: de cache blijft staan, gemarkeerd als "stale", zonder fout of aanroep', async () => {
  const storage = memoryStorage();
  const online = setup({ storage, remoteData: { friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend' }], board: [boardRow('u-anna', 'anna', 120)] } });
  await online.app.refresh();

  const offline = setup({ storage, online: false });
  offline.app.syncAccount();
  assert.deepEqual(await offline.app.refresh(), { ok: false, reason: 'offline' });
  assert.equal(offline.social.status, 'on');
  assert.equal(offline.social.stale, true);
  assert.equal(offline.social.error, null);
  assert.deepEqual(offline.fake.calls, []);
  assert.deepEqual(offline.social.friends.map((p) => p.name), ['Anna']);
});

test('een verbinding die tijdens het ophalen wegvalt: de cache blijft en de status is "stale"', async () => {
  const storage = memoryStorage();
  await setup({ storage }).app.refresh();
  const flaky = setup({ storage, remoteData: { failWith: { me: new SocialError('offline') } } });
  flaky.app.syncAccount();
  const result = await flaky.app.refresh();
  assert.deepEqual(result, { ok: false, reason: 'offline' });
  assert.equal(flaky.social.status, 'on');
  assert.equal(flaky.social.stale, true);
});

test('de cache van een ander account wordt nooit getoond', async () => {
  const storage = memoryStorage();
  await setup({ storage, userId: 'u-ander', remoteData: { board: [boardRow('u-anna', 'anna', 120)] } }).app.refresh();
  const mine = setup({ storage, userId: ME });
  mine.app.syncAccount();
  assert.equal(mine.social.status, 'unknown');
  assert.deepEqual(mine.social.board, []);
});

test('van account wisselen begint opnieuw: lijsten leeg, de cache van het nieuwe account (als die er is)', async () => {
  const s = setup({ remoteData: { friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend' }], board: [boardRow('u-anna', 'anna', 120)] } });
  await s.app.refresh();
  assert.equal(s.social.friends.length, 1);
  s.env.state.userId = 'u-ander';
  s.app.syncAccount();
  assert.equal(s.social.status, 'unknown');
  assert.deepEqual(s.social.friends, []);
  assert.deepEqual(s.social.board, []);
});

test('uitloggen (leave) wist de cache, een onthouden uitnodiging en de status', async () => {
  const s = setup();
  await s.app.refresh();
  s.app.rememberInvite(CODE);
  assert.ok(s.storage.map.size > 0);
  s.app.leave();
  assert.equal(s.storage.map.size, 0, 'er blijft niets van dit account op het apparaat');
  assert.equal(s.social.status, 'signed-out');
  assert.deepEqual(s.social.board, []);
  const calls = s.fake.calls.length;
  await s.app.publish();
  assert.equal(s.fake.calls.length, calls, 'na uitloggen wordt er niets meer gepubliceerd');
});

// ---- publiceren -----------------------------------------------------------------------------------------------------------------

test('publiceren slaat over wat al is gepubliceerd, en publiceert opnieuw zodra er iets is veranderd of bij force', async () => {
  const s = setup();
  await s.app.refresh();
  const published = () => s.fake.names().filter((n) => n === 'publish').length;
  assert.equal(published(), 1);
  assert.deepEqual(await s.app.publish(), { ok: true, skipped: true });
  assert.equal(published(), 1);
  s.env.state.snapshot = snapshotWith(5);
  await s.app.recompute();
  assert.deepEqual(await s.app.publish(), { ok: true });
  assert.equal(published(), 2);
  await s.app.publish({ force: true });
  assert.equal(published(), 3);
});

test('publiceren doet niets zonder verbinding, en een mislukte publicatie wordt later opnieuw geprobeerd', async () => {
  const s = setup({ remoteData: { failWith: { publish: new SocialError('offline') } } });
  await s.app.refresh();
  assert.equal(s.social.stale, true);
  const attempts = () => s.fake.names().filter((n) => n === 'publish').length;
  assert.equal(attempts(), 1);
  delete s.fake.data.failWith.publish;
  assert.deepEqual(await s.app.publish(), { ok: true }, 'niet als gelukt onthouden');
  assert.equal(attempts(), 2);
  s.env.state.online = false;
  assert.deepEqual(await s.app.publish({ force: true }), { ok: false, reason: 'skipped' });
  assert.equal(attempts(), 2);
});

test('een ongeldige samenvatting (bijvoorbeeld een klok die niet klopt) breekt niets en toont geen fout', async () => {
  const s = setup({ remoteData: { failWith: { publish: new SocialError('invalid_summary') } } });
  const originalWarn = console.warn;
  console.warn = () => {};
  try { await s.app.refresh(); } finally { console.warn = originalWarn; }
  assert.equal(s.social.status, 'on');
  assert.equal(s.social.error, null);
});

test('na een wijziging wordt je eigen score even later bijgewerkt en gepubliceerd (alleen als sociaal aan staat)', async () => {
  const s = setup();
  await s.app.refresh();
  s.app.scheduleRecompute();
  assert.equal(s.timers.length, 1);
  s.app.scheduleRecompute();
  assert.equal(s.timers[0], null, 'de vorige timer is geannuleerd');
  s.env.state.snapshot = snapshotWith(4);
  await s.fire();
  assert.equal(s.social.summary.points, 40 - 15, 'lokaal direct bijgewerkt: 4 taken, en de 3 gemiste dagen kosten elk 5 (de reeks missers loopt al door)');
  assert.equal(s.fake.names().filter((n) => n === 'publish').length, 2);
  assert.deepEqual(s.social.board.find((r) => r.isMe).points, s.social.summary.points);
});

test('de naam uit Instellingen wordt bij je vrienden bijgewerkt voor het publiceren; gelijk blijft gelijk', async () => {
  const s = setup({ settings: { displayName: 'Remco V.' } });
  await s.app.refresh();
  assert.deepEqual(s.fake.calls.find((c) => c[0] === 'enable'), ['enable', 'remco', 'Remco V.']);
  assert.ok(s.fake.names().indexOf('enable') < s.fake.names().indexOf('publish'));
  assert.equal(s.social.me.display_name, 'Remco V.');
  const before = s.fake.names().filter((n) => n === 'enable').length;
  await s.app.publish({ force: true });
  assert.equal(s.fake.names().filter((n) => n === 'enable').length, before, 'de naam is al gelijk');
});

// ---- de server kent sociaal niet / sociaal uit -----------------------------------------------------------------------------------

test('kent de server sociaal nog niet (migratie niet uitgevoerd), dan is de status "unavailable" en blijft het daar stil', async () => {
  const s = setup({ remoteData: { failWith: { me: new SocialError('unavailable') } } });
  assert.deepEqual(await s.app.refresh(), { ok: false, reason: 'unavailable' });
  assert.equal(s.social.status, 'unavailable');
  assert.deepEqual(s.social.board, []);
  s.app.scheduleRecompute();
  assert.equal(s.timers.length, 0);
  assert.equal(s.app.needsRefresh(), false, 'geen zinloze pogingen');
});

test('zegt de server dat je niet meer meedoet (bijvoorbeeld uitgezet op een ander apparaat), dan wordt de status "off" en stopt het publiceren', async () => {
  const s = setup({ remoteData: { board: [boardRow('u-anna', 'anna', 120)] } });
  await s.app.refresh();
  s.fake.data.failWith.publish = new SocialError('not_enabled');
  s.env.state.snapshot = snapshotWith(3);
  await s.app.recompute();
  await s.app.publish();
  assert.equal(s.social.status, 'off');
  assert.deepEqual(s.social.board, []);
});

// ---- acties ---------------------------------------------------------------------------------------------------------------------

test('sociaal aanzetten: eerst de naamcontrole (zonder netwerk), dan aanzetten, publiceren en de lijsten ophalen', async () => {
  const s = setup({ remoteData: { me: null } });
  await s.app.refresh();
  assert.equal(s.social.status, 'off');
  s.fake.calls.length = 0;

  for (const [input, reason] of [['', 'empty'], ['ab', 'too_short'], ['a'.repeat(21), 'too_long'], ['a b c', 'invalid_chars']]) {
    assert.deepEqual(await s.app.enable({ username: input, displayName: 'Remco' }), { ok: false, reason });
  }
  assert.deepEqual(s.fake.calls, [], 'een ongeldige naam gaat niet naar de server');

  assert.deepEqual(await s.app.enable({ username: '  Remco_V ', displayName: ' Remco ' }), { ok: true });
  assert.deepEqual(s.fake.calls[0], ['enable', 'remco_v', 'Remco']);
  assert.equal(s.social.status, 'on');
  assert.ok(s.fake.names().includes('publish'));
  assert.ok(s.fake.names().includes('leaderboard'));
  assert.equal(s.social.board.length, 1, 'je staat er zelf al op');
  assert.equal(s.social.board[0].points, 70);
});

test('sociaal aanzetten met een bezette of verboden naam geeft de reden en verandert niets', async () => {
  for (const code of ['username_taken', 'username_not_allowed', 'username_change_too_soon', 'invalid_display_name']) {
    const s = setup({ remoteData: { me: null, failWith: { enable: new SocialError(code) } } });
    await s.app.refresh();
    assert.deepEqual(await s.app.enable({ username: 'remco', displayName: 'x' }), { ok: false, reason: code });
    assert.equal(s.social.status, 'off');
    assert.equal(s.social.error, null, 'een mislukte actie meldt zichzelf via het resultaat, niet via de status');
  }
});

test('sociaal uitzetten: server, status, lijsten en samenvatting leeg; daarna wordt er niets meer gepubliceerd', async () => {
  const s = setup({ remoteData: { friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend' }], board: [boardRow('u-anna', 'anna', 120)] } });
  await s.app.refresh();
  assert.deepEqual(await s.app.disable(), { ok: true });
  assert.equal(s.social.status, 'off');
  assert.deepEqual([s.social.friends, s.social.board, s.social.summary], [[], [], null]);
  const calls = s.fake.calls.length;
  s.app.scheduleRecompute();
  await s.app.publish();
  assert.equal(s.fake.calls.length, calls);
  assert.equal(s.cache.read(ME).me.enabled, false, 'ook de cache weet dat je niet meedoet');
});

test('acties zonder verbinding of zonder account geven een reden en raken de server niet', async () => {
  const offline = setup({ online: false });
  assert.deepEqual(await offline.app.request('u-anna'), { ok: false, reason: 'offline' });
  assert.deepEqual(await offline.app.createInvite(), { ok: false, reason: 'offline' });
  const out = setup({ signedIn: false });
  assert.deepEqual(await out.app.find('anna'), { ok: false, reason: 'signed-out' });
  assert.deepEqual(offline.fake.calls.concat(out.fake.calls), []);
});

test('zoeken: een ongeldige naam is "niet gevonden" zonder netwerk; een gevonden persoon heeft naam en relatie', async () => {
  const s = setup({ remoteData: { find: { id: 'u-anna', username: 'anna', display_name: 'Anna', relation: 'none' } } });
  await s.app.refresh();
  s.fake.calls.length = 0;
  assert.deepEqual(await s.app.find('a b'), { ok: true, person: null });
  assert.deepEqual(s.fake.calls, []);
  assert.deepEqual(await s.app.find(' Anna '), { ok: true, person: { userId: 'u-anna', username: 'anna', name: 'Anna', relation: 'none' } });
  assert.deepEqual(s.fake.calls[0], ['find', 'anna']);
  s.fake.data.find = null;
  assert.deepEqual(await s.app.find('niemand'), { ok: true, person: null });
});

test('zoeken geeft de serverfout door, bijvoorbeeld de begrenzing', async () => {
  const s = setup({ remoteData: { failWith: { find: new SocialError('too_many_requests') } } });
  await s.app.refresh();
  assert.deepEqual(await s.app.find('anna'), { ok: false, reason: 'too_many_requests' });
});

test('verzoeken: versturen, beantwoorden, intrekken en verwijderen werken de lijsten daarna bij', async () => {
  const s = setup();
  await s.app.refresh();
  for (const [name, run, args] of [
    ['request', () => s.app.request('u-anna'), ['request', 'u-anna']],
    ['respond (accepteren)', () => s.app.respond('u-anna', true), ['respond', 'u-anna', true]],
    ['respond (weigeren)', () => s.app.respond('u-anna', false), ['respond', 'u-anna', false]],
    ['cancel', () => s.app.cancel('u-anna'), ['cancel', 'u-anna']],
    ['remove', () => s.app.remove('u-anna'), ['remove', 'u-anna']],
  ]) {
    s.fake.calls.length = 0;
    const result = await run();
    assert.equal(result.ok, true, name);
    assert.deepEqual(s.fake.calls[0], args, name);
    assert.ok(s.fake.names().includes('friends') && s.fake.names().includes('leaderboard'), `${name}: lijsten opnieuw opgehaald`);
  }
  assert.deepEqual(await (async () => { s.fake.data.failWith.request = new SocialError('friend_limit'); return s.app.request('u-bram'); })(), { ok: false, reason: 'friend_limit' });
});

test('een uitnodiging maken geeft een link met de code; hij staat niet in de lijst, de lijst kent hem alleen met id', async () => {
  const s = setup({ remoteData: { invites: [{ id: 'inv1', created_at: 'x', expires_at: 'y' }] } });
  await s.app.refresh();
  const made = await s.app.createInvite();
  assert.deepEqual(made, { ok: true, id: 'inv1', code: CODE, expiresAt: '2026-10-22T00:00:00Z', link: `https://x.test/app/#/vrienden/uitnodiging/${CODE}` });
  assert.deepEqual((await s.app.invites()).invites, [{ id: 'inv1', created_at: 'x', expires_at: 'y' }]);
  assert.deepEqual(await s.app.revokeInvite('inv1'), { ok: true, revoked: true });
});

test('een uitnodiging inwisselen maakt vrienden (lijsten ververst) en vergeet de onthouden code', async () => {
  const s = setup({ remoteData: { friends: [{ user_id: 'u-anna', username: 'anna', display_name: 'Anna', state: 'friend' }] } });
  await s.app.refresh();
  assert.equal(s.app.rememberInvite(CODE), true);
  assert.equal(s.app.pendingInvite(), CODE);
  s.fake.calls.length = 0;
  const result = await s.app.redeemInvite(CODE.toUpperCase());
  assert.deepEqual(result, { ok: true, person: { userId: 'u-anna', username: 'anna', name: 'Anna', relation: null } });
  assert.deepEqual(s.fake.calls[0], ['redeemInvite', CODE]);
  assert.ok(s.fake.names().includes('friends'));
  assert.equal(s.app.pendingInvite(), null);
});

test('een ongeldige of verlopen uitnodiging geeft "invalid", wordt vergeten en zet geen fout in de status', async () => {
  const s = setup({ remoteData: { redeem: { status: 'invalid' } } });
  await s.app.refresh();
  s.app.rememberInvite(CODE);
  assert.deepEqual(await s.app.redeemInvite(CODE), { ok: false, reason: 'invalid' });
  assert.equal(s.app.pendingInvite(), null, 'een kapotte code blijft niet eindeloos terugkomen');
  assert.equal(s.social.error, null);
});

test('een uitnodiging die door een tijdelijke fout niet kon worden ingewisseld, blijft onthouden', async () => {
  const s = setup({ remoteData: { failWith: { redeemInvite: new SocialError('offline') } } });
  await s.app.refresh();
  s.app.rememberInvite(CODE);
  assert.deepEqual(await s.app.redeemInvite(CODE), { ok: false, reason: 'offline' });
  assert.equal(s.app.pendingInvite(), CODE);
});

test('alleen een goede code wordt onthouden', () => {
  const s = setup();
  for (const bad of ['', 'abc', 'x'.repeat(64), null]) assert.equal(s.app.rememberInvite(bad), false, String(bad));
  assert.equal(s.app.pendingInvite(), null);
});

// ---- verversen ------------------------------------------------------------------------------------------------------------------

test('het scherm ververst hoogstens eens per minuut, behalve als de gegevens uit de cache komen', async () => {
  const s = setup();
  s.app.syncAccount();
  assert.equal(s.app.needsRefresh(), true, 'nog nooit opgehaald');
  await s.app.refresh();
  assert.equal(s.app.needsRefresh(), false);
  s.env.state.now += 30_000;
  assert.equal(s.app.needsRefresh(), false);
  s.env.state.now += 40_000;
  assert.equal(s.app.needsRefresh(), true);
  assert.equal(setup({ signedIn: false }).app.needsRefresh(), false);
});

test('de standaardklok roept setTimeout en clearTimeout als gewone functie aan (als methode geeft de browser "Illegal invocation")', async () => {
  const original = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
  const strict = (fn) => function strictTimer(...args) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return fn(...args);
  };
  globalThis.setTimeout = strict((callback, ms) => original.set(callback, ms));
  globalThis.clearTimeout = strict((id) => original.clear(id));
  try {
    const fake = fakeRemote();
    const env = { signedIn: () => true, userId: () => ME, settings: () => ({ displayName: 'Remco' }), today: () => TODAY, snapshot: async () => snapshotWith(), online: () => true, now: () => 0, baseUrl: () => 'x' };
    const app = createSocial({ remote: fake.remote, cache: createSocialCache(memoryStorage()), env }); // zonder eigen klok
    await app.refresh();
    app.scheduleRecompute();
    app.scheduleRecompute(); // annuleert de eerste
    app.leave(); // annuleert nogmaals
  } finally {
    globalThis.setTimeout = original.set;
    globalThis.clearTimeout = original.clear;
  }
});
