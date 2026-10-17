import { fill, h } from '../dom.js';
import { reloadSettings, saveSettings, state } from '../state.js';
import { openDialog } from '../components/dialog.js';
import { accountCard } from '../components/account-card.js';
import { account, onAccountChanged } from '../account.js';
import * as auth from '../../data/auth.js';
import { fetchDevUsage } from '../../data/dev-usage.js';
import { installCard } from '../components/install-card.js';
import { reminderCard } from '../components/reminder-card.js';
import { THEMES, THEME_IDS, themeFor } from '../../app/themes.js';
import { downloadBackup } from '../download.js';
import { showToast } from '../components/toast.js';
import { ValidationError } from '../../data/repository.js';
import { parseImport } from '../../app/backup.js';
import { MAX_DAY_START_HOUR } from '../../domain/constants.js';
import { nl } from '../../content/nl.js';
import { config } from '../../config.js';
import { createTapCounter, isDev, onDevChanged, setDev } from '../dev.js';

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
    await downloadBackup(state.repo, state.today);
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

/** Kies het thema: twee kaarten met kleurstalen. De keuze geldt direct en synchroniseert mee naar andere apparaten. */
function themeSection() {
  const current = themeFor(state.settings.theme).id;
  // het thema reist alleen mee naar andere apparaten als je bent ingelogd; de tekst volgt de inlogstatus
  const hintText = () => (account.status === 'anonymous' ? nl.settings.theme.hintLocal : nl.settings.theme.hint);
  const hint = h('p', { class: 'section__hint', id: 'themeHint' }, hintText());
  const stop = onAccountChanged(() => (hint.isConnected ? (hint.textContent = hintText()) : stop()));
  return h('fieldset', { class: 'section themes' },
    h('legend', { class: 'section__title' }, nl.settings.theme.title),
    hint,
    h('div', { class: 'theme-options', role: 'radiogroup' },
      ...THEME_IDS.map((id) => {
        const theme = THEMES[id];
        const swatches = theme.swatches.map((color) => {
          const dot = h('i', { class: 'theme-option__swatch' });
          dot.style.background = color;
          return dot;
        });
        return h('label', { class: 'theme-option', dataset: { theme: id } },
          h('input', {
            class: 'choice__input', type: 'radio', name: 'theme', value: id, checked: id === current,
            onchange: () => saveSettings({ theme: id }),
          }),
          h('span', { class: 'theme-option__face' },
            h('span', { class: 'theme-option__swatches' }, ...swatches),
            h('span', { class: 'theme-option__name' }, theme.name),
            h('span', { class: 'theme-option__desc' }, theme.description)));
      })));
}

/** Links naar de privacyverklaring en voorwaarden (staan op GitHub, in de repository van de app). */
function legalSection() {
  const l = nl.settings.legal;
  const link = (file, label) => h('a', { class: 'button button--ghost button--block', href: `${nl.login.legalBase}/${file}`, target: '_blank', rel: 'noopener noreferrer' }, label);
  return h('section', { class: 'section legal' },
    h('h2', { class: 'section__title' }, l.title),
    h('p', { class: 'section__hint' }, l.hint),
    h('div', { class: 'stack' }, link('PRIVACY.md', l.privacy), link('VOORWAARDEN.md', l.terms)));
}

/**
 * Eén regel met hoeveel mensen buiten jou de app gebruiken (alleen als je bent ingelogd en de server je als beheerder kent; anders blijft de
 * regel weg). Het antwoord wordt één keer opgehaald per keer dat de ontwikkelaarsopties getoond worden.
 */
function devUsageLine() {
  const line = h('p', { class: 'field__hint', id: 'devUsage', role: 'status', hidden: true });
  let asked = false;
  const load = () => {
    if (asked || account.status !== 'signed-in') return;
    asked = true;
    fetchDevUsage(() => auth.getClient()).then((usage) => {
      if (!usage) return;
      line.textContent = nl.settings.dev.usage(usage.users, usage.activeToday);
      line.hidden = false;
    });
  };
  load();
  const stop = onAccountChanged(() => (line.isConnected ? load() : stop()));
  return line;
}

/**
 * De versieregel onderaan. Zeven keer tikken zet de ontwikkelaarsopties aan of uit (zoals op Android); anderen zien alleen een versienummer.
 */
function versionLine() {
  const tap = createTapCounter();
  const hint = h('p', { class: 'field__hint version__hint', role: 'status', 'aria-live': 'polite' });
  const dev = h('div', { class: 'version__dev' });
  const renderDev = () => {
    fill(dev, isDev()
      ? h('div', { class: 'stack' },
        h('p', { class: 'field__hint', id: 'devOn' }, nl.settings.dev.on),
        devUsageLine(),
        h('button', { type: 'button', id: 'devOff', class: 'button button--ghost button--block', onclick: () => { setDev(false); showToast({ message: nl.settings.dev.off }); } }, nl.settings.dev.turnOff))
      : null);
  };
  renderDev();
  const stop = onDevChanged(() => (dev.isConnected ? renderDev() : stop()));
  return h('section', { class: 'section version' },
    h('button', {
      type: 'button', id: 'versionLine', class: 'version__button',
      onclick: () => {
        const result = tap();
        if (result.toggled) {
          hint.textContent = '';
          showToast({ message: isDev() ? nl.settings.dev.on : nl.settings.dev.off });
        } else {
          hint.textContent = result.left === null ? '' : nl.settings.dev.tapsLeft(result.left);
        }
      },
    }, nl.settings.dev.version(config.appVersion, config.environment)),
    hint,
    dev);
}

export function settingsView() {
  const { settings } = state;
  const errorEl = (id) => h('p', { id, class: 'field__error', role: 'alert', hidden: true });
  const errorEls = { timezone: errorEl('err-timezone'), dayStartHour: errorEl('err-dayStartHour') };

  const tz = h('select', { id: 'timezone', class: 'input', 'aria-describedby': 'err-timezone' },
    ...timeZones().map((zone) => h('option', { value: zone, selected: zone === settings.timezone }, zone)));
  const hour = h('select', { id: 'dayStartHour', class: 'input', 'aria-describedby': 'hint-day err-dayStartHour' },
    ...Array.from({ length: MAX_DAY_START_HOUR + 1 }, (_, i) =>
      h('option', { value: String(i), selected: i === settings.dayStartHour }, nl.settings.dayStartOption(i))));

  async function submit(event) {
    event.preventDefault();
    for (const el of Object.values(errorEls)) el.hidden = true;
    try {
      await saveSettings({ timezone: tz.value, dayStartHour: Number(hour.value) });
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
    h('div', { class: 'settings__columns' },
     h('div', { class: 'settings__col' },
      accountCard(),
      installCard(),
      reminderCard(),
      themeSection()),
     h('div', { class: 'settings__col' },
    h('form', { class: 'form', novalidate: true, onsubmit: submit },
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'timezone' }, nl.settings.timezone), tz, errorEls.timezone),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'dayStartHour' }, nl.settings.dayStart), hour,
        h('p', { id: 'hint-day', class: 'field__hint' }, nl.settings.dayStartHint), errorEls.dayStartHour),
      h('button', { type: 'submit', class: 'button button--primary button--block' }, nl.settings.save)),
    backupSection(),
    legalSection(),
    versionLine())));
}
