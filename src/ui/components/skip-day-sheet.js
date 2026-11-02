// Het blad om een of meer dagen over te slaan (docs/DAG-OVERSLAAN.md): welke dagen, en waarom (verplicht).
// Een dag die al is overgeslagen opent hetzelfde blad voor alleen de reden, met een knop om hem weer mee te laten tellen.
import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { charCounter } from './char-counter.js';
import { addDays, diffDays } from '../../domain/dates.js';
import { BACKFILL_DAYS, NOTE_MAX_LENGTH } from '../../domain/constants.js';
import { SKIP_AHEAD_DAYS, SKIP_MAX_DAYS, SKIP_REASONS, inSkipWindow, validateSkipDay } from '../../domain/skipdays.js';
import { nl } from '../../content/nl.js';

const s = nl.today.skipDay;

/**
 * existing: de overgeslagen dag bij wijzigen (anders null: nieuw). date: de voorgevulde dag. today: de echte vandaag.
 * onSave({ from, to, reason, note }) en onRemove(existing) doen het werk; het blad sluit daarna.
 */
export function openSkipDaySheet({ existing = null, date, today, onSave, onRemove = null }) {
  let chosen = existing?.reason ?? null;
  const reasonError = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const noteError = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const dateError = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const show = (el, text) => { el.textContent = text; el.hidden = false; };

  const noteLabel = h('label', { class: 'field__label', for: 'skipNote' }, chosen === 'other' ? s.noteOther : s.note);
  const noteInput = h('input', { id: 'skipNote', type: 'text', class: 'input', value: existing?.note ?? '', placeholder: s.notePlaceholder, autocomplete: 'off', 'aria-describedby': 'skipNoteError' });
  noteError.id = 'skipNoteError';

  const group = h('div', { class: 'choices choices--reasons', role: 'radiogroup', 'aria-label': s.reasonLabel },
    ...SKIP_REASONS.map((code) => h('label', { class: 'choice' },
      h('input', {
        class: 'choice__input', type: 'radio', name: 'skipReason', value: code, checked: code === chosen,
        onchange: () => {
          chosen = code;
          reasonError.hidden = true;
          noteLabel.textContent = code === 'other' ? s.noteOther : s.note;
          if (code === 'other') noteInput.focus(); // past geen van de redenen, dan is de toelichting de reden
        },
      }),
      h('span', { class: 'choice__face choice__face--text choice__face--reason' }, s.reasons[code]))));

  // de dagen: alleen bij nieuw (bij wijzigen gaat het om die ene dag)
  const earliest = addDays(today, -BACKFILL_DAYS);
  const latest = addDays(today, SKIP_AHEAD_DAYS);
  const fromInput = h('input', { id: 'skipFrom', class: 'input', type: 'date', value: date, min: earliest, max: latest, 'aria-describedby': 'skipDateError' });
  const toInput = h('input', { id: 'skipTo', class: 'input', type: 'date', value: date, min: earliest, max: latest, 'aria-describedby': 'skipDateError' });
  dateError.id = 'skipDateError';
  // kies je een latere beginstreep dan het einde, dan schuift het einde mee
  fromInput.addEventListener('change', () => { if (fromInput.value && toInput.value < fromInput.value) toInput.value = fromInput.value; });

  async function submit() {
    reasonError.hidden = true;
    noteError.hidden = true;
    dateError.hidden = true;
    const from = existing ? existing.date : fromInput.value;
    const to = existing ? existing.date : toInput.value || from;
    const note = noteInput.value.trim() || null;
    const errors = validateSkipDay({ date: from, reason: chosen, note });
    let failed = null;
    const fail = (el, text, focus) => { show(el, text); failed ??= focus; };
    for (const { field, code } of errors) {
      if (field === 'reason') fail(reasonError, s.errors.reason, group.querySelector('input'));
      else if (field === 'note') fail(noteError, s.errors.note[code], noteInput);
      else fail(dateError, s.errors.date.invalid, fromInput);
    }
    if (errors.length === 0 && !existing) {
      if (to < from) fail(dateError, s.errors.date.order, toInput);
      else if (diffDays(to, from) + 1 > SKIP_MAX_DAYS) fail(dateError, s.errors.date.length(SKIP_MAX_DAYS), toInput);
      else if (!inSkipWindow(from, today) || !inSkipWindow(to, today)) fail(dateError, s.errors.date.window(BACKFILL_DAYS, SKIP_AHEAD_DAYS), fromInput);
    }
    if (failed) {
      failed.focus();
      return false;
    }
    await onSave({ from, to, reason: chosen, note });
    return true;
  }

  const actions = [{ label: existing ? s.save : s.skip, variant: 'primary', onClick: submit }];
  if (existing && onRemove) actions.push({ label: s.remove, variant: 'secondary', onClick: () => onRemove(existing) });

  const { dialog } = openDialog({
    title: existing ? s.titleEdit : s.titleNew,
    description: existing ? null : s.intro,
    className: 'dialog--skipday',
    content: h('div', { class: 'stack' },
      h('div', { class: 'field' }, group, reasonError),
      h('div', { class: 'field' }, noteLabel, noteInput, charCounter(noteInput, NOTE_MAX_LENGTH), noteError),
      existing ? null : h('div', { class: 'skipday__dates' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'skipFrom' }, s.from), fromInput),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'skipTo' }, s.to), toInput)),
      existing ? null : dateError),
    actions,
  });
  noteInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    dialog.querySelector('.dialog__actions .button--primary')?.click();
  });
}
