// Taken die blijven liggen (docs/PLAN.md §4.9): een kaart per taak met een korte, neutrale regel, en een blad om de reden te kiezen.
import { habitIcon } from './habit-icon.js';
import { openDialog } from './dialog.js';
import { charCounter } from './char-counter.js';
import { h } from '../dom.js';
import { nl } from '../../content/nl.js';
import { formatDateShort, formatSchedule } from '../../app/format.js';
import { NOTE_MAX_LENGTH } from '../../domain/constants.js';
import { SLIP_REASONS } from '../../domain/attention.js';
import { scheduleOn } from '../../domain/pace.js';

export const reasonLabel = (code) => nl.attention.reasons[code] ?? '';

const capitalize = (text) => text.replace(/^./, (c) => c.toUpperCase());

/** De regel onder de naam, voor een signaal uit domain/attention.js. */
export function attentionText(signal) {
  const t = nl.attention.text;
  const d = signal.detail;
  switch (signal.kind) {
    case 'late':
      return t.late(Number(d.due.slice(8)));
    case 'silent':
      return d.lastDone === null ? t.silentNever : t.silent(d.days);
    case 'failed':
      if (d.givenUp) return nl.attention.wontGivenUp;
      if (d.span === 'day') return t.failedDays(formatDateShort(d.start), d.missed);
      if (d.span === 'month') return t.failedMonth(capitalize(nl.months.long[Number(d.start.slice(5, 7)) - 1]), d.count, d.target);
      return t.failedWeek(formatDateShort(d.start), d.count, d.target);
    case 'behind':
      return t.behind(d.span, d.count, d.target);
    default:
      return '';
  }
}

/**
 * Het blad "Wat hield je tegen?": vijf redenen met één tik en een optionele toelichting.
 * onSave({ reason, note }) bewaart de reden. `extras` zijn knoppen die er ook iets mee doen (bijv. alsnog afvinken of overslaan):
 * run({ reason, note }) krijgt de gekozen reden (of null als je er geen koos).
 *
 * Met `wont: { span }` ('day' | 'week' | 'month') is het het blad van "Ga ik niet doen" (docs/WONT-DO.md): een eerlijke uitleg, de reden is verplicht
 * en er is een optioneel plan ("wat ga je doen zodat je dit niet nog eens hoeft te falen?"). onSave krijgt dan ook { plan }.
 */
export function openReasonSheet({ habit, current = null, onSave, extras = [], wont = null }) {
  const s = wont ? nl.attention.wontSheet : nl.attention.sheet;
  let chosen = current?.reason ?? null;
  const planInput = wont ? h('input', { id: 'reasonPlan', type: 'text', class: 'input', value: current?.plan ?? '', placeholder: s.planPlaceholder }) : null;
  const plan = () => planInput?.value.trim() || null;
  const noteLabel = h('label', { class: 'field__label', for: 'reasonNote' }, chosen === 'other' ? s.noteOther : s.note);
  const error = h('p', { class: 'field__error', role: 'alert', hidden: true }, s.choose);
  const noteInput = h('input', { id: 'reasonNote', type: 'text', class: 'input', value: current?.note ?? '', placeholder: s.notePlaceholder });
  const note = () => noteInput.value.trim() || null;

  const group = h('div', { class: 'choices choices--reasons', role: 'radiogroup', 'aria-label': s.title(habit.name) },
    ...SLIP_REASONS.map((code) => h('label', { class: 'choice' },
      h('input', {
        class: 'choice__input', type: 'radio', name: 'reason', value: code, checked: code === chosen,
        onchange: () => {
          chosen = code;
          error.hidden = true;
          noteLabel.textContent = code === 'other' ? s.noteOther : s.note;
          if (code === 'other') noteInput.focus(); // past geen van de redenen, dan is de toelichting de reden
        },
      }),
      h('span', { class: 'choice__face choice__face--text choice__face--reason' }, reasonLabel(code)))));

  return openDialog({
    title: s.title(habit.name),
    description: wont ? s.description(wont.span) : s.description,
    content: h('div', { class: 'stack' },
      group,
      h('div', { class: 'field' }, noteLabel, noteInput, charCounter(noteInput, NOTE_MAX_LENGTH)),
      planInput ? h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'reasonPlan' }, s.plan), planInput, charCounter(planInput, NOTE_MAX_LENGTH)) : null,
      error),
    actions: [
      {
        label: s.save,
        variant: 'primary',
        onClick: async () => {
          if (chosen === null) { error.hidden = false; return false; }
          await onSave({ reason: chosen, note: note(), plan: plan() });
          return true;
        },
      },
      ...extras.map(({ label, variant = 'secondary', run }) => ({ label, variant, onClick: () => run({ reason: chosen, note: note(), plan: plan() }) })),
    ],
    cancelLabel: s.later,
  });
}

/**
 * Eén taak die aandacht vraagt. item: { habit, signal, reason, handled } uit app/attention.js.
 * onWhy(item) opent het blad; onTick(item) (optioneel) vinkt de taak nu af; onWont(item) (optioneel) geeft de taak op ("ga ik niet doen").
 * Een taak waar al op gereageerd is toont de reden (en het plan) en een knop om die te wijzigen.
 */
export function attentionCard(item, { today, onWhy, onTick = null, onWont = null }) {
  const { habit, signal, reason, handled } = item;
  const schedule = formatSchedule(scheduleOn(habit, today));
  const buttons = handled
    ? [h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `why:${habit.id}` }, onclick: () => onWhy(item) }, nl.attention.change)]
    : [
      onTick ? h('button', { type: 'button', class: 'button button--primary button--small', dataset: { focusKey: `tick:${habit.id}` }, onclick: () => onTick(item) }, nl.attention.tickNow) : null,
      h('button', { type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: `why:${habit.id}` }, onclick: () => onWhy(item) }, nl.attention.why),
      onWont
        ? h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `wont:${habit.id}` }, onclick: () => onWont(item) }, nl.attention.wont)
        : null,
    ].filter(Boolean);

  return h('li', { class: 'pool-card attention-card', dataset: { state: handled ? 'satisfied' : 'open', color: habit.color, kind: signal.kind } },
    h('div', { class: 'attention-card__head' },
      h('span', { class: 'pool-card__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
      h('div', { class: 'pool-card__name' }, habit.name)),
    h('div', { class: 'pool-card__body' },
      h('p', { class: 'attention-card__text' }, attentionText(signal)),
      h('p', { class: 'attention-card__agreed xs muted' }, nl.attention.agreed(schedule)),
      handled ? h('p', { class: 'attention-card__reason' }, nl.attention.reasonGiven(reasonLabel(reason.reason)), reason.note ? ` · ${reason.note}` : '') : null,
      handled && reason.plan ? h('p', { class: 'attention-card__reason' }, nl.attention.planGiven(reason.plan)) : null),
    h('div', { class: 'pool-card__actions' }, h('div', { class: 'pool-card__more' }, ...buttons)));
}
