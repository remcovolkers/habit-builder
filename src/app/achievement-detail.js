// Wat er te lezen valt als je een prestatie aantikt: de regel, en bij een behaalde prestatie wanneer (en bij welke habit) je hem haalde.
import { nl } from '../content/nl.js';
import { formatDateShort } from './format.js';

/**
 * info: de tekst van de prestatie (content/achievements.js), records: [{ habitId, date }] van wat je ervan hebt behaald (leeg = nog niet),
 * names: Map habitId → naam, progress: { value, target } voor een telprestatie, anders null.
 * Geeft { unlocked, heading, text, status, rows: [{ label, when }] } terug; `label` is de habit (alleen bij een prestatie per habit).
 */
export function explainAchievement({ info, records = [], names = new Map(), progress = null }) {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (sorted.length === 0) {
    return {
      unlocked: false,
      heading: nl.achievements.howTo,
      text: info.text,
      status: progress ? nl.achievements.progress(progress.value, progress.target) : nl.achievements.locked,
      rows: [],
    };
  }
  return {
    unlocked: true,
    heading: nl.achievements.why,
    text: info.text,
    status: null,
    rows: sorted.map(({ habitId, date }) => ({
      label: info.perHabit ? (names.get(habitId) ?? nl.achievements.removedHabit) : null,
      when: nl.achievements.unlockedOn(formatDateShort(date)),
    })),
  };
}
