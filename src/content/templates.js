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
  // de ritmes die je niet raadt uit de eerste drie: vaste weekdagen, een aantal keer per maand en een vaste dag in de maand
  swimming: {
    name: 'Zwemmen',
    icon: '🏊',
    color: 'c2',
    daypart: 'evening',
    schedule: { type: 'weekdays', weekdays: [1, 4] },
    minimalVersion: 'Eén baantje',
  },
  // meerdere dagdelen: elk dagdeel vink je apart af
  brushing: {
    name: 'Tandenpoetsen',
    icon: '🦷',
    color: 'c2',
    daypart: 'morning',
    dayparts: ['morning', 'evening'],
    schedule: everyDay,
    minimalVersion: 'Even spoelen',
  },
  cleaning: {
    name: 'Grote schoonmaak',
    icon: '🧹',
    color: 'c4',
    daypart: 'anytime',
    schedule: { type: 'times_per_period', period: 'month', count: 2 },
    minimalVersion: 'Eén kamer',
  },
  budget: {
    name: 'Budget bijhouden',
    icon: '📊',
    color: 'c1',
    daypart: 'evening',
    schedule: { type: 'day_of_month', day: 25 },
    cue: 'Na het salaris',
  },
});
