// De ranglijst (docs/SOCIAAL.md §4.3–4.5): wie staat erin, in welke volgorde en met welke rang. Puur.
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
 * entries: [{ userId, name, score|null, planned, done, streak, activeHabits, lastActive }]  (jezelf en je vrienden)
 * meId:    jouw userId; jij staat er altijd in
 * today:   de dag van degene die kijkt
 *
 * Geeft rijen { ...entry, isMe, status: 'ranked' | 'too_little', rank }:
 *   - vrienden die 3 dagen of langer niets afvinkten staan er niet in (jezelf wel);
 *   - wie te weinig had om te beoordelen (score null) staat onderaan, zonder rang;
 *   - de rest staat op score. Gelijke score = gelijke rang ("1, 1, 3"); binnen een gelijke score gaat wie meer te verliezen
 *     had (meer gepland) voor, dan de langste reeks, dan de naam.
 */
export function buildLeaderboard({ entries, meId, today }) {
  const visible = entries.filter((entry) => entry.userId === meId || isRecentlyActive(entry.lastActive, today));
  const rows = visible.map((entry) => ({ ...entry, isMe: entry.userId === meId }));

  const ranked = rows
    .filter((row) => row.score !== null && row.score !== undefined)
    .sort((a, b) => b.score - a.score || b.planned - a.planned || b.streak - a.streak || byName(a, b));
  let previousScore = null;
  let previousRank = 0;
  ranked.forEach((row, index) => {
    row.status = 'ranked';
    row.rank = row.score === previousScore ? previousRank : index + 1;
    previousScore = row.score;
    previousRank = row.rank;
  });

  const tooLittle = rows
    .filter((row) => row.score === null || row.score === undefined)
    .sort(byName)
    .map((row) => ({ ...row, score: null, status: 'too_little', rank: null }));

  return [...ranked, ...tooLittle];
}
