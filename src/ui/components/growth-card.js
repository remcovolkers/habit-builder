// Uitbouwen op de schermen (docs/FEEDBACKRONDE-2026-11.md): de kaart op de habit, de strook op de kaart van Vandaag, de bladen om een doel in te stellen of een
// trede te zetten, en het blokje in de weekreview. De regels staan in domain/growth.js, de handelingen in app/growth.js.
import { h, fill } from '../dom.js';
import { notifyChanged, state } from '../state.js';
import { openDialog } from './dialog.js';
import { charCounter } from './char-counter.js';
import { showToast } from './toast.js';
import { nl } from '../../content/nl.js';
import { ValidationError } from '../../data/repository.js';
import { RuleError } from '../../app/actions.js';
import { completeGoal, removeGoal, setGoal, takeStep } from '../../app/growth.js';
import { formatDateShort } from '../../app/format.js';
import { COUNTER_MAX } from '../../domain/counter.js';
import { GOAL_NOTE_MAX, GOAL_TEXT_MAX, currentStep } from '../../domain/growth.js';

const g = nl.growth;

function meter(percent) {
  const bar = h('div', { class: 'meter__fill' });
  bar.style.setProperty('--p', String(Math.round(percent * 100)));
  return h('div', { class: 'meter', role: 'img', 'aria-label': `${Math.round(percent * 100)}%` }, bar);
}

function errorText(error) {
  if (error instanceof RuleError) return g.errors[error.code] ?? g.errors.generic;
  if (error instanceof ValidationError) return g.errors.invalid;
  throw error;
}

const errorLine = () => h('p', { class: 'field__error', role: 'alert', hidden: true });
function showError(line, text) {
  line.textContent = text;
  line.hidden = false;
}

/** Het ritme van nu als { type, period, count } voor de keuze van soorten doel. */
const scheduleNow = (habit, today) => currentStep({ ...habit, goal: { kind: 'frequency' } }, today);

// --- een trede hoger of lager ----------------------------------------------------------------------

/** Het blad om een trede te zetten: `direction` is 'up' of 'down'. Vraagt het nieuwe aantal, de nieuwe hoeveelheid of de nieuwe tekst, en een korte notitie. */
export function openStepSheet({ habit, direction }) {
  const { goal } = habit;
  const step = currentStep(habit, state.today);
  const s = g.stepSheet;
  const error = errorLine();
  let input;
  let counter = null;
  let label;
  let hint = null;
  if (goal.kind === 'text') {
    label = s.text;
    input = h('input', { id: 'stepValue', class: 'input', type: 'text', placeholder: s.textPlaceholder, autocomplete: 'off' });
    counter = charCounter(input, GOAL_TEXT_MAX);
    hint = s.from(step?.text ?? '');
  } else {
    const now = goal.kind === 'frequency' ? step?.count ?? 1 : step?.target ?? 1;
    const top = goal.kind === 'frequency' ? goal.ideal.schedule.count : goal.ideal.target;
    label = goal.kind === 'frequency' ? s.frequency(step?.period ?? 'week') : s.quantity(step?.unit ?? '');
    const start = direction === 'up' ? Math.min(top, now + 1) : Math.max(1, now - 1);
    input = h('input', {
      id: 'stepValue', class: 'input input--number', type: 'number', inputmode: 'numeric',
      min: direction === 'up' ? now + 1 : 1, max: direction === 'up' ? top : now - 1, value: String(start),
    });
    hint = s.from(goal.kind === 'frequency' ? `${now}×` : `${now} ${step?.unit ?? ''}`.trim());
  }
  const note = h('textarea', { id: 'stepNote', class: 'input', rows: 2 });
  const content = h('div', { class: 'form' },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'stepValue' }, label), input, counter, hint ? h('p', { class: 'field__hint' }, hint) : null),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'stepNote' }, s.note), note, charCounter(note, GOAL_NOTE_MAX)),
    error);
  openDialog({
    title: direction === 'up' ? s.titleUp : s.titleDown,
    content,
    focus: 'title',
    actions: [{
      label: s.save,
      variant: 'primary',
      onClick: async () => {
        try {
          const checkIns = await state.repo.listCheckIns(habit.id);
          const { habit: next, undo } = await takeStep(state.repo, { habit, choice: direction, to: input.value, note: note.value }, state.today, checkIns);
          notifyChanged();
          const to = next.goal.log.at(-1).to;
          showToast({ message: (direction === 'up' ? g.toasts.up : g.toasts.down)(to), actionLabel: nl.app.undo, onAction: async () => { await undo(); notifyChanged(); } });
        } catch (caught) {
          showError(error, errorText(caught));
          return false;
        }
        return true;
      },
    }],
  });
}

