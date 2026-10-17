// Wat voor soort habit een sjabloon is, voor onder de naam in de introductie: het ritme, of er een teller bij zit en welke dagdelen.
import { nl } from '../content/nl.js';
import { habitDayparts, hasMultipleDayparts } from '../domain/dayparts.js';
import { formatSchedule } from './format.js';

export const starterKind = (template) => [
  formatSchedule(template.schedule),
  template.counter ? nl.welcome.kindCounter : null,
  hasMultipleDayparts(template) ? habitDayparts(template).map((part) => nl.dayparts[part].toLowerCase()).join(' en ') : null,
].filter(Boolean).join(' · ');
