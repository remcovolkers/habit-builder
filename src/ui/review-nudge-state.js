// Wat de app op dit apparaat onthoudt over de melding "je review staat open" op Vandaag: voor welke week en maand je "Niet nu" koos.
// Per soort de eerste dag van de periode, dus een nieuwe week of maand krijgt weer een melding. Er gaat niets naar de server.
const KEY = 'hb-review-nudge-dismissed';

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export const reviewNudgeDismissed = (nudge) => read()[nudge.kind] === nudge.start;

export function dismissReviewNudges(nudges) {
  try {
    const next = { ...read() };
    for (const nudge of nudges) next[nudge.kind] = nudge.start;
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* opslag geblokkeerd: dan blijft de melding staan tot je de review invult */
  }
}
