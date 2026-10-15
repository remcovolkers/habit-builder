import { h } from '../dom.js';
import { saveSettings, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { ValidationError } from '../../data/repository.js';
import { MAX_DAY_START_HOUR } from '../../domain/constants.js';
import { nl } from '../../content/nl.js';

function timeZones() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes(state.settings.timezone) ? zones : [state.settings.timezone, ...zones];
}

export function settingsView() {
  const { settings, repo } = state;
  const errorEl = (id) => h('p', { id, class: 'field__error', role: 'alert', hidden: true });
  const tzError = errorEl('err-timezone');
  const hourError = errorEl('err-dayStartHour');

  const tz = h('select', { id: 'timezone', class: 'input', 'aria-describedby': 'err-timezone' },
    ...timeZones().map((zone) => h('option', { value: zone, selected: zone === settings.timezone }, zone)));
  const hour = h('select', { id: 'dayStartHour', class: 'input', 'aria-describedby': 'hint-day err-dayStartHour' },
    ...Array.from({ length: MAX_DAY_START_HOUR + 1 }, (_, i) =>
      h('option', { value: String(i), selected: i === settings.dayStartHour }, nl.settings.dayStartOption(i))));

  async function submit(event) {
    event.preventDefault();
    for (const el of [tzError, hourError]) el.hidden = true;
    try {
      await saveSettings({ timezone: tz.value, dayStartHour: Number(hour.value) });
      showToast({ message: nl.app.saved });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      for (const { field, code } of error.errors) {
        const el = field === 'timezone' ? tzError : hourError;
        el.textContent = nl.settings.errors[field][code];
        el.hidden = false;
      }
    }
  }

  return h('div', null,
    h('h1', { class: 'page-title' }, nl.settings.title),
    h('form', { class: 'form', novalidate: true, onsubmit: submit },
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'timezone' }, nl.settings.timezone), tz, tzError),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'dayStartHour' }, nl.settings.dayStart), hour,
        h('p', { id: 'hint-day', class: 'field__hint' }, nl.settings.dayStartHint), hourError),
      h('button', { type: 'submit', class: 'button button--primary' }, nl.settings.save)),
    h('dl', { class: 'facts' },
      h('dt', null, nl.settings.storage),
      h('dd', null, repo.storeKind === 'memory' ? nl.settings.storageMemory : nl.settings.storageLocal)));
}
