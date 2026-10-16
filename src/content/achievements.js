// Namen en omschrijvingen van achievements. De regels staan in domain/achievements.js.
import { DONE_MILESTONES, GRADUATED_MILESTONES, MILESTONE_DAYS, STREAK_MILESTONES } from '../domain/constants.js';
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

const doneMilestones = Object.fromEntries(
  DONE_MILESTONES.map((n) => [`done_${n}`, { title: `${n} keer gedaan`, text: `Je hebt ${n} keer iets afgevinkt, bij al je habits samen.`, perHabit: false }]),
);

const streakMilestones = Object.fromEntries(
  STREAK_MILESTONES.map((n) => [`streak_${n}`, { title: `Reeks van ${n} dagen`, text: `${n} dagen achter elkaar gedaan bij één habit met vaste dagen.`, perHabit: false }]),
);

const graduatedMilestones = Object.fromEntries(
  GRADUATED_MILESTONES.map((n) => [`graduated_${n}`, { title: n === 2 ? 'Tweede ingeburgerd' : `${n} ingeburgerd`, text: `${n} habits zijn echt van jou geworden.`, perHabit: false }]),
);

const INFO = {
  first_checkin: { title: 'Eerste stap', text: 'Je eerste check-in staat erin.', perHabit: false },
  ...milestones,
  perfect_week: { title: 'Perfecte week', text: 'Een hele week waarin je alles hebt gedaan (minstens 3 dingen).', perHabit: false },
  comeback: { title: 'Comeback', text: 'Je pakte een habit weer op na minstens een week stilte.', perHabit: true },
  first_graduated: { title: 'Ingeburgerd', text: 'Je eerste habit is echt van jou geworden.', perHabit: false },
  three_active: { title: 'Drie tegelijk', text: 'Drie actieve habits tegelijk.', perHabit: false },
  review_streak_4: { title: 'Vier weken reflectie', text: 'Vier weken achter elkaar een wekelijkse review.', perHabit: false },
  ...doneMilestones,
  ...streakMilestones,
  perfect_weeks_4: { title: 'Vier perfecte weken', text: 'Vier weken achter elkaar waarin je alles hebt gedaan.', perHabit: false },
  recover_5: { title: 'Nooit twee keer missen', text: 'Vijf keer meteen teruggekomen na een gemiste dag of week.', perHabit: false },
  strong_return: { title: 'Sterk terug', text: 'Een habit weer op 80% na twee weken waarin het niet lukte.', perHabit: true },
  minimal_first: { title: 'Kleine stap', text: 'Je hebt bij een habit een minimale versie ingevuld, voor de dagen dat het lastig is.', perHabit: false },
  minimal_5: { title: 'Tweeminutenregel', text: 'Vijf keer de minimale versie gedaan in plaats van niets.', perHabit: false },
  counter_week: { title: 'Vol doel', text: 'Zeven dagen achter elkaar het volle doel van een teller gehaald.', perHabit: false },
  pause_resume: { title: 'Pauzeren is oké', text: 'Je nam een pauze en pakte de habit daarna weer op.', perHabit: false },
  ...graduatedMilestones,
};

/**
 * De pagina Prestaties groepeert zo. Een sleutel zonder tekst (bijvoorbeeld uit een nieuwere versie van de app) wordt overgeslagen.
 * De volgorde binnen een groep is de volgorde op de pagina.
 */
export const ACHIEVEMENT_GROUPS = Object.freeze([
  { id: 'count', label: 'Aantallen', keys: Object.freeze(['first_checkin', ...DONE_MILESTONES.map((n) => `done_${n}`)]) },
  { id: 'persist', label: 'Volhouden', keys: Object.freeze([...MILESTONE_DAYS.map((n) => `days_${n}`), ...STREAK_MILESTONES.map((n) => `streak_${n}`), 'perfect_week', 'perfect_weeks_4']) },
  { id: 'return', label: 'Terugkomen', keys: Object.freeze(['comeback', 'recover_5', 'strong_return']) },
  { id: 'smart', label: 'Slimmer', keys: Object.freeze(['minimal_first', 'minimal_5', 'counter_week', 'pause_resume']) },
  { id: 'rooted', label: 'Ingeburgerd', keys: Object.freeze(['first_graduated', ...GRADUATED_MILESTONES.map((n) => `graduated_${n}`)]) },
  { id: 'reflect', label: 'Reflectie', keys: Object.freeze(['review_streak_4']) },
  { id: 'breadth', label: 'Verbreding', keys: Object.freeze(['three_active']) },
]);

// elke prestatie krijgt de sleutel van haar icoon (content/ui-icons.js)
export const ACHIEVEMENT_INFO = Object.freeze(
  Object.fromEntries(Object.entries(INFO).map(([key, info]) => [key, Object.freeze({ ...info, icon: achievementIconKey(key) })])),
);

