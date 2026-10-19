// Automatisme (docs/AUTOMATISME.md): hoe automatisch voelt een taak? Puur.
//
// Een cijfer van 1 tot 5 per week, met een zin bij elk cijfer (zie nl.automaticity.scale), en optioneel wat er hielp (`cues`). Het cijfer zegt hoe
// de taak op gang komt, niet of hij lukt: je kunt iets elke keer doen en toch elke keer een herinnering nodig hebben.
import { AUTOMATICITY_THRESHOLD } from './constants.js';

/** Wat hielp er toe dat het lukte? 'nothing' sluit de rest uit: het ging vanzelf. */
export const RATING_CUES = Object.freeze(['reminder', 'app_plan', 'routine', 'someone', 'nothing']);
/** De hulpmiddelen die van buiten komen: een herinnering of het plan van de app. Zo veel mogelijk afbouwen. */
export const EXTERNAL_CUES = Object.freeze(['reminder', 'app_plan']);

/** Een geldige lijst: unieke bekende sleutels, en 'nothing' staat alleen. */
export const validCues = (cues) => Array.isArray(cues) && new Set(cues).size === cues.length && cues.every((cue) => RATING_CUES.includes(cue))
  && (!cues.includes('nothing') || cues.length === 1);

/** Maakt van een lijst een geldige: onbekende sleutels weg, dubbelen weg, en 'nothing' gaat voor de rest. */
export function cleanCues(cues) {
  const known = [...new Set((Array.isArray(cues) ? cues : []).filter((cue) => RATING_CUES.includes(cue)))];
  return known.includes('nothing') ? ['nothing'] : known;
}

/** Het niveau bij een cijfer: 'aware' (1–2), 'coming' (3), 'almost' (4), 'natural' (5). */
export const levelOf = (score) => (score >= 5 ? 'natural' : score >= AUTOMATICITY_THRESHOLD ? 'almost' : score === 3 ? 'coming' : 'aware');

/** De cijfers van een habit, oudste eerst. */
export const sortedRatings = (ratings = []) => [...ratings].sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));

/** De laatste `n` cijfers (de waarden), oudste eerst. */
export const recentScores = (ratings, n = 2) => sortedRatings(ratings).slice(-n).map((rating) => rating.score);

/**
 * Hoeveel van de cijfers waarbij je aangaf wat hielp, noemen een herinnering of het plan van de app? { tagged, external }.
 * Alleen de laatste `n` cijfers tellen: wat je nu nodig hebt, niet wat je in het begin nodig had.
 */
export function cueSummary(ratings, n = 4) {
  const tagged = sortedRatings(ratings).filter((rating) => Array.isArray(rating.cues) && rating.cues.length > 0).slice(-n);
  return { tagged: tagged.length, external: tagged.filter((rating) => rating.cues.some((cue) => EXTERNAL_CUES.includes(cue))).length };
}

/**
 * Eén zin raad bij de stand van het automatisme, als sleutel (de tekst staat in nl.automaticity.advice):
 *   effort    het kost nog veel moeite (laatste cijfer 1–2): kleiner maken
 *   cue       het gaat vooral met een herinnering of het plan van de app, en er is nog geen cue: koppel het aan iets wat je al doet
 *   weaning   idem, maar er is al een cue: probeer het eens zonder de app
 *   coming    het laatste cijfer is 3
 *   once      één keer 4 of 5: nog een keer (of een geslaagde proef zonder app)
 *   steady    twee keer achter elkaar 4 of hoger
 * null zonder cijfers.
 */
export function adviceFor({ ratings, habit }) {
  const sorted = sortedRatings(ratings);
  const latest = sorted.at(-1);
  if (!latest) return null;
  const cues = cueSummary(sorted);
  if (latest.score <= 2) return 'effort';
  if (cues.tagged >= 2 && cues.external * 2 >= cues.tagged) return String(habit?.cue ?? '').trim() === '' ? 'cue' : 'weaning';
  const [before, last] = recentScores(sorted, 2);
  if (sorted.length >= 2 && before >= AUTOMATICITY_THRESHOLD && last >= AUTOMATICITY_THRESHOLD) return 'steady';
  if (latest.score >= AUTOMATICITY_THRESHOLD) return 'once';
  return 'coming';
}
