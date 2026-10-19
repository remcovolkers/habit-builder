// De review onder Voortgang, passend bij de gekozen periode: een weekreview in de weekweergave, een maandreview in de maandweergave.
// Wat is ingevuld staat als nette kaart met een rustige "Bewerk"; wat nog kan staat als formulier; de rest als lege staat.
import { h } from '../dom.js';
import { notifyChanged, state, wallClockNow } from '../state.js';
import { showToast } from './toast.js';
import { charCounter } from './char-counter.js';
import { attentionCard, openReasonSheet, reasonLabel } from './attention.js';
import { trialReviewBlock } from './trial.js';
import { nl } from '../../content/nl.js';
import { recordReason, RuleError, saveMonthlyReview, saveWeeklyReview } from '../../app/actions.js';
import { buildWeekReview } from '../../app/attention.js';
import { buildPeriodOverview } from '../../app/overview.js';
import { buildMonthReviewCard, buildWeekReviewCard } from '../../app/reviews.js';
import { formatDateLong, formatDateShort } from '../../app/format.js';
import { REVIEW_TEXT_MAX, ValidationError } from '../../data/repository.js';
import { isoWeek } from '../../domain/dates.js';
import { REVIEW_CLOSING_TIME } from '../../domain/reviews.js';

const t = nl.stats.review;

// Wat je typt blijft staan als het scherm zich ververst (een reden opslaan, een sync, een nieuwe dag), en welke kaart je aan het bewerken bent.
let draft = null; // { key, values }
let editing = null; // key van de kaart die als formulier openstaat

/**
 * De markering na een tik op de melding "je review staat klaar": de kaart scrolt in beeld, licht even op en krijgt de focus (voor schermlezers).
 * Zonder animatie (voorkeur voor minder beweging) blijft het bij een rand die even blijft staan.
 */
export function spotlightReview(card) {
  if (!card) return;
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  card.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  card.tabIndex = -1;
  card.focus({ preventScroll: true });
  card.classList.add('review-card--spotlight');
  setTimeout(() => card.classList.remove('review-card--spotlight'), 3600);
}

/** Bij bladeren naar een andere periode gaat een openstaand formulier weer dicht (wat je typte blijft bewaard). */
export const closeReviewForm = () => { editing = null; };

const weekKey = (start) => `week:${start}`;
const monthKey = (start) => `month:${start}`;
const monthName = (monthStart) => nl.months.long[Number(monthStart.slice(5, 7)) - 1];

/** Een leeg veld met teller; bewaart de invoer in `draft`. */
function textField({ id, label, key, name, current, rows = 3 }) {
  const values = () => ({ ...(draft?.key === key ? draft.values : {}) });
  const initial = draft?.key === key && name in draft.values ? draft.values[name] : current ?? '';
  const input = h('textarea', {
    id, class: 'input', rows, dataset: { focusKey: `review:${id}` },
    oninput: () => { draft = { key, values: { ...values(), [name]: input.value } }; },
  }, initial);
  return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), input, charCounter(input, REVIEW_TEXT_MAX));
}

/** Een formulier met velden, opslaan en (bij een bestaande review) annuleren. */
function reviewForm({ key, fields, hint = null, onSave, cancellable, requiredMessage }) {
  const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const form = h('form', {
    class: 'review form',
    novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      const values = Object.fromEntries(fields.map((field) => [field.name, form.querySelector(`#${field.id}`).value]));
      if (fields.every((field) => values[field.name].trim() === '')) {
        error.textContent = requiredMessage;
        error.hidden = false;
        return;
      }
      try {
        await onSave(values);
      } catch (err) {
        if (err instanceof RuleError) { // de review sloot terwijl je typte: het scherm toont hem nu als gesloten
          editing = null;
          notifyChanged();
          showToast({ message: t.closedNow });
          return;
        }
        if (!(err instanceof ValidationError)) throw err;
        error.textContent = t.tooLong;
        error.hidden = false;
        return;
      }
      draft = null;
      editing = null;
      notifyChanged();
      showToast({ message: t.saved });
    },
  },
  ...fields.map((field) => textField({ ...field, key })),
  hint ? h('p', { class: 'xs muted' }, hint) : null,
  error,
  h('div', { class: 'review__actions' },
    h('button', { type: 'submit', class: 'button button--primary' }, t.save),
    cancellable
      ? h('button', { type: 'button', class: 'button button--ghost', onclick: () => { draft = null; editing = null; notifyChanged(); } }, t.cancel)
      : null));
  return form;
}