/** Hier blijven: de nudge zwijgt een tijd. Geen blad, wel ongedaan maken. */
export async function stayOnStep(habit) {
  const checkIns = await state.repo.listCheckIns(habit.id);
  const { undo } = await takeStep(state.repo, { habit, choice: 'stay' }, state.today, checkIns);
  notifyChanged();
  showToast({ message: g.toasts.stay, actionLabel: nl.app.undo, onAction: async () => { await undo(); notifyChanged(); } });
}

/** Uitbouwen afronden ("Uitgebouwd"), na een bevestiging. */
export function confirmComplete({ habit, units, ratings }) {
  const c = g.completeConfirm;
  openDialog({
    title: c.title,
    description: c.text,
    actions: [{
      label: c.confirm,
      variant: 'primary',
      onClick: async () => {
        try {
          const checkIns = await state.repo.listCheckIns(habit.id);
          const { undo } = await completeGoal(state.repo, { habit, units, ratings }, state.today, checkIns);
          notifyChanged();
          showToast({ message: g.toasts.completed, actionLabel: nl.app.undo, onAction: async () => { await undo(); notifyChanged(); } });
        } catch (caught) {
          showToast({ message: errorText(caught) });
        }
      },
    }],
  });
}

// --- het doel instellen ------------------------------------------------------------------------------

/** Het blad om een doel in te stellen of aan te passen. Welke soorten kunnen, hangt van de habit af: frequentie bij N× per week of maand, hoeveelheid bij een teller, tekst altijd. */
export function openGoalSheet({ habit }) {
  const s = g.goalSheet;
  const existing = habit.goal && habit.goal.completedOn == null ? habit.goal : null;
  const step = scheduleNow(habit, state.today);
  const kinds = [step ? 'frequency' : null, habit.counter ? 'quantity' : null, 'text'].filter(Boolean);
  let kind = existing && kinds.includes(existing.kind) ? existing.kind : kinds[0];
  const error = errorLine();
  const fields = h('div', { class: 'stack' });
  const values = {
    frequency: existing?.kind === 'frequency' ? String(existing.ideal.schedule.count) : String(step ? Math.min(step.period === 'week' ? 7 : 31, step.count + 1) : ''),
    quantity: existing?.kind === 'quantity' ? String(existing.ideal.target) : String(habit.counter?.target ? Math.min(COUNTER_MAX, habit.counter.target * 2) : ''),
    stepText: existing?.kind === 'text' ? existing.stepText : '',
    idealText: existing?.kind === 'text' ? existing.ideal.text : '',
  };

  const field = (id, label, control, hint = null) => h('div', { class: 'field' },
    h('label', { class: 'field__label', for: id }, label), ...[control].flat(), hint ? h('p', { class: 'field__hint' }, hint) : null);
  const number = (id, key, max) => h('input', { id, class: 'input input--number', type: 'number', inputmode: 'numeric', min: 1, max, value: values[key], oninput: (e) => { values[key] = e.target.value; } });
  const text = (id, key, placeholder) => {
    const input = h('input', { id, class: 'input', type: 'text', placeholder, autocomplete: 'off', value: values[key], oninput: (e) => { values[key] = e.target.value; } });
    return [input, charCounter(input, GOAL_TEXT_MAX)];
  };

  const draw = () => {
    if (kind === 'frequency') fill(fields, field('goalFrequency', s.frequency(step.period, step.count), number('goalFrequency', 'frequency', step.period === 'week' ? 7 : 31)));
    else if (kind === 'quantity') fill(fields, field('goalQuantity', s.quantity(habit.counter.target ?? 1, habit.counter.unit), number('goalQuantity', 'quantity', COUNTER_MAX)));
    else fill(fields, field('goalStepText', s.stepText, text('goalStepText', 'stepText', s.stepTextPlaceholder)), field('goalIdealText', s.idealText, text('goalIdealText', 'idealText', s.idealTextPlaceholder), s.textHint));
  };
  const picker = kinds.length > 1
    ? h('fieldset', { class: 'field' },
      h('legend', { class: 'field__label' }, s.kind),
      ...kinds.map((k) => h('label', { class: 'choice' },
        h('input', { type: 'radio', name: 'goalKind', value: k, checked: k === kind, onchange: () => { kind = k; error.hidden = true; draw(); } }),
        h('span', null, s.kinds[k]))))
    : null;
  draw();

  openDialog({
    title: existing ? s.titleEdit : s.title,
    description: existing ? null : s.intro,
    content: h('div', { class: 'form' }, picker, fields, error),
    focus: 'title',
    actions: [{
      label: s.save,
      variant: 'primary',
      onClick: async () => {
        try {
          const ideal = kind === 'frequency' ? { schedule: { ...step ? { type: 'times_per_period', period: step.period } : {}, count: Number(values.frequency) } }
            : kind === 'quantity' ? { target: Number(values.quantity) } : { text: values.idealText };
          await setGoal(state.repo, { habit, kind, ideal, stepText: values.stepText }, state.today);
          notifyChanged();
          showToast({ message: g.toasts.goalSet });
        } catch (caught) {
          showError(error, errorText(caught));
          return false;
        }
        return true;
      },
    }],
  });
}

