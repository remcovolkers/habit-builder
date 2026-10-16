// Vrienden en ranglijst in de app: houdt de status bij, haalt vrienden en ranglijst op, publiceert jouw samenvatting en voert de
// acties uit (aanzetten, zoeken, verzoeken, uitnodigingen). De schermen (S4) lezen `social` en roepen deze functies aan.
// Zie docs/SOCIAAL.md. Geen DOM; alles wat van buiten komt (server, opslag, tijd, account) wordt ingegeven, zodat dit testbaar is.
//
// Status voor de UI:
//   'signed-out'  – niet ingelogd (of de sessie wordt nog hersteld): sociaal bestaat dan niet
//   'unknown'     – ingelogd, maar we weten (nog) niet of je meedoet en hebben ook geen cache
//   'off'         – ingelogd en je doet niet mee
//   'on'          – je doet mee
//   'unavailable' – de server kent sociaal nog niet (de migratie is niet uitgevoerd): de UI verbergt het
//
// Wie sociaal niet gebruikt merkt er niets van: er gaat niets over het netwerk en er wordt niets berekend, tot de gebruiker het
// scherm opent (refresh) of sociaal aanzet. Is sociaal aan, dan publiceert de app zijn samenvatting op de achtergrond.
import { buildLeaderboard } from '../app/leaderboard.js';
import { buildScoreSummary } from '../app/score.js';
import {
  boardEntries, buildInviteLink, groupFriends, parseInviteHash, shownName, summarySignature, summaryToArgs, validateUsername, withOwnSummary,
} from '../app/social.js';
import { SocialError, toSocialError } from '../data/social-remote.js';

const PUBLISH_DELAY_MS = 1500;
const REFRESH_AFTER_MS = 60_000;

const emptyLists = () => ({ friends: [], incoming: [], outgoing: [] });