/** Wat je hebt ingevuld, als rustige kaart met een kleine "Bewerk". */
function savedCard({ key, items, footer = null, onEdit }) {
  return h('div', { class: 'review-saved' },
    ...items.map((item) => h('div', { class: 'review-saved__item', dataset: { tone: item.tone } },
      h('p', { class: 'review-saved__label' }, item.label),
      h('p', { class: 'review-saved__text' }, item.text))),
    h('div', { class: 'review-saved__foot' },
      footer ? h('p', { class: 'xs muted' }, footer) : h('span'),
      onEdit ? h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `edit:${key}` }, onclick: onEdit }, t.edit) : null));
}

/** Een lege staat: een korte titel en uitleg, met eventueel een knop. */
function quiet({ title, text, action = null }) {
  return h('div', { class: 'review-empty' },
    h('p', { class: 'review-empty__title' }, title),
    h('p', { class: 'xs muted' }, text),
    action);
}

const startEditing = (key) => () => { editing = key; notifyChanged(); };

// --- week --------------------------------------------------------------------------------------------

/** 'maandag 19 oktober 12:00' */
const closingLabel = (date) => `${formatDateLong(date)} ${REVIEW_CLOSING_TIME}`;

function weekBody({ snapshot, today, card }) {
  const w = t.week;
  const key = weekKey(card.start);
  const form = editing === key;
  const until = w.openUntil(closingLabel(card.closesOn));

  if (card.state === 'before' && !card.isCurrent) return quiet({ title: w.lockedTitle, text: w.locked(formatDateLong(card.opensOn)) });

  // de terugblik: voor de huidige week de taken die aandacht vragen (elk met één tik voor de reden), anders de uitkomst van de week
  let lookback = null;
  if (card.isCurrent) {
    const review = buildWeekReview({ snapshot, today });
    const a = nl.attention.review;
    const why = (item) => openReasonSheet({
      habit: item.habit,
      current: item.reason,
      onSave: async ({ reason, note }) => {
        await recordReason(state.repo, { habitId: item.habit.id, reason, note }, today);
        notifyChanged();
        showToast({ message: nl.attention.sheet.saved(reasonLabel(reason)) });
      },
    });
    lookback = h('div', { class: 'review__lookback' },
      h('p', { class: 'kicker' }, a.title),
      review.week.total > 0 ? h('p', { class: 'xs muted' }, a.summary(review.week.done, review.week.total)) : null,
      review.items.length === 0
        ? h('p', { class: 'card__text muted' }, a.nothing)
        : h('div', { class: 'stack' },
          h('p', { class: 'xs muted' }, a.count(review.open, review.handled)),
          h('ul', { class: 'card-list' }, ...review.items.map((item) => attentionCard(item, { today, onWhy: why })))));
  } else {
    const { totals } = buildPeriodOverview({ snapshot, today, period: 'week', anchor: card.start });
    if (totals.total > 0) lookback = h('p', { class: 'xs muted' }, w.outcome(totals.done, totals.total));
  }

  const items = card.review && [
    card.review.wentWell ? { tone: 'good', label: w.wentWellShort, text: card.review.wentWell } : null,
    card.review.wentBad ? { tone: 'bad', label: w.wentBadShort, text: card.review.wentBad } : null,
  ].filter(Boolean);

  let content;
  if (card.state === 'before') {
    content = quiet({ title: w.lockedTitle, text: w.locked(formatDateLong(card.opensOn)) });
  } else if (card.state === 'closed') {
    content = card.review
      ? savedCard({ key, items, footer: w.closedNote(closingLabel(card.closesOn)) })
      : quiet({ title: w.closedTitle, text: w.closedEmpty(closingLabel(card.closesOn)) });
  } else if (card.review && !form) {
    content = savedCard({ key, items, footer: until, onEdit: startEditing(key) });
  } else {
    content = reviewForm({
      key,
      cancellable: Boolean(card.review),
      requiredMessage: w.atLeastOne,
      hint: until,
      fields: [
        { id: 'wentWell', name: 'wentWell', label: w.wentWell, current: card.review?.wentWell },
        { id: 'wentBad', name: 'wentBad', label: w.wentBad, current: card.review?.wentBad },
      ],
      onSave: (values) => saveWeeklyReview(state.repo, values, card.start, wallClockNow()),
    });
  }
  // "heb je het gedaan zonder de app?" voor een proef van deze week, en een aanbod voor taken die zover zijn (alleen als de review open staat)
  const trial = trialReviewBlock({ snapshot, today, period: 'week', start: card.start, open: card.state === 'open' });
  return h('div', { class: 'stack' }, trial, lookback, content);
}