function confirmRemove(habit) {
  const c = g.removeConfirm;
  openDialog({
    title: c.title,
    description: c.text,
    actions: [{
      label: c.confirm,
      variant: 'danger',
      onClick: async () => {
        const { undo } = await removeGoal(state.repo, { habit });
        notifyChanged();
        showToast({ message: g.toasts.removed, actionLabel: nl.app.undo, onAction: async () => { await undo(); notifyChanged(); } });
      },
    }],
  });
}

// --- de kaart op de habit ------------------------------------------------------------------------------

const logLine = (entry) => (entry.choice === 'up' ? g.log.up(entry.from, entry.to) : entry.choice === 'down' ? g.log.down(entry.from, entry.to) : g.log.stay(entry.from));

function nudgeText(nudge) {
  if (nudge.state === 'ready') return nudge.atIdeal ? g.nudge.readyTop : g.nudge.ready(nudge.reps);
  if (nudge.state === 'building') return g.nudge.building(Math.max(1, nudge.threshold - nudge.reps));
  return g.nudge[nudge.state] ?? null;
}

/** Wat je nu kunt doen, als knoppen: de belangrijkste bovenaan de rij (primary), de rest rustig. */
function actionButtons({ habit, view, nudge, units, ratings }) {
  const button = (label, onclick, variant = 'secondary', id = null) => h('button', { type: 'button', id, class: `button button--${variant} button--small`, onclick }, label);
  const step = currentStep(habit, state.today);
  const canGoDown = habit.goal.kind === 'text' || (step && (step.count ?? step.target ?? 1) > 1);
  const up = button(g.up, () => openStepSheet({ habit, direction: 'up' }), nudge.state === 'ready' && !view.atIdeal ? 'primary' : 'secondary', 'growUp');
  const down = button(g.down, () => openStepSheet({ habit, direction: 'down' }), nudge.state === 'shaky' ? 'primary' : 'secondary', 'growDown');
  const stay = button(g.stay, () => stayOnStep(habit), 'ghost', 'growStay');
  const finish = button(g.complete, () => confirmComplete({ habit, units, ratings }), 'primary', 'growComplete');
  const buttons = [];
  if (nudge.state === 'ready' && view.atIdeal) buttons.push(finish, stay);
  else {
    if (!view.atIdeal || habit.goal.kind === 'text') buttons.push(up);
    if (canGoDown) buttons.push(down);
    if (nudge.state === 'ready' || nudge.state === 'shaky') buttons.push(stay);
  }
  return buttons;
}

/**
 * De kaart op de habit-pagina voor een habit met een doel: de trede van nu, het ideaal, hoe ver je bent, wat de app ervan vindt, de knoppen en je logboek.
 * `detail.growth` komt uit buildHabitDetail ({ view, nudge, growing }); `detail.stats.units` en `detail.ratings` voor het afronden.
 */
