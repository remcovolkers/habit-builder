// Startpunten voor een nieuwe habit: vullen alleen het formulier in, de gebruiker bevestigt zelf.
import { ALL_WEEKDAYS } from '../domain/schedule.js';

const everyDay = { type: 'weekdays', weekdays: [...ALL_WEEKDAYS] };

export const TEMPLATES = Object.freeze({
  water: {
    name: 'Water drinken',
    icon: '💧',
    color: 'c2',
    daypart: 'anytime',
    schedule: everyDay,
    counter: { unit: 'glazen', target: 8 },
  },
  reading: {
    name: '10 minuten lezen',
    icon: '📖',
    color: 'c3',
    daypart: 'evening',
    schedule: everyDay,
    cue: 'Voor het slapen',
    minimalVersion: 'Eén pagina',
  },
  running: {
    name: 'Hardlopen',
    icon: '🏃',
    color: 'c5',
    daypart: 'morning',
    schedule: { type: 'times_per_period', period: 'week', count: 3 },
    minimalVersion: 'Schoenen aan en 1 minuut lopen',
  },
});