// --- maand -------------------------------------------------------------------------------------------

function weeksSummary(card, onOpenWeek) {
  const m = t.month;
  return h('div', { class: 'review-weeks' },
    h('div', { class: 'section-head' },
      h('h3', { class: 'kicker' }, m.weeksTitle),
      h('span', { class: 'xs muted' }, m.weeksCount(card.weeks.length, card.weekCount))),
    card.weeks.length === 0
      ? h('p', { class: 'xs muted' }, m.weeksNone)
      : h('ul', { class: 'review-weeks__list' }, ...card.weeks.map((week) => h('li', { class: 'review-weeks__item' },
        h('div', { class: 'review-weeks__head' },
          h('span', { class: 'review-weeks__name' }, `${nl.stats.overview.weekNumber(isoWeek(week.start))} · ${formatDateShort(week.start)} – ${formatDateShort(week.end)}`),
          h('button', { type: 'button', class: 'button button--ghost button--small', onclick: () => onOpenWeek(week.start) }, m.openWeek)),
        week.review.wentWell ? h('p', { class: 'review-weeks__line', dataset: { tone: 'good' } }, week.review.wentWell) : null,
        week.review.wentBad ? h('p', { class: 'review-weeks__line', dataset: { tone: 'bad' } }, week.review.wentBad) : null))));
}

function monthBody({ snapshot, today, card, onOpenWeek }) {
  const m = t.month;
  const key = monthKey(card.start);
  const form = editing === key;
  const taskLabel = formatDateLong(card.taskFrom);
  const until = m.openUntil(closingLabel(card.closesOn));
  const locked = quiet({ title: m.lockedTitle, text: m.locked(formatDateLong(card.opensOn)) });

  if (card.isFuture) return locked;

  const taskNote = card.taskState === 'done' ? m.taskDone(formatDateLong(card.review?.appliedAt ?? card.taskFrom)) : card.taskState === 'open' ? m.taskOpen : m.taskComing(taskLabel);
  const items = card.review && [{ tone: 'plan', label: m.adjust, text: card.review.adjust }];

  let content;
  if (card.state === 'before') {
    content = locked;
  } else if (card.state === 'closed') {
    content = card.review
      ? savedCard({ key, items, footer: `${taskNote} ${m.closedNote(closingLabel(card.closesOn))}` })
      : quiet({ title: m.closedTitle, text: m.closedEmpty(closingLabel(card.closesOn)) });
  } else if (card.review && !form) {
    content = savedCard({ key, items, footer: `${taskNote} ${until}`, onEdit: startEditing(key) });
  } else {
    content = reviewForm({
      key,
      cancellable: Boolean(card.review),
      requiredMessage: m.required,
      hint: `${card.review ? taskNote : m.taskComing(taskLabel)} ${until}`,
      fields: [{ id: 'adjust', name: 'adjust', label: m.adjust, current: card.review?.adjust }],
      onSave: (values) => saveMonthlyReview(state.repo, values, card.start, wallClockNow()),
    });
  }
  const trial = trialReviewBlock({ snapshot, today, period: 'month', start: card.start, open: card.state === 'open' });
  return h('div', { class: 'stack' },
    weeksSummary(card, onOpenWeek),
    trial,
    card.state === 'open' ? h('p', { class: 'section__hint' }, m.adjustHint) : null,
    content);
}

/**
 * De reviewkaart voor de gekozen periode `{ period, anchor }`; `onChange` stuurt het scherm naar een andere periode.
 */
export function periodReview(snapshot, today, choice, onChange) {
  const isWeek = choice.period === 'week';
  const now = wallClockNow();
  const card = isWeek
    ? buildWeekReviewCard({ snapshot, now, today, date: choice.anchor })
    : buildMonthReviewCard({ snapshot, now, today, date: choice.anchor });
  const heading = isWeek
    ? `${nl.stats.overview.weekNumber(isoWeek(card.start))} · ${formatDateShort(card.start)} – ${formatDateShort(card.end)}`
    : `${monthName(card.start)} ${card.start.slice(0, 4)}`;
  return h('section', { class: 'card review-card', dataset: { period: choice.period, state: card.state }, 'aria-labelledby': 'review-title' },
    h('h2', { id: 'review-title', class: 'section__title' }, isWeek ? t.week.title : t.month.title),
    h('p', { class: 'kicker review-card__period' }, heading),
    isWeek
      ? weekBody({ snapshot, today, card })
      : monthBody({ snapshot, today, card, onOpenWeek: (start) => onChange({ period: 'week', anchor: start }) }));
}
