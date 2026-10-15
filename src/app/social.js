// Vrienden en ranglijst: de pure regels rond namen, uitnodigingslinks en het omzetten van wat de server teruggeeft (docs/SOCIAAL.md).
// Geen DOM, geen netwerk, geen opslag: dat staat in data/social-remote.js, data/social-cache.js en ui/social.js.
import { SCORE_WINDOW_DAYS } from '../domain/constants.js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const INVITE_CODE_LENGTH = 64;
const USERNAME_CHARS = /^[a-z0-9_.]+$/;

/**
 * Controleert een gebruikersnaam zoals de server dat doet (de server blijft de baas, o.a. over de verboden woorden).
 * Geeft { ok: true, value } met de genormaliseerde naam (kleine letters, zonder spaties aan de rand), of { ok: false, reason }:
 * 'empty' | 'too_short' | 'too_long' | 'invalid_chars'.
 */
export function validateUsername(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '') return { ok: false, reason: 'empty' };
  if (value.length < USERNAME_MIN) return { ok: false, reason: 'too_short' };
  if (value.length > USERNAME_MAX) return { ok: false, reason: 'too_long' };
  if (!USERNAME_CHARS.test(value)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, value };
}

/**
 * Een voorstel voor een gebruikersnaam uit de weergavenaam: kleine letters, zonder accenten, spaties worden punten.
 * Geeft '' als er niets bruikbaars overblijft (te kort).
 */
export function suggestUsername(displayName) {
  const base = String(displayName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '.')
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, USERNAME_MAX)
    .replace(/\.+$/, '');
  return base.length >= USERNAME_MIN ? base : '';
}

/** De naam die anderen zien: je weergavenaam, anders je gebruikersnaam. */
export const shownName = (row) => String(row?.display_name ?? row?.displayName ?? '').trim() || String(row?.username ?? '');

// ---- uitnodigingslinks --------------------------------------------------------------------------------------------------------

const INVITE_PATH = '#/vrienden/uitnodiging/';

/** `base` is het adres van de app zonder hash, bijvoorbeeld "https://remcovolkers.github.io/habit-builder/". */
export function buildInviteLink(base, code) {
  return `${String(base).replace(/#.*$/, '')}${INVITE_PATH}${code}`;
}

/** De code uit een hash als "#/vrienden/uitnodiging/<64 tekens>", of null als het geen (goede) uitnodiging is. */
export function parseInviteHash(hash) {
  const match = /^#\/vrienden\/uitnodiging\/([0-9a-f]+)\/?$/i.exec(String(hash ?? ''));
  return match && match[1].length === INVITE_CODE_LENGTH ? match[1].toLowerCase() : null;
}

// ---- de samenvatting naar de server --------------------------------------------------------------------------------------------

/** De argumenten van `publish_summary` voor een samenvatting uit buildScoreSummary. */
export function summaryToArgs(summary) {
  return {
    p_as_of: summary.asOf,
    p_points: summary.points,
    p_done: summary.done,
    p_streak: summary.streak,
    p_active_habits: summary.activeHabits,
    p_last_active: summary.lastActive,
  };
}

/** Voor "is er iets veranderd?": hetzelfde als de argumenten, als tekst. */
export const summarySignature = (summary) => JSON.stringify(summaryToArgs(summary));

// ---- wat de server teruggeeft ---------------------------------------------------------------------------------------------------

/** Rijen van friend_list() in drie lijsten, elk op naam gesorteerd (de server sorteert al; dit houdt het ook bij een cache zo). */
export function groupFriends(rows) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'nl') || a.username.localeCompare(b.username, 'nl');
  const people = (rows ?? []).map((row) => ({ userId: row.user_id, username: row.username, name: shownName(row), state: row.state, since: row.since ?? null }));
  const pick = (state) => people.filter((p) => p.state === state).sort(byName);
  return { friends: pick('friend'), incoming: pick('incoming'), outgoing: pick('outgoing') };
}

/** Rijen van leaderboard() als invoer voor buildLeaderboard. */
export function boardEntries(rows) {
  return (rows ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    name: shownName(row),
    points: row.points,
    done: row.done,
    streak: row.streak,
    activeHabits: row.active_habits,
    lastActive: row.last_active ?? null,
    asOf: row.as_of,
  }));
}

/**
 * Zet je eigen, lokaal berekende samenvatting in plaats van wat de server van jou heeft (die kan achterlopen): je eigen punten
 * staan altijd direct goed. Zonder samenvatting blijft de lijst zoals hij was.
 */
export function withOwnSummary({ entries, userId, username, name, summary }) {
  if (!summary) return entries;
  const own = {
    userId, username, name: String(name ?? '').trim() || username, points: summary.points, done: summary.done, streak: summary.streak,
    activeHabits: summary.activeHabits, lastActive: summary.lastActive, asOf: summary.asOf,
  };
  const others = entries.filter((entry) => entry.userId !== userId);
  return [...others, own];
}

/** Voor de uitleg in de UI: over hoeveel dagen de punten gaan. */
export const WINDOW_DAYS = SCORE_WINDOW_DAYS;
