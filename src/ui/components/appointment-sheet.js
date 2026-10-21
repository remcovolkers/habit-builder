// Het blad om een losse afspraak toe te voegen of te wijzigen (docs/LOSSE-AFSPRAKEN.md): wat, welk dagdeel en welke dag.
// De dag is voorgevuld met de dag die je op Vandaag bekijkt, zodat toevoegen vanaf "donderdag" een afspraak voor donderdag maakt.
import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { charCounter } from './char-counter.js';
import { DAYPARTS } from '../../domain/habit.js';
import { addDays } from '../../domain/dates.js';
import { APPOINTMENT_AHEAD_DAYS, APPOINTMENT_TITLE_MAX, inAppointmentWindow, validateAppointment } from '../../domain/appointments.js';
import { nl } from '../../content/nl.js';

const t = nl.today.appointments;
const s = t.sheet;

const message = (field, code) => {
  const text = t.errors[field]?.[code];
  if (typeof text === 'function') return text(field === 'title' ? APPOINTMENT_TITLE_MAX : APPOINTMENT_AHEAD_DAYS);
  return text ?? t.errors.date.invalid;
};

/**
 * existing: de afspraak bij wijzigen (anders null: nieuw). date: de voorgevulde dag. today: de echte vandaag.
 * onSave({ title, date, daypart }) en onRemove(existing) doen het werk; het blad sluit daarna.
 */
export function openAppointmentSheet({ existing = null, date, today, onSave, onRemove = null }) {
  const errorEl = (id) => h('p', { id, class: 'field__error', role: 'alert', hidden: true });
  const titleError = errorEl('appointmentTitleError');
  const dateError = errorEl('appointmentDateError');

  const title = h('input', {
    id: 'appointmentTitle', class: 'input', type: 'text', value: existing?.title ?? '', placeholder: s.whatPlaceholder, autocomplete: 'off',
    'aria-describedby': 'appointmentTitleError', 'aria-required': 'true',
  });
  const when = h('input', {
    id: 'appointmentDate', class: 'input', type: 'date', value: date, min: today, max: addDays(today, APPOINTMENT_AHEAD_DAYS), 'aria-describedby': 'appointmentDateError',
  });
  const daypartGroup = h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'appointmentDaypartLabel' },
    ...DAYPARTS.map((d) => h('label', { class: 'segmented__item' },
      h('input', { class: 'choice__input', type: 'radio', name: 'appointmentDaypart', value: d, checked: d === (existing?.daypart ?? 'anytime') }),
      h('span', { class: 'segmented__face' }, nl.dayparts[d]))));
  const chosenDaypart = () => daypartGroup.querySelector('input[name="appointmentDaypart"]:checked')?.value ?? 'anytime';

  const show = (el, text) => { el.textContent = text; el.hidden = false; };

  function submit() {
    titleError.hidden = true;
    dateError.hidden = true;
    const values = { title: title.value, date: when.value, daypart: chosenDaypart() };
    const errors = validateAppointment(values);
    // een dag in het verleden mag alleen als de afspraak die dag al had (dan schuift hij stil door naar vandaag)
    if (!errors.some((e) => e.field === 'date') && values.date !== existing?.date && !inAppointmentWindow(values.date, today)) errors.push({ field: 'date', code: 'window' });
    if (errors.length > 0) {
      for (const { field, code } of errors) show(field === 'title' ? titleError : dateError, message(field, code));
      (errors.some((e) => e.field === 'title') ? title : when).focus();
      return false;
    }
    return onSave({ ...values, title: values.title.trim() });
  }

  const actions = [{ label: existing ? s.save : s.add, variant: 'primary', onClick: submit }];
  if (existing && onRemove) actions.push({ label: s.remove, variant: 'danger', onClick: () => onRemove(existing) });

  const { dialog } = openDialog({
    title: existing ? s.titleEdit : s.titleNew,
    description: existing ? null : s.intro,
    className: 'dialog--appointment',
    // nieuw: meteen typen (het toetsenbord mag omhoog, daar is het blad voor); wijzigen: eerst kijken
    focus: existing ? 'title' : 'native',
    content: h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'appointmentTitle' }, s.what),
        title,
        charCounter(title, APPOINTMENT_TITLE_MAX),
        titleError),
      h('div', { class: 'field' },
        h('p', { class: 'field__label', id: 'appointmentDaypartLabel' }, s.daypart),
        daypartGroup),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'appointmentDate' }, s.date),
        when,
        dateError)),
    actions,
  });
  // Enter in het tekstveld = opslaan (op een telefoon is dat de "klaar"-toets)
  title.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    dialog.querySelector('.dialog__actions .button--primary')?.click();
  });
}
