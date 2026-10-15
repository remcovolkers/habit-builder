import { fill, h } from '../dom.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { openDialog } from '../components/dialog.js';
import { nl } from '../../content/nl.js';
import { ValidationError } from '../../data/repository.js';
import {
  applyHabitForm, archiveHabit, pauseHabit, resumeHabit, unarchiveHabit,
} from '../../app/actions.js';
import { DAYPARTS, HABIT_COLORS, NAME_MAX, TEXT_MAX } from '../../domain/habit.js';
import { ALL_WEEKDAYS, WORKDAYS } from '../../domain/schedule.js';
import { currentSchedule } from './habits.js';
import { TEMPLATES } from '../../content/templates.js';
import { COUNTER_MAX, COUNTER_UNIT_MAX } from '../../domain/counter.js';

const ICONS = ['💧', '📖', '🏃', '🧘', '🥗', '😴', '💪', '🎸', '🧹', '📞', '✍️', '🚴', '🧠', '🌱', '☀️', '🦷', '💊', '🚭', '📝', '🎨', '🐕', '🧺', '💻', '🛌'];
const TYPES = ['daily', 'weekdays', 'per_week', 'day_of_month', 'per_month'];

function typeOf(schedule) {
  if (schedule.type === 'weekdays') return schedule.weekdays.length === 7 ? 'daily' : 'weekdays';
  if (schedule.type === 'times_per_period') return schedule.period === 'week' ? 'per_week' : 'per_month';
  return 'day_of_month';
}

/** Route '/habits/new' (id = null, optioneel ?template=water) of '/habits/:id'. */
export function habitFormView({ id, template = null }) {
  const root = h('div', { class: 'habit-form' });
  mount(root, id, template);
  return root;
}

