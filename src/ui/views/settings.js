import { h } from '../dom.js';
import { reloadSettings, saveSettings, state } from '../state.js';
import { openDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { ValidationError } from '../../data/repository.js';
import { DISPLAY_NAME_MAX } from '../../app/settings.js';
import { buildExport, parseImport } from '../../app/backup.js';
import { MAX_DAY_START_HOUR } from '../../domain/constants.js';
import { nl } from '../../content/nl.js';

function timeZones() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes(state.settings.timezone) ? zones : [state.settings.timezone, ...zones];
}

/** Back-up maken en terugzetten: je vangnet, want alles staat alleen op dit apparaat. */
function backupSection() {
  const b = nl.backup;
  const message = h('p', { class: 'field__hint', role: 'status', 'aria-live': 'polite' });
  const say = (text, isError = false) => {
    message.textContent = text;
    message.className = isError ? 'field__error' : 'field__hint';
  };

  async function download() {
    const snapshot = await state.repo.snapshot();
    const json = JSON.stringify(buildExport(snapshot), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = h('a', { href: url, download: `habit-builder-backup-${state.today}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    say(b.exported);
  }

  async function chosen(event) {
    const input = event.target;
    const [file] = input.files;
    input.value = ''; // hetzelfde bestand opnieuw kiezen moet kunnen
    if (!file) return;
    const parsed = parseImport(await file.text());
    if (!parsed.ok) {
      say(b.errors[parsed.error], true);
      return;
    }
    say('');
    openDialog({
      title: b.confirmTitle,
      description: b.confirmText(parsed.data.habits.length, parsed.data.checkIns.length),
      actions: [{
        label: b.confirm,
        variant: 'danger',
        onClick: async () => {
          await state.repo.replaceAll(parsed.data);
          await reloadSettings();
          showToast({ message: parsed.warnings.length > 0 ? `${b.done}. ${b.warnings(parsed.warnings.length)}` : b.done });
        },
      }],
    });
  }

  const fileInput = h('input', { id: 'importFile', class: 'visually-hidden', type: 'file', accept: 'application/json,.json', onchange: chosen, tabindex: -1 });
  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, b.title),
    h('p', { class: 'section__hint' }, b.hint),
    h('div', { class: 'stack' },
      h('button', { type: 'button', id: 'exportBackup', class: 'button button--secondary button--block', onclick: download }, b.export),
      h('button', { type: 'button', id: 'importBackup', class: 'button button--secondary button--block', onclick: () => fileInput.click() }, b.import),
      fileInput,
      message));
}

export function settingsView() {
  const { settings, repo } = state;
  const errorEl = (id) => h('p', { id, class: 'field__error', role: 'alert', hidden: true });
  const errorEls = { displayName: errorEl('err-displayName'), timezone: errorEl('err-timezone'), dayStartHour: errorEl('err-dayStartHour') };

  const displayName = h('input', {
    id: 'displayName', class: 'input', type: 'text', maxlength: DISPLAY_NAME_MAX + 10, autocomplete: 'given-name',
    value: settings.displayName ?? '', 'aria-describedby': 'hint-name err-displayName',
  });
  const tz = h('select', { id: 'timezone', class: 'input', 'aria-describedby': 'err-timezone' },
    ...timeZones().map((zone) => h('option', { value: zone, selected: zone === settings.timezone }, zone)));
  const hour = h('select', { id: 'dayStartHour', class: 'input', 'aria-describedby': 'hint-day err-dayStartHour' },
    ...Array.from({ length: MAX_DAY_START_HOUR + 1 }, (_, i) =>
      h('option', { value: String(i), selected: i === settings.dayStartHour }, nl.settings.dayStartOption(i))));

  async function submit(event) {
    event.preventDefault();
    for (const el of Object.values(errorEls)) el.hidden = true;
    try {
      await saveSettings({ displayName: displayName.value.trim(), timezone: tz.value, dayStartHour: Number(hour.value) });
      showToast({ message: nl.app.saved });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      for (const { field, code } of error.errors) {
        const el = errorEls[field];
        el.textContent = nl.settings.errors[field][code];
        el.hidden = false;
      }
    }
  }

  return h('div', null,
    h('h1', { class: 'page-title' }, nl.settings.title),
    h('form', { class: 'form', novalidate: true, onsubmit: submit },
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'displayName' }, nl.settings.displayName), displayName,
        h('p', { id: 'hint-name', class: 'field__hint' }, nl.settings.displayNameHint), errorEls.displayName),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'timezone' }, nl.settings.timezone), tz, errorEls.timezone),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'dayStartHour' }, nl.settings.dayStart), hour,
        h('p', { id: 'hint-day', class: 'field__hint' }, nl.settings.dayStartHint), errorEls.dayStartHour),
      h('button', { type: 'submit', class: 'button button--primary button--block' }, nl.settings.save)),
    backupSection(),
    h('dl', { class: 'facts' },
      h('dt', null, nl.settings.storage),
      h('dd', null, repo.storeKind === 'memory' ? nl.settings.storageMemory : nl.settings.storageLocal)));
}
