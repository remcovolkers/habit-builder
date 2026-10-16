// Controleert na elke wijziging of er nieuwe prestaties zijn en slaat ze op. Eenmaal ontgrendeld blijft zo.
import { evaluateAchievements } from '../domain/achievements.js';
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
    pauses: snapshot.pauses,
    reviews: snapshot.reviews,
    ratings: snapshot.ratings,
    friends,
    unlocked: snapshot.achievements.map((a) => ({ key: a.key, habitId: a.habitId ?? null })),
  };
}

/** Geeft de nieuw ontgrendelde prestaties terug: [{ key, habitId }]. */
export async function checkAchievements(repo, today, extra = {}) {
  const snapshot = await repo.snapshot();
  const fresh = evaluateAchievements(achievementInput(snapshot, today, extra));
  for (const { key, habitId } of fresh) await repo.unlockAchievement({ key, habitId, date: today });
  return fresh;
}