async function mount(root, id, templateKey = null) {
  const { repo, today } = state;
  const existing = id === null ? null : await repo.getHabit(id);
  if (id !== null && !existing) {
    fill(root, 
      h('p', { class: 'muted' }, nl.form.notFound),
      h('a', { class: 'button button--ghost', href: '#/habits' }, nl.habits.title));
    return;
  }
  const preset = existing ? null : (TEMPLATES[templateKey] ?? null);
  const base = existing ?? preset ?? {};
  const pauses = existing ? await repo.listPauses(existing.id) : [];
  const openPause = pauses.find((p) => p.to == null) ?? null;
  const started = existing !== null && existing.startDate <= today;

  // --- beginwaarden -----------------------------------------------------------------------
  const initial = existing ? currentSchedule(existing, today) : (preset?.schedule ?? { type: 'weekdays', weekdays: [...ALL_WEEKDAYS] });
  const form = {
    type: typeOf(initial),
    weekdays: new Set(initial.type === 'weekdays' && initial.weekdays.length < 7 ? initial.weekdays : WORKDAYS),
    perWeek: initial.type === 'times_per_period' && initial.period === 'week' ? initial.count : 2,
    perMonth: initial.type === 'times_per_period' && initial.period === 'month' ? initial.count : 2,
    day: initial.type === 'day_of_month' ? initial.day : 1,
    counterOn: Boolean(base.counter),
    unit: base.counter?.unit ?? 'glazen',
    target: base.counter ? (base.counter.target ?? '') : 8,
  };

  // --- hulpjes voor velden ----------------------------------------------------------------
  const errorEls = {};
  const errorFor = (field) => (errorEls[field] ??= h('p', { id: `err-${field}`, class: 'field__error', role: 'alert', hidden: true }));
  const field = (label, control, { id: forId, hint = null, errorField = null, group = false } = {}) =>
    h(group ? 'fieldset' : 'div', { class: 'field' },
      h(group ? 'legend' : 'label', { class: 'field__label', for: group ? null : forId }, label),
      control,
      hint ? h('p', { class: 'field__hint', id: `hint-${errorField ?? forId}` }, hint) : null,
      errorField ? errorFor(errorField) : null);

  const name = h('input', { id: 'name', class: 'input', type: 'text', maxlength: NAME_MAX + 20, placeholder: nl.form.namePlaceholder, value: base.name ?? '', autocomplete: 'off', 'aria-describedby': 'err-name' });

  const iconChoices = [...new Set([...(base.icon && !ICONS.includes(base.icon) ? [base.icon] : []), ...ICONS])];
  const chosenIcon = base.icon ?? ICONS[0];
  const iconGroup = h('div', { class: 'choices', role: 'radiogroup' },
    ...iconChoices.map((icon) => h('label', { class: 'choice' },
      h('input', { class: 'choice__input', type: 'radio', name: 'icon', value: icon, checked: icon === chosenIcon }),
      h('span', { class: 'choice__face' }, icon))));

  const chosenColor = base.color ?? HABIT_COLORS[0];
  const colorGroup = h('div', { class: 'choices', role: 'radiogroup' },
    ...HABIT_COLORS.map((color, i) => h('label', { class: 'choice' },
      h('input', { class: 'choice__input', type: 'radio', name: 'color', value: color, checked: color === chosenColor }),
      h('span', { class: 'choice__face choice__face--color', dataset: { color }, title: nl.colors[i] },
        h('span', { class: 'visually-hidden' }, nl.colors[i])))));

  // --- herhaling --------------------------------------------------------------------------
  const details = h('div', { class: 'schedule-details' });
  const typeGroup = h('div', { class: 'segmented', role: 'radiogroup' },
    ...TYPES.map((type) => h('label', { class: 'segmented__item' },
      h('input', {
        class: 'choice__input', type: 'radio', name: 'scheduleType', value: type, checked: type === form.type,
        onchange: () => { form.type = type; renderDetails(); renderCounter(); },
      }),
      h('span', { class: 'segmented__face' }, nl.form.scheduleTypes[type]))));

  const numberInput = (inputId, value, max, onInput) =>
    h('input', {
      id: inputId, class: 'input input--number', type: 'number', inputmode: 'numeric', min: 1, max, value, 'aria-describedby': 'err-schedule',
      oninput: (e) => onInput(e.target.value),
    });

  function renderDetails() {
    if (form.type === 'weekdays') {
      fill(details, 
        h('p', { class: 'field__label' }, nl.form.weekdaysLabel),
        h('div', { class: 'choices' }, ...nl.weekdays.short.map((label, i) => h('label', { class: 'choice' },
          h('input', {
            class: 'choice__input', type: 'checkbox', value: String(i), checked: form.weekdays.has(i),
            onchange: (e) => (e.target.checked ? form.weekdays.add(i) : form.weekdays.delete(i)),
          }),
          h('span', { class: 'choice__face choice__face--text' }, label)))));
    } else if (form.type === 'per_week' || form.type === 'per_month') {
      const week = form.type === 'per_week';
      fill(details, 
        h('label', { class: 'field__label', for: 'count' }, week ? nl.form.countWeek : nl.form.countMonth),
        numberInput('count', week ? form.perWeek : form.perMonth, week ? 7 : 31, (v) => { form[week ? 'perWeek' : 'perMonth'] = v; }),
        h('p', { class: 'field__hint' }, nl.form.flexibleHint));
    } else if (form.type === 'day_of_month') {
      fill(details, 
        h('label', { class: 'field__label', for: 'day' }, nl.form.dayOfMonth),
        numberInput('day', form.day, 31, (v) => { form.day = v; }),
        h('p', { class: 'field__hint' }, nl.form.dayOfMonthHint));
    } else {
      fill(details);
    }
  }
  renderDetails();

  function buildSchedule() {
    switch (form.type) {
      case 'daily': return { type: 'weekdays', weekdays: [...ALL_WEEKDAYS] };
      case 'weekdays': return { type: 'weekdays', weekdays: [...form.weekdays].sort((a, b) => a - b) };
      case 'per_week': return { type: 'times_per_period', period: 'week', count: Number(form.perWeek) };
      case 'per_month': return { type: 'times_per_period', period: 'month', count: Number(form.perMonth) };
      default: return { type: 'day_of_month', day: Number(form.day) };
    }
  }

  // --- teller (alleen bij elke dag / vaste dagen) -----------------------------------------
  const counterBox = h('fieldset', { class: 'field' });
  const counterAllowed = () => form.type === 'daily' || form.type === 'weekdays';

  function renderCounter() {
    if (!counterAllowed()) {
      fill(counterBox, h('legend', { class: 'field__label' }, nl.form.counter), h('p', { class: 'field__hint' }, nl.form.counterOnlyDaily));
      return;
    }
    fill(counterBox,
      h('legend', { class: 'field__label' }, nl.form.counter),
      h('label', { class: 'switch' },
        h('input', { id: 'counterOn', type: 'checkbox', checked: form.counterOn, onchange: (e) => { form.counterOn = e.target.checked; renderCounter(); } }),
        h('span', null, nl.form.counterToggle)),
      form.counterOn
        ? h('div', { class: 'subfields' },
          h('p', { class: 'field__hint' }, nl.form.counterHint),
          h('label', { class: 'field__label', for: 'counterUnit' }, nl.form.counterUnit),
          h('input', { id: 'counterUnit', class: 'input', type: 'text', maxlength: COUNTER_UNIT_MAX + 10, value: form.unit, placeholder: nl.form.counterUnitPlaceholder, 'aria-describedby': 'err-counterUnit', oninput: (e) => { form.unit = e.target.value; } }),
          errorFor('counterUnit'),
          h('label', { class: 'field__label', for: 'counterTarget' }, nl.form.counterTarget),
          h('input', { id: 'counterTarget', class: 'input input--number', type: 'number', inputmode: 'numeric', min: 1, max: COUNTER_MAX, value: form.target, 'aria-describedby': 'err-counterTarget', oninput: (e) => { form.target = e.target.value; } }),
          errorFor('counterTarget'))
        : null,
      errorFor('counter'));
  }
  renderCounter();

  // --- overige velden ---------------------------------------------------------------------
  const daypart = h('select', { id: 'daypart', class: 'input', 'aria-describedby': 'err-daypart' },
    ...DAYPARTS.map((d) => h('option', { value: d, selected: d === (base.daypart ?? 'anytime') }, nl.dayparts[d])));
  const startDate = h('input', { id: 'startDate', class: 'input', type: 'date', value: existing?.startDate ?? today, disabled: started, 'aria-describedby': 'err-startDate hint-startDate' });
  const cue = h('input', { id: 'cue', class: 'input', type: 'text', maxlength: TEXT_MAX + 20, value: base.cue ?? '', placeholder: nl.form.cuePlaceholder, 'aria-describedby': 'err-cue' });
  const why = h('textarea', { id: 'why', class: 'input', rows: 2, maxlength: TEXT_MAX + 20, placeholder: nl.form.whyPlaceholder, 'aria-describedby': 'err-why' }, base.why ?? '');
  const minimal = h('input', { id: 'minimalVersion', class: 'input', type: 'text', maxlength: TEXT_MAX + 20, value: base.minimalVersion ?? '', placeholder: nl.form.minimalPlaceholder, 'aria-describedby': 'err-minimalVersion' });

  const formError = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const radio = (groupName) => root.querySelector(`input[name="${groupName}"]:checked`)?.value ?? '';

  // --- opslaan ----------------------------------------------------------------------------
  async function submit(event) {
    event.preventDefault();
    for (const el of [formError, ...Object.values(errorEls)]) el.hidden = true;

    const values = {
      name: name.value, icon: radio('icon'), color: radio('color'), daypart: daypart.value,
      startDate: started ? existing.startDate : startDate.value,
      cue: cue.value, why: why.value, minimalVersion: minimal.value, schedule: buildSchedule(),
      counter: counterAllowed() && form.counterOn
        ? { unit: form.unit, target: String(form.target).trim() === '' ? null : Number(form.target) }
        : null,
    };
    const sortOrder = Math.max(-1, ...(await repo.listHabits()).map((x) => x.sortOrder ?? 0)) + 1;
    try {
      await repo.saveHabit(applyHabitForm({ existing, values, today, sortOrder }));
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      showErrors(error.errors);
      return;
    }
    notifyChanged();
    showToast({ message: nl.app.saved });
    location.hash = '#/habits';
  }

  function showErrors(errors) {
    const focusTargets = { name, icon: iconGroup, color: colorGroup, daypart, startDate, schedule: typeGroup, cue, why, minimalVersion: minimal,
      counterUnit: counterBox.querySelector('#counterUnit'), counterTarget: counterBox.querySelector('#counterTarget'), counter: counterBox.querySelector('#counterOn') };
    let first = null;
    for (const { field: key, code, detail } of errors) {
      const message = nl.form.errors[key]?.[code] ?? detail ?? nl.app.loadError;
      const el = errorEls[key] ?? formError;
      el.textContent = message;
      el.hidden = false;
      first ??= focusTargets[key] ?? formError;
    }
    const focusable = first?.matches?.('input, select, textarea') ? first : first?.querySelector?.('input');
    (focusable ?? first)?.focus?.();
  }

  // --- acties voor een bestaande habit ----------------------------------------------------
  const act = (fn, message, { stay = true } = {}) => async () => {
    await fn();
    notifyChanged();
    showToast({ message });
    if (stay) await mount(root, id);
    else location.hash = '#/habits';
  };

  const extra = existing
    ? h('section', { class: 'section' },
      h('h2', { class: 'section__title' }, nl.form.more),
      h('div', { class: 'stack' },
        existing.status === 'archived'
          ? h('button', { type: 'button', class: 'button button--secondary', onclick: act(() => unarchiveHabit(repo, existing, today), nl.form.toasts.unarchived) }, nl.form.unarchive)
          : [
            openPause
              ? h('button', { type: 'button', class: 'button button--secondary', onclick: act(() => resumeHabit(repo, existing.id, today), nl.form.toasts.resumed) }, nl.form.resume)
              : h('button', { type: 'button', class: 'button button--secondary', onclick: act(() => pauseHabit(repo, existing.id, today), nl.form.toasts.paused) }, nl.form.pause),
            h('button', { type: 'button', class: 'button button--secondary', onclick: act(() => archiveHabit(repo, existing, today), nl.form.toasts.archived, { stay: false }) }, nl.form.archive),
          ],
        h('button', {
          type: 'button',
          class: 'button button--danger',
          onclick: () => openDialog({
            title: nl.form.deleteHabit,
            description: nl.form.confirmDelete(existing.name),
            actions: [{ label: nl.app.delete, variant: 'danger', onClick: act(() => repo.deleteHabit(existing.id), nl.form.toasts.deleted, { stay: false }) }],
          }),
        }, nl.form.deleteHabit)))
    : null;

  fill(root, 
    h('a', { class: 'back-link', href: '#/habits' }, `‹ ${nl.habits.title}`),
    h('h1', { class: 'page-title' }, existing ? nl.form.titleEdit : nl.form.titleNew),
    h('form', { class: 'form', novalidate: true, onsubmit: submit },
      existing ? null : h('div', { class: 'templates' },
        h('p', { class: 'field__label' }, nl.form.templates),
        h('div', { class: 'choices' }, ...Object.entries(TEMPLATES).map(([key, template]) =>
          h('a', { class: 'chip-link', href: `#/habits/new?template=${key}`, 'aria-current': key === templateKey ? 'true' : null }, `${template.icon} ${template.name}`)))),
      field(nl.form.name, name, { id: 'name', errorField: 'name' }),
      field(nl.form.icon, iconGroup, { group: true, errorField: 'icon' }),
      field(nl.form.color, colorGroup, { group: true, errorField: 'color' }),
      h('fieldset', { class: 'field' },
        h('legend', { class: 'field__label' }, nl.form.schedule),
        typeGroup, details,
        started ? h('p', { class: 'field__hint' }, nl.form.changeHint) : null,
        errorFor('schedule')),
      counterBox,
      field(nl.form.daypart, daypart, { id: 'daypart', errorField: 'daypart' }),
      field(nl.form.startDate, startDate, { id: 'startDate', errorField: 'startDate', hint: started ? nl.form.startDateLocked : null }),
      field(nl.form.cue, cue, { id: 'cue', errorField: 'cue' }),
      field(nl.form.why, why, { id: 'why', errorField: 'why' }),
      field(nl.form.minimal, minimal, { id: 'minimalVersion', errorField: 'minimalVersion' }),
      formError,
      h('div', { class: 'form__actions' },
        h('button', { type: 'submit', class: 'button button--primary' }, nl.form.submit),
        h('a', { class: 'button button--ghost', href: '#/habits' }, nl.app.cancel))),
    extra);
}
