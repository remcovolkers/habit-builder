// Automatisme in beeld (docs/AUTOMATISME.md): de vijf zinnen om uit te kiezen, wat er hielp, het verloop en de uitleg "Wanneer is iets automatisch?".
import { h } from '../dom.js';
import { notifyChanged } from '../state.js';
import { openDialog } from './dialog.js';
import { nl } from '../../content/nl.js';
import { formatDateShort } from '../../app/format.js';
import { AUTOMATICITY_THRESHOLD } from '../../domain/constants.js';
import { RATING_CUES, cueSummary, levelOf, sortedRatings } from '../../domain/automaticity.js';

const a = nl.automaticity;
const FEEDBACK_KEY = 'hb-automaticity-rated';
const LEVELS = ['aware', 'coming', 'almost', 'natural'];
const CHART_MAX = 8; // zoveel cijfers staan in het verloop

// de habits waarvan de vijf zinnen weer openstaan (na "Wijzig"); een scherm dat zich ververst begint anders weer met alleen het cijfer
const reopened = new Set();

/** Hoe vaak is er al een cijfer gegeven op dit apparaat? De eerste keren legt de regel onder het cijfer uit waar je het terugziet. */
function ratedBefore() {
  try { return Number(localStorage.getItem(FEEDBACK_KEY) ?? 0); } catch { return 0; }
}
export function noteRated() {
  try { localStorage.setItem(FEEDBACK_KEY, String(ratedBefore() + 1)); } catch { /* zonder opslag blijft de lange tekst staan */ }
}

/** Wat je na een cijfer ziet: dat het genoteerd is, en waar je het terugziet. De eerste keer met uitleg, daarna kort. */
export function automaticityFeedback(habitId) {
  return h('p', { class: 'auto-feedback xs muted', role: 'status' },
    ratedBefore() <= 1 ? a.feedback.first : a.feedback.short, ' ',
    h('a', { class: 'auto-feedback__link', href: `#/habits/${encodeURIComponent(habitId)}` }, a.feedback.link));
}

const toggleCue = (cues, cue) => {
  if (cue === 'nothing') return cues.includes('nothing') ? [] : ['nothing'];
  const rest = cues.filter((c) => c !== 'nothing');
  return rest.includes(cue) ? rest.filter((c) => c !== cue) : [...rest, cue];
};

/**
 * Het cijfer: vijf zinnen om uit te kiezen (een zin zegt meer dan een getal), en na het kiezen alleen de gekozen zin met "Wijzig".
 * Daaronder een paar knoppen voor wat er hielp (een herinnering, het plan van de app, ...): optioneel, en het geeft de raad bij het automatisme.
 * onRate(score) en onCues(cues) slaan op; het scherm ververst daarna zelf.
 */
export function automaticityPicker({ habitId, score, cues = [], onRate, onCues, intro = a.intro }) {
  const open = score === null || reopened.has(habitId);
  const options = h('div', { class: 'auto-options', role: 'group', 'aria-label': a.question },
    ...[1, 2, 3, 4, 5].map((value) => h('button', {
      type: 'button',
      class: 'auto-option',
      'aria-pressed': score === value ? 'true' : 'false',
      'aria-label': a.scoreLabel(value, a.scale[value]),
      dataset: { focusKey: `rate:${habitId}:${value}` },
      onclick: () => { reopened.delete(habitId); onRate(value); },
    }, h('span', { class: 'auto-option__num', 'aria-hidden': 'true' }, String(value)), h('span', { class: 'auto-option__text' }, a.scale[value]))));
  const summary = h('div', { class: 'auto-summary' },
    h('p', { class: 'auto-summary__text' }, h('b', null, String(score)), ' · ', a.scale[score]),
    h('button', {
      type: 'button',
      class: 'button button--ghost button--small',
      dataset: { focusKey: `rate-change:${habitId}` },
      onclick: () => { reopened.add(habitId); notifyChanged(); },
    }, a.change));
  const helped = score === null ? null : h('div', { class: 'auto-helped', role: 'group', 'aria-label': a.helped.title },
    h('p', { class: 'xs muted' }, a.helped.title),
    h('div', { class: 'auto-chips' }, ...RATING_CUES.map((cue) => h('button', {
      type: 'button',
      class: 'auto-chip',
      'aria-pressed': cues.includes(cue) ? 'true' : 'false',
      dataset: { focusKey: `cue:${habitId}:${cue}` },
      onclick: () => onCues(toggleCue(cues, cue)),
    }, a.helped[cue]))));
  return h('div', { class: 'auto-picker' },
    open ? h('p', { class: 'xs muted' }, intro) : null,
    open ? options : summary,
    helped);
}

