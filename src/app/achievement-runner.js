// Controleert na elke wijziging of er nieuwe prestaties zijn en slaat ze op. Eenmaal ontgrendeld blijft zo.
import { evaluateAchievements, staleAchievements } from '../domain/achievements.js';
import { ACHIEVEMENT_RULES_VERSION } from '../domain/constants.js';
import { isOwnPause } from '../domain/skipdays.js';
import { statsForHabit } from './habit-detail.js';

/** De invoer van de prestatieregels uit een snapshot; de pagina Prestaties rekent er de voortgang mee uit. */
export function achievementInput(snapshot, today, { friends = 0 } = {}) {
  const stats = snapshot.habits.map((habit) =>
    statsForHabit({ habit, checkIns: snapshot.checkIns, pauses: snapshot.pauses, ratings: snapshot.ratings, today }).stats);
  return {
    today,
    stats,
    habits: snapshot.habits,
    checkIns: snapshot.checkIns,
    pauses: snapshot.pauses.filter(isOwnPause), // het hervatten van een pauze, niet een overgeslagen dag
    reviews: snapshot.reviews,
    ratings: snapshot.ratings,
    friends,
    unlocked: snapshot.achievements.map((a) => ({ key: a.key, habitId: a.habitId ?? null })),
  };
}

/**
 * Herijken: haalt de mijlpalen weg die niet meer kloppen met de regels van nu (bijvoorbeeld 21 dagen bij "1× per maand" met één vinkje). Wat klopt
 * blijft staan met zijn oorspronkelijke datum. Geeft [{ key, habitId }] van wat is ingetrokken.
 */
export async function recalibrateAchievements(repo, today, extra = {}) {
  const snapshot = await repo.snapshot();
  const stale = staleAchievements(achievementInput(snapshot, today, extra));
  for (const { key, habitId } of stale) await repo.revokeAchievement({ key, habitId });
  return stale;
}

/**
 * Eenmalig na een update met strengere regels: herijk en onthoud de versie van de regels in de instellingen (die meesynchroniseren, dus een tweede
 * toestel doet het niet nog eens). Geeft de ingetrokken prestaties terug, of een lege lijst als dit al gebeurd was.
 */
export async function ensureAchievementRules(repo, today, extra = {}) {
  const settings = await repo.getSettings();
  if ((settings.achievementRules ?? 1) >= ACHIEVEMENT_RULES_VERSION) return [];
  const revoked = await recalibrateAchievements(repo, today, extra);
  await repo.saveSettings({ achievementRules: ACHIEVEMENT_RULES_VERSION });
  return revoked;
}

/** Geeft de nieuw ontgrendelde prestaties terug: [{ key, habitId }]. */
export async function checkAchievements(repo, today, extra = {}) {
  const snapshot = await repo.snapshot();
  const fresh = evaluateAchievements(achievementInput(snapshot, today, extra));
  for (const { key, habitId } of fresh) await repo.unlockAchievement({ key, habitId, date: today });
  return fresh;
}