// setTimeout en clearTimeout als gewone aanroep: als methode van een ander object (`schedule.clear(...)`) geeft de browser "Illegal invocation"
const defaultSchedule = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export function createSocial({ remote, cache, env, schedule = defaultSchedule }) {
  const social = {
    status: 'signed-out',
    me: null, // { username, display_name, enabled }
    ...emptyLists(),
    entries: [], // wat de server over jou en je vrienden zegt (nog zonder jouw eigen, lokale cijfers)
    board: [], // de ranglijst zoals de UI hem toont (buildLeaderboard)
    summary: null, // jouw eigen, lokaal berekende samenvatting, met de uitsplitsing van je punten (breakdown)
    loading: false,
    error: null, // laatste fout die de UI kan tonen, of null
    fetchedAt: null, // wanneer vrienden en ranglijst voor het laatst van de server kwamen (ms)
    stale: false, // de getoonde gegevens komen uit de cache (offline, of nog niet ververst)
  };

  const events = new EventTarget();
  const emit = () => events.dispatchEvent(new Event('social'));
  const onChanged = (listener) => { events.addEventListener('social', listener); return () => events.removeEventListener('social', listener); };

  let userId = null; // van wie de huidige status is
  let lastPublished = '';
  let timer = null;
  let refreshing = null;

  const ownName = () => String(env.settings().displayName ?? '').trim();

  function reset(status = 'signed-out') {
    schedule.clear(timer);
    timer = null;
    Object.assign(social, { status, me: null, ...emptyLists(), entries: [], board: [], summary: null, loading: false, error: null, fetchedAt: null, stale: false });
    lastPublished = '';
  }

  function rebuildBoard() {
    if (social.status !== 'on' || !social.me) { social.board = []; return; }
    const entries = withOwnSummary({ entries: social.entries, userId, username: social.me.username, name: ownName() || social.me.display_name, summary: social.summary });
    social.board = buildLeaderboard({ entries, meId: userId, today: env.today() });
  }

  function persist() {
    cache.write(userId, { me: social.me, lists: { friends: social.friends, incoming: social.incoming, outgoing: social.outgoing }, entries: social.entries, fetchedAt: social.fetchedAt });
  }

  function applyMe(me) {
    social.me = me ?? null;
    social.status = me?.enabled ? 'on' : 'off';
  }

  /** Neemt de cache van deze gebruiker over (als die er is), zodat er direct iets te zien is. */
  function loadFromCache() {
    const data = cache.read(userId);
    if (!data) { social.status = 'unknown'; return; }
    applyMe(data.me);
    Object.assign(social, { ...emptyLists(), ...(data.lists ?? {}) }, { entries: Array.isArray(data.entries) ? data.entries : [], fetchedAt: data.fetchedAt ?? null, stale: true });
    rebuildBoard();
  }

  /** Koppelt de status aan het account: bij inloggen, uitloggen of een ander account. */
  function syncAccount() {
    if (!env.signedIn()) {
      if (userId !== null || social.status !== 'signed-out') { userId = null; reset('signed-out'); emit(); }
      return;
    }
    const id = env.userId();
    if (id === userId && social.status !== 'signed-out') return;
    userId = id;
    reset('unknown');
    loadFromCache();
    emit();
    if (social.status === 'on') refresh({ background: true }); // we weten dat je meedoet: bijwerken zonder dat je het scherm opent
  }

  /** Verwerkt een fout. `track`: onthoud hem als `social.error` (alleen voor het verversen; een mislukte actie meldt zichzelf via zijn resultaat). */
  function fail(error, { track = false } = {}) {
    const err = toSocialError(error);
    if (err.code === 'unavailable') { reset('unavailable'); return err; }
    if (err.code === 'offline') { social.stale = true; return err; }
    if (err.code === 'not_enabled') { applyMe({ ...(social.me ?? {}), enabled: false }); social.entries = []; social.board = []; lastPublished = ''; return err; }
    if (track) social.error = err.code;
    return err;
  }

  async function loadLists() {
    const [friendRows, boardRows] = await Promise.all([remote.friends(), remote.leaderboard()]);
    Object.assign(social, groupFriends(friendRows));
    social.entries = boardEntries(boardRows);
    social.fetchedAt = env.now();
    social.stale = false;
  }

  /** Jouw eigen samenvatting opnieuw berekenen (lokaal, geen netwerk) en de ranglijst opnieuw samenstellen. */
  async function recomputeSummary() {
    social.summary = buildScoreSummary({ snapshot: await env.snapshot(), today: env.today() });
    rebuildBoard();
    return social.summary;
  }

  /**
   * Haalt status, vrienden en ranglijst op. Zonder verbinding blijft de cache staan (stale). `background`: niet als "bezig met laden" tonen.
   * Meerdere aanroepen tegelijk delen één ophaalronde.
   */
  function refresh({ background = false } = {}) {
    if (!env.signedIn()) { syncAccount(); return Promise.resolve({ ok: false, reason: 'signed-out' }); }
    if (userId !== env.userId() || social.status === 'signed-out') syncAccount();
    if (refreshing) return refreshing;
    if (!env.online()) {
      social.stale = true;
      emit();
      return Promise.resolve({ ok: false, reason: 'offline' });
    }
    refreshing = (async () => {
      if (!background) { social.loading = true; emit(); }
      try {
        applyMe(await remote.me());
        if (social.status === 'on') {
          await loadLists();
          await recomputeSummary();
          await publish();
        } else {
          Object.assign(social, emptyLists(), { entries: [], board: [], summary: null, fetchedAt: null, stale: false });
        }
        social.error = null;
        persist();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: fail(error, { track: true }).code };
      } finally {
        social.loading = false;
        refreshing = null;
        emit();
      }
    })();
    return refreshing;
  }

  /** Zorgt dat de naam bij je vrienden gelijk is aan de naam in Instellingen. Doet niets als er niets verschilt. */
  async function syncName() {
    if (!social.me) return;
    const name = ownName();
    if (name === String(social.me.display_name ?? '') || name.length > 30) return;
    social.me = await remote.enable(social.me.username, name);
  }

  /**
   * Publiceert jouw samenvatting (alleen als sociaal aan staat en er verbinding is, en alleen als er iets veranderd is).
   * Faalt stil: een mislukte publicatie wordt bij de volgende wijziging of het volgende bezoek opnieuw geprobeerd.
   */
  async function publish({ force = false } = {}) {
    if (social.status !== 'on' || !env.signedIn() || !env.online()) return { ok: false, reason: 'skipped' };
    try {
      await syncName();
      const summary = social.summary ?? await recomputeSummary();
      const signature = summarySignature(summary);
      if (!force && signature === lastPublished) return { ok: true, skipped: true };
      await remote.publish(summaryToArgs(summary));
      lastPublished = signature;
      return { ok: true };
    } catch (error) {
      const err = fail(error);
      if (err.code !== 'offline') console.warn('samenvatting publiceren mislukt', err.code);
      return { ok: false, reason: err.code };
    }
  }

  /** Na een wijziging in je habits of instellingen: even wachten, dan je eigen cijfers bijwerken en publiceren. */
  function scheduleRecompute() {
    if (social.status !== 'on') return;
    schedule.clear(timer);
    timer = schedule.set(async () => {
      try {
        await recomputeSummary();
        emit();
        await publish();
      } catch (error) {
        console.warn('punten bijwerken mislukt', error);
      }
    }, PUBLISH_DELAY_MS);
  }

  /** Een actie op de server met de gebruikelijke afhandeling: { ok: true, ...result } of { ok: false, reason }. */
  async function act(fn, { refreshAfter = true } = {}) {
    if (!env.signedIn()) return { ok: false, reason: 'signed-out' };
    if (!env.online()) return { ok: false, reason: 'offline' };
    try {
      const result = await fn();
      if (refreshAfter) {
        // de actie is gelukt: faalt het verversen erna (verbinding, een tijdelijke fout), dan blijft de uitkomst "gelukt" en staan de lijsten even oud
        try {
          await loadLists();
          rebuildBoard();
          persist();
        } catch (refreshError) {
          fail(refreshError);
        }
      }
      emit();
      return { ok: true, ...(result ?? {}) };
    } catch (error) {
      const err = fail(error);
      emit();
      return { ok: false, reason: err.code };
    }
  }

  const person = (row) => (row ? { userId: row.id ?? row.user_id, username: row.username, name: shownName(row), relation: row.relation ?? null } : null);

  return {
    social,
    onChanged,
    syncAccount,
    refresh,
    publish,
    scheduleRecompute,
    recompute: async () => { await recomputeSummary(); emit(); return social.summary; },
    /** Bij uitloggen of account verwijderen: alles van dit account van dit apparaat. */
    leave() {
      cache.clear();
      userId = null;
      reset('signed-out');
      emit();
    },
    /** Moet het scherm de gegevens verversen? (Niet vaker dan eens per minuut, tenzij ze uit de cache komen.) */
    needsRefresh: () => social.status !== 'signed-out' && social.status !== 'unavailable' && (social.stale || social.fetchedAt === null || env.now() - social.fetchedAt > REFRESH_AFTER_MS),

    // ---- acties --------------------------------------------------------------------------------------------------------------
    /** Zet sociaal aan met deze gebruikersnaam en weergavenaam (de naam uit Instellingen). */
    async enable({ username, displayName }) {
      const checked = validateUsername(username);
      if (!checked.ok) return { ok: false, reason: checked.reason };
      return act(async () => {
        applyMe(await remote.enable(checked.value, String(displayName ?? '').trim()));
        lastPublished = '';
        await recomputeSummary();
        await remote.publish(summaryToArgs(social.summary));
        lastPublished = summarySignature(social.summary);
      });
    },
    /** Zet sociaal uit: je verdwijnt bij anderen en je samenvatting wordt op de server gewist. */
    async disable() {
      return act(async () => {
        await remote.disable();
        applyMe({ ...(social.me ?? {}), enabled: false });
        Object.assign(social, emptyLists(), { entries: [], board: [], summary: null });
        lastPublished = '';
        persist();
      }, { refreshAfter: false });
    },
    /** Zoekt op de exacte gebruikersnaam: { ok: true, person } met person null als er niets is. */
    async find(username) {
      const checked = validateUsername(username);
      if (!checked.ok) return { ok: true, person: null }; // een ongeldige naam bestaat niet: zelfde antwoord als "niet gevonden"
      return act(async () => ({ person: person(await remote.find(checked.value)) }), { refreshAfter: false });
    },
    request: (userId_) => act(async () => ({ status: (await remote.request(userId_)).status })),
    respond: (userId_, accept) => act(async () => ({ status: (await remote.respond(userId_, accept)).status })),
    cancel: (userId_) => act(async () => ({ removed: await remote.cancel(userId_) })),
    remove: (userId_) => act(async () => ({ removed: await remote.remove(userId_) })),

    // ---- uitnodigingen -------------------------------------------------------------------------------------------------------
    async createInvite() {
      return act(async () => {
        const invite = await remote.createInvite();
        cache.rememberOwnInvite(userId, invite.id, invite.code); // de server bewaart alleen een hash: zo kun je de link later opnieuw tonen
        return { id: invite.id, code: invite.code, expiresAt: invite.expires_at, link: buildInviteLink(env.baseUrl(), invite.code) };
      }, { refreshAfter: false });
    },
    /** Je actieve links, elk met `uses` (hoeveel mensen er via kwamen) en `link` als die van dit apparaat is (anders null). */
    invites: () => act(async () => {
      const own = cache.readOwnInvites(userId);
      const rows = await remote.invites();
      return { invites: rows.map((row) => ({ ...row, uses: Number(row.uses ?? 0), link: own[row.id] ? buildInviteLink(env.baseUrl(), own[row.id]) : null })) };
    }, { refreshAfter: false }),
    revokeInvite: (id) => act(async () => {
      const revoked = await remote.revokeInvite(id);
      cache.forgetOwnInvite(userId, id);
      return { revoked };
    }, { refreshAfter: false }),
    /** Wisselt een code in. Een ongeldige of verlopen code geeft { ok: false, reason: 'invalid' }. */
    async redeemInvite(code) {
      const result = await act(async () => {
        const outcome = await remote.redeemInvite(String(code ?? '').trim().toLowerCase());
        if (outcome?.status !== 'ok') throw new SocialError('invalid');
        return { person: person(outcome), alreadyFriends: outcome.already_friends === true };
      });
      if (result.ok || result.reason === 'invalid') cache.forgetInvite();
      return result;
    },
    /**
     * Wie nodigt je uit? Werkt zonder account (voor het welkomstscherm). { ok: true, status: 'ok' | 'own' | 'invalid', name } of
     * { ok: false, reason } ('offline', 'unavailable', …). Een goede uitnodiger wordt onthouden voor het inlogscherm.
     */
    async peekInvite(code) {
      const clean = parseInviteHash(`#/vrienden/uitnodiging/${code}`);
      if (!clean) return { ok: true, status: 'invalid', name: '' };
      if (!env.online()) return { ok: false, reason: 'offline' };
      try {
        const outcome = await remote.peekInvite(clean);
        const status = ['ok', 'own'].includes(outcome?.status) ? outcome.status : 'invalid';
        const name = status === 'ok' ? String(outcome.display_name ?? '').trim() : '';
        if (status === 'ok' && cache.readInvite() === clean) cache.rememberInviter(name);
        return { ok: true, status, name };
      } catch (error) {
        return { ok: false, reason: toSocialError(error).code };
      }
    },
    /** Een uitnodiging die binnenkwam voordat je was ingelogd of meedeed: bewaren tot je het kunt afhandelen. */
    rememberInvite: (code) => { const clean = parseInviteHash(`#/vrienden/uitnodiging/${code}`); if (clean) cache.rememberInvite(clean); return Boolean(clean); },
    pendingInvite: () => cache.readInvite(),
    /** De naam van wie je uitnodigde (alleen bekend nadat het welkomstscherm hem opvroeg), of ''. */
    pendingInviter: () => (cache.readInvite() ? cache.readInviter() : ''),
    /** De uitnodiging laten vallen (bijvoorbeeld "niet nu"). */
    dropInvite: () => cache.forgetInvite(),
  };
}
