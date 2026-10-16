// Namen en omschrijvingen van achievements. De regels staan in domain/achievements.js.
import { MILESTONE_DAYS } from '../domain/constants.js';
import { achievementIconKey } from './ui-icons.js';

const milestones = Object.fromEntries(
  MILESTONE_DAYS.map((n) => [
    `days_${n}`,
    {
      title: `${n} dagen`,
      text: `Je houdt een habit ${n} actieve dagen vol, met minstens de helft gehaald.`,
      perHabit: true,
    },
  ]),
);

const INFO = {
  first_checkin: { title: 'Eerste stap', text: 'Je eerste check-in staat erin.', perHabit: false },
  ...milestones,
  perfect_week: { title: 'Perfecte week', text: 'Een hele week waarin je alles hebt gedaan (minstens 3 dingen).', perHabit: false },
  comeback: { title: 'Comeback', text: 'Je pakte een habit weer op na minstens een week stilte.', perHabit: true },
  first_graduated: { title: 'Ingeburgerd', text: 'Je eerste habit is echt van jou geworden.', perHabit: false },
  three_active: { title: 'Drie tegelijk', text: 'Drie actieve habits tegelijk.', perHabit: false },
  review_streak_4: { title: 'Vier weken reflectie', text: 'Vier weken achter elkaar een wekelijkse review.', perHabit: false },
};

// elke prestatie krijgt de sleutel van haar icoon (content/ui-icons.js)
export const ACHIEVEMENT_INFO = Object.freeze(
  Object.fromEntries(Object.entries(INFO).map(([key, info]) => [key, Object.freeze({ ...info, icon: achievementIconKey(key) })])),
);

