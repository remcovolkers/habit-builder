// De ranglijst (docs/SOCIAAL.md §4.3–4.4): wie staat erin, in welke volgorde en met welke rang. Puur.
import { SOCIAL_ACTIVE_DAYS } from '../domain/constants.js';
import { diffDays } from '../domain/dates.js';

/** Heeft deze persoon in de laatste SOCIAL_ACTIVE_DAYS dagen (vandaag meegerekend) iets afgevinkt? */
export function isRecentlyActive(lastActive, today) {
  if (!lastActive) return false;
  const age = diffDays(today, lastActive);
  return age >= 0 && age < SOCIAL_ACTIVE_DAYS;
}

const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'nl');

/**
 * entries: [{ userId, name, points, done, streak, activeHabits, lastActive }]  (jezelf en je vrienden)
 * meId:    jouw userId; jij staat er altijd in
 * today:   de dag van degene die kijkt
 *
 * Geeft rijen { ...entry, isMe, rank }:
 *   - vrienden die 3 dagen of langer niets afvinkten staan er niet in (jezelf wel);
 *   - gesorteerd op punten, de meeste eerst. Gelijke punten = gelijke rang ("1, 1, 3"); binnen gelijke punten gaat de langste
 *     reeks voor, dan de naam.
 */
export function buildLeaderboard({ entries, meId, today }) {
  const rows = entries
    .filter((entry) => entry.userId === meId || isRecentlyActive(entry.lastActive, today))
    .map((entry) => ({ ...entry, points: entry.points ?? 0, isMe: entry.userId === meId }))
    .sort((a, b) => b.points - a.points || (b.streak ?? 0) - (a.streak ?? 0) || byName(a, b));

  let previousPoints = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    row.rank = row.points === previousPoints ? previousRank : index + 1;
    previousPoints = row.points;
    previousRank = row.rank;
  });
  return rows;
}
