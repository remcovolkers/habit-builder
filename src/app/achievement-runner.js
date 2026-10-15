// Controleert na elke wijziging of er nieuwe prestaties zijn en slaat ze op. Eenmaal ontgrendeld blijft zo.
import { evaluateAchievements } from '../domain/achievements.js';
import { statsForHabit } from './habit-detail.js';

/** Geeft de nieuw ontgrendelde prestaties terug: [{ key, habitId }]. */
export async function checkAchievements(repo, today) {
  const snapshot = await repo.snapshot();
  const stats = snapshot.habits.map((habit) =>
    statsForHabit({ habit, checkIns: snapshot.checkIns, pauses: snapshot.pauses, ratings: snapshot.ratings, today }).stats);
  const fresh = evaluateAchievements({
    today,
    stats,
    reviews: snapshot.reviews,
    unlocked: snapshot.achievements.map((a) => ({ key: a.key, habitId: a.habitId ?? null })),
  });
  for (const { key, habitId } of fresh) await repo.unlockAchievement({ key, habitId, date: today });
  return fresh;
}