export function growthCard(detail) {
  const { habit, growth } = detail;
  const { view, nudge } = growth;
  const log = [...(habit.goal.log ?? [])].reverse();
  const header = h('div', { class: 'growth-card__head' },
    h('span', { class: 'kicker' }, growth.growing ? g.kicker : g.completedBadge),
    growth.growing ? h('span', { class: 'badge badge--growing' }, g.step(view.stepNumber)) : null);
  const lines = [
    h('p', { class: 'growth-card__line' }, h('b', null, view.current), ' ', h('span', { class: 'muted' }, `→ ${view.ideal}`)),
    view.progress !== null ? meter(view.progress) : null,
  ];
  const logBlock = log.length === 0 ? null : h('details', { class: 'fold growth-card__log' },
    h('summary', null, g.log.title),
    h('ul', { class: 'growth-card__list' }, ...log.map((entry) => h('li', null,
      h('span', { class: 'xs muted' }, formatDateShort(entry.date)), ' ', logLine(entry),
      entry.note ? h('span', { class: 'growth-card__note' }, ` “${entry.note}”`) : null))));

  if (!growth.growing) {
    return h('section', { class: 'card card--quiet growth-card', dataset: { state: 'completed' } },
      header, ...lines, h('p', { class: 'xs muted' }, g.completedOn(formatDateShort(habit.goal.completedOn))), logBlock);
  }
  const text = nudgeText(nudge);
  const credit = habit.goal.credit ?? 0;
  return h('section', { class: 'card growth-card', dataset: { state: nudge.state } },
    header,
    ...lines,
    h('p', { class: 'xs muted growth-card__reps' }, g.reps(nudge.reps, nudge.threshold), credit > 0 ? ` (${g.credit(credit)})` : ''),
    text ? h('p', { class: 'card__text growth-card__nudge' }, text) : null,
    h('div', { class: 'growth-card__actions' }, ...actionButtons({ habit, view, nudge, units: detail.stats.units, ratings: detail.ratings })),
    logBlock,
    h('div', { class: 'growth-card__foot' },
      h('button', { type: 'button', class: 'button button--ghost button--small', id: 'goalEdit', onclick: () => openGoalSheet({ habit }) }, g.editGoal),
      h('button', { type: 'button', class: 'button button--ghost button--small', id: 'goalRemove', onclick: () => confirmRemove(habit) }, g.removeGoal)));
}

/** Een rustige uitnodiging voor een lopende habit zonder doel. */
export function growthStartCard(detail) {
  const { habit } = detail;
  if (habit.status !== 'active' || habit.goal) return null;
  return h('section', { class: 'card card--quiet growth-card growth-card--start' },
    h('span', { class: 'kicker' }, g.kicker),
    h('p', { class: 'tip__title' }, g.startTitle),
    h('p', { class: 'card__text' }, g.startText),
    h('button', { type: 'button', class: 'button button--secondary button--small', id: 'goalStart', onclick: () => openGoalSheet({ habit }) }, g.startButton));
}

// --- de strook op de kaart van Vandaag ----------------------------------------------------------------

/** "Uitbouwen · 2× per week → 4× per week" met een balk; voor de kaart van een habit met een doel. */
export function growthStrip(growth, { inline = false } = {}) {
  return h('div', { class: `habit-card__growth${inline ? ' habit-card__growth--inline' : ''}` },
    h('span', { class: 'badge badge--growing' }, g.badge),
    h('span', { class: 'habit-card__growth-text' }, h('b', null, growth.current), ` → ${growth.ideal}`),
    growth.progress !== null ? meter(growth.progress) : null);
}

// --- het blokje in de weekreview en de maandreview --------------------------------------------------

/** De habits waar de app iets over wil zeggen, met de knoppen om meteen te kiezen. `prompts` komt uit buildGrowthPrompts (app/growth.js). */
export function growthReviewBlock(prompts) {
  if (prompts.length === 0) return null;
  return h('div', { class: 'review__growth' },
    h('p', { class: 'kicker' }, g.review.title),
    h('p', { class: 'xs muted' }, g.review.hint),
    h('ul', { class: 'card-list' }, ...prompts.map(({ habit, view, nudge, units, ratings }) => h('li', { class: 'card growth-card', dataset: { state: nudge.state } },
      h('div', { class: 'growth-card__head' }, h('b', null, habit.name), h('span', { class: 'badge badge--growing' }, g.step(view.stepNumber))),
      h('p', { class: 'growth-card__line' }, view.current, ' ', h('span', { class: 'muted' }, `→ ${view.ideal}`)),
      h('p', { class: 'card__text' }, nudgeText(nudge)),
      h('div', { class: 'growth-card__actions' }, ...actionButtons({ habit, view, nudge, units, ratings }))))));
}