/** De uitleg als blad: wanneer is iets automatisch, de cijfers, en waarom de app zich terug mag trekken. */
export function openAutomaticityGuide(opener = null) {
  const g = a.guide;
  openDialog({
    title: g.title,
    description: g.intro,
    className: 'dialog--guide',
    content: h('div', { class: 'stack' },
      h('ul', { class: 'guide__types' }, ...g.signs.map((sign) => h('li', { class: 'guide__type' },
        h('span', { class: 'guide__type-title' }, sign.title),
        h('span', { class: 'guide__type-text' }, sign.text)))),
      h('p', { class: 'kicker' }, g.scaleTitle),
      h('ol', { class: 'auto-scale' }, ...[1, 2, 3, 4, 5].map((value) => h('li', null, h('b', null, String(value)), ' · ', a.scale[value]))),
      h('p', { class: 'xs muted' }, g.notFailing),
      h('p', { class: 'xs muted' }, g.scaffold)),
    actions: [{ label: nl.app.close, variant: 'primary' }],
    cancelLabel: null,
    onClose: () => opener?.focus(),
  });
}

/** De knop die de uitleg opent. */
export function guideLink() {
  const button = h('button', { type: 'button', class: 'auto-guide-link', onclick: () => openAutomaticityGuide(button) }, a.whatIs);
  return button;
}

/** Vier stappen met namen: waar sta je (het laatste cijfer) en waar wil je heen. */
export function automaticityMeter(score) {
  const level = levelOf(score);
  const reached = LEVELS.indexOf(level);
  return h('div', { class: 'auto-meter', role: 'img', 'aria-label': `${a.levels[level]} (${score} van 5)` },
    h('div', { class: 'auto-meter__bar', 'aria-hidden': 'true' }, ...LEVELS.map((key, i) => h('i', { class: i <= reached ? 'is-on' : '' }))),
    h('div', { class: 'auto-meter__labels', 'aria-hidden': 'true' }, ...LEVELS.map((key) => h('span', { class: key === level ? 'on' : '' }, a.levels[key]))));
}

/** De cijfers van keer tot keer als staafjes met de doellijn bij 4, en wat de app daarover zegt. */
export function automaticityChart(ratings) {
  const shown = sortedRatings(ratings).slice(-CHART_MAX);
  const bars = shown.map((rating) => {
    const bar = h('i', { class: `auto-bar${rating.score >= AUTOMATICITY_THRESHOLD ? ' is-goal' : ''}` });
    bar.style.setProperty('--v', String(rating.score / 5));
    return h('div', { class: 'auto-bars__col' }, h('span', { class: 'auto-bars__score' }, String(rating.score)), bar, h('span', { class: 'auto-bars__date' }, formatDateShort(rating.weekStart)));
  });
  return h('div', { class: 'auto-chart' },
    h('div', { class: 'auto-bars', role: 'img', 'aria-label': a.history.chart(shown.map((r) => r.score)) },
      h('span', { class: 'auto-bars__goal', 'aria-hidden': 'true' }, a.history.goal),
      ...bars));
}

/** De regel over wat er hielp, als die al een paar keer is ingevuld. Anders null. */
export function cueLine(ratings) {
  const { tagged, external } = cueSummary(ratings);
  return tagged >= 2 ? h('p', { class: 'xs muted' }, a.history.cues(external, tagged)) : null;
}
