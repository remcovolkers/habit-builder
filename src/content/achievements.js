// Namen en omschrijvingen van achievements. De regels staan in domain/achievements.js.
import { MILESTONE_DAYS } from '../domain/constants.js';

const MILESTONE_EMOJI = { 7: '🔥', 21: '🌿', 42: '🌲', 66: '🏆', 100: '💎', 365: '👑' };

const milestones = Object.fromEntries(
  MILESTONE_DAYS.map((n) => [
    `days_${n}`,
    {
      emoji: MILESTONE_EMOJI[n] ?? '⭐',
      title: `${n} dagen`,
      text: `Je houdt een habit ${n} actieve dagen vol, met minstens de helft gehaald.`,
      perHabit: true,
    },
  ]),
);

export const ACHIEVEMENT_INFO = Object.freeze({
  first_checkin: { emoji: '🌱', title: 'Eerste stap', text: 'Je eerste check-in staat erin.', perHabit: false },
  ...milestones,
  perfect_week: { emoji: '🌟', title: 'Perfecte week', text: 'Een hele week waarin je alles hebt gedaan (minstens 3 dingen).', perHabit: false },
  comeback: { emoji: '🪴', title: 'Comeback', text: 'Je pakte een habit weer op na minstens een week stilte.', perHabit: true },
  first_graduated: { emoji: '🌳', title: 'Ingeburgerd', text: 'Je eerste habit is echt van jou geworden.', perHabit: false },
  three_active: { emoji: '🎯', title: 'Drie tegelijk', text: 'Drie actieve habits tegelijk.', perHabit: false },
  review_streak_4: { emoji: '📓', title: 'Vier weken reflectie', text: 'Vier weken achter elkaar een wekelijkse review.', perHabit: false },
});
