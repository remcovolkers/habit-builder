import { fill, h } from '../dom.js';
import { notifyChanged, reloadSettings, saveSettings, state } from '../state.js';
import { openDialog } from '../components/dialog.js';
import { accountCard } from '../components/account-card.js';
import { account, onAccountChanged } from '../account.js';
import * as auth from '../../data/auth.js';
import { fetchDevUsage } from '../../data/dev-usage.js';
import { installCard } from '../components/install-card.js';
import { reminderCard } from '../components/reminder-card.js';
import { onRemindersChanged, reminders } from '../reminders.js';
import { onPwaChanged, pwa } from '../../pwa.js';
import { agendaConnectCard } from '../components/agenda-connect.js';
import { themeFor } from '../../app/themes.js';
import { themeOptions } from '../components/theme-picker.js';
import { downloadBackup } from '../download.js';
import { showToast } from '../components/toast.js';
import { ValidationError } from '../../data/repository.js';
import { parseImport } from '../../app/backup.js';
import { recalibrateAchievements } from '../../app/achievement-runner.js';
import { MAX_DAY_START_HOUR } from '../../domain/constants.js';
import { nl } from '../../content/nl.js';
import { config } from '../../config.js';
import { createTapCounter, isDev, onDevChanged, setDev } from '../dev.js';
import { openFeedbackSheet } from '../components/feedback-sheet.js';
import { icon } from '../svg.js';
import { isNativeApp } from '../../native.js';
import { timezoneLabel } from '../../app/timezone.js';
import { checkAppUpdate, downloadAppUpdate, pretendAppUpdate } from '../app-update.js';

function timeZones() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes(state.settings.timezone) ? zones : [state.settings.timezone, ...zones];
}

/** Back-up maken en terugzetten: je vangnet. Ingeklapt, want de meeste mensen hebben dit zelden nodig. */
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
  // met een account staat alles ook op de server; zonder alleen op dit apparaat
  const hintText = () => (account.status === 'signed-in' ? b.hintSynced : b.hint);
  const hint = h('p', { class: 'section__hint', id: 'backupHint' }, hintText());
  const stop = onAccountChanged(() => (hint.isConnected ? (hint.textContent = hintText()) : stop()));
  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, b.title),
    hint,
    h('details', { class: 'fold', id: 'backupDetails', open: true },
      h('summary', null, b.summary),
      h('div', { class: 'stack' },
        h('button', { type: 'button', id: 'exportBackup', class: 'button button--secondary button--block', onclick: download }, b.export),
        h('button', { type: 'button', id: 'importBackup', class: 'button button--secondary button--block', onclick: () => fileInput.click() }, b.import),
        fileInput,
        message)));
}

/** Prestaties herijken: de mijlpalen per habit toetsen aan de regels van nu. Ingeklapt, want het is zelden nodig. */
function achievementsSection() {
  const a = nl.achievements.recalibrate;
  const run = () => openDialog({
    title: a.confirmTitle,
    description: a.confirmText,
    actions: [{
      label: a.confirm,
      onClick: async () => {
        const revoked = await recalibrateAchievements(state.repo, state.today);
        notifyChanged();
        showToast({ message: a.done(revoked.length) });
      },
    }],
  });
  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, a.title),
    h('p', { class: 'section__hint' }, a.hint),
    h('button', { type: 'button', id: 'recalibrateAchievements', class: 'button button--secondary button--block', onclick: run }, a.button));
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
    themeOptions({ current, onPick: (id) => saveSettings({ theme: id }) }));
}

/** Zo werkt het: de naslag bij de app (docs/ONBOARDING.md O1). */
/** Feedback geven (docs/FEEDBACK.md): op de telefoon staat het hier, op de computer ook in de zijbalk. Het blad opent boven Instellingen. */
function feedbackSection() {
  const f = nl.feedback;
  const button = h('button', { type: 'button', id: 'feedbackOpen', class: 'button button--secondary button--block', 'aria-haspopup': 'dialog', onclick: () => openFeedbackSheet({ opener: button }) },
    icon('feedback'), f.title);
  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, f.settingsTitle),
    h('p', { class: 'section__hint' }, f.settingsHint),
    button);
}

function guideSection() {
  const g = nl.guide;
  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, g.settingsTitle),
    h('p', { class: 'section__hint' }, g.settingsHint),
    h('a', { class: 'button button--secondary button--block', id: 'guideLink', href: '#/uitleg' }, g.settingsLink));
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

/** Alleen in de app, met ontwikkelaarsopties: de updatebalk laten zien, en de terugkeer van Google nabootsen. (De updatecontrole zelf staat voor iedereen onder Over Habit Builder.) */
function appUpdateTools() {
  const t = nl.settings.dev;
  return h('div', { class: 'stack' },
    h('button', { type: 'button', id: 'appUpdatePretend', class: 'button button--ghost button--block', onclick: pretendAppUpdate }, t.appUpdatePretend),
    h('button', { type: 'button', id: 'googleReturnTest', class: 'button button--ghost button--block', onclick: () => location.assign(`${auth.NATIVE_REDIRECT}?error=access_denied`) }, t.googleReturnTest));
}

/** Alleen in de Android-app: nu controleren of er een nieuwe versie klaarstaat (de webversie werkt zichzelf bij). */
function updateSection() {
  const u = nl.settings.update;
  const result = h('p', { class: 'field__hint', id: 'appUpdateResult', role: 'status', 'aria-live': 'polite' });
  const download = h('button', { type: 'button', id: 'appUpdateDownload', class: 'button button--primary button--block', hidden: true, onclick: downloadAppUpdate }, u.download);
  const check = h('button', {
    type: 'button', id: 'appUpdateCheck', class: 'button button--secondary button--block',
    onclick: async () => {
      check.disabled = true;
      download.hidden = true;
      result.className = 'field__hint';
      result.textContent = u.checking;
      const outcome = await checkAppUpdate({ force: true });
      check.disabled = false;
      if (outcome.status === 'available') {
        result.textContent = u.available(outcome.version, outcome.current);
        download.hidden = false;
      } else if (outcome.status === 'current') {
        result.textContent = u.current(outcome.current);
      } else {
        result.textContent = u.failed;
        result.className = 'field__error';
      }
    },
  }, u.check);
  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, u.title),
    h('p', { class: 'section__hint' }, u.hint),
    h('div', { class: 'stack' }, check, download, result));
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
        isNativeApp() ? appUpdateTools() : null,
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

/** Jouw dag: de tijdzone volgt het toestel (de lange lijst is er alleen voor wie hem echt wil wijzigen) en wanneer een nieuwe dag begint. Wijzigingen gelden direct. */
function daySection() {
  const { settings } = state;
  const errorEl = (id) => h('p', { id, class: 'field__error', role: 'alert', hidden: true });
  const errorEls = { timezone: errorEl('err-timezone'), dayStartHour: errorEl('err-dayStartHour') };
  const tz = h('select', { id: 'timezone', class: 'input', 'aria-describedby': 'err-timezone' },
    ...timeZones().map((zone) => h('option', { value: zone, selected: zone === settings.timezone }, zone)));
  const hour = h('select', { id: 'dayStartHour', class: 'input', 'aria-describedby': 'hint-day err-dayStartHour' },
    ...Array.from({ length: MAX_DAY_START_HOUR + 1 }, (_, i) =>
      h('option', { value: String(i), selected: i === settings.dayStartHour }, nl.settings.dayStartOption(i))));

  async function apply() {
    for (const el of Object.values(errorEls)) el.hidden = true;
    try {
      await saveSettings({ timezone: tz.value, dayStartHour: Number(hour.value) });
      tzLine.textContent = nl.settings.timezoneIs(timezoneLabel(state.settings.timezone));
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
  tz.addEventListener('change', apply);
  hour.addEventListener('change', apply);

  const tzLine = h('p', { id: 'timezoneLine', class: 'field__label' }, nl.settings.timezoneIs(timezoneLabel(settings.timezone)));
  const tzField = h('div', { class: 'field', id: 'timezoneField', hidden: true },
    h('label', { class: 'field__label', for: 'timezone' }, nl.settings.timezone), tz, errorEls.timezone);
  const tzChange = h('button', { type: 'button', id: 'timezoneChange', class: 'button button--ghost button--small', onclick: () => { tzField.hidden = false; tzChange.hidden = true; tz.focus(); } }, nl.settings.timezoneChange);

  return h('section', { class: 'section' },
    h('h2', { class: 'section__title' }, nl.settings.dayTitle),
    h('div', { class: 'field' },
      tzLine,
      h('p', { class: 'field__hint' }, nl.settings.timezoneFromDevice),
      tzChange,
      tzField),
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'dayStartHour' }, nl.settings.dayStart), hour,
      h('p', { id: 'hint-day', class: 'field__hint' }, nl.settings.dayStartHint), errorEls.dayStartHour));
}

// --- het overzicht en de pagina's ---------------------------------------------------------------------------------------------------------
// Instellingen is een overzicht van gegroepeerde rijen; elke rij opent een eigen pagina (#/settings/<id>). Op een telefoon vervangt de pagina het
// overzicht (met "‹ Instellingen" om terug te gaan); vanaf 960 px staan het overzicht en de gekozen pagina naast elkaar. Alles past direct toe.

const hubText = nl.settings.hub;

/** De rijen, per groep. `build`: de inhoud van de pagina; `href`: een rij die naar een andere pagina gaat; `action`: een rij die een blad opent. */
function settingsGroups() {
  return [
    { id: 'you', items: [
      { id: 'account', icon: 'user', build: () => [accountCard()], listen: onAccountChanged,
        value: () => (account.status === 'signed-in' ? (state.settings.displayName || account.user?.email || null) : account.status === 'restoring' ? null : hubText.values.signedOut) },
      { id: 'notifications', icon: 'bell', build: () => [reminderCard()], listen: onRemindersChanged,
        visible: () => reminders.status !== 'unconfigured',
        value: () => (reminders.status === 'on' ? hubText.values.notificationsOn(reminders.time) : hubText.values.notificationsOff) },
    ] },
    { id: 'app', items: [
      { id: 'appearance', icon: 'palette', build: () => [themeSection()], value: () => themeFor(state.settings.theme).name },
      { id: 'day', icon: 'clock', build: () => [daySection()], value: () => hubText.values.day(state.settings.dayStartHour, timezoneLabel(state.settings.timezone)) },
      { id: 'agenda', icon: 'calendar', build: () => [agendaConnectCard()] },
      { id: 'install', icon: 'install', build: () => [installCard()], listen: onPwaChanged, visible: () => !pwa.installed && (pwa.canInstall || pwa.ios) },
    ] },
    { id: 'data', items: [
      { id: 'data', icon: 'archive', build: () => [backupSection(), achievementsSection()] },
    ] },
    { id: 'help', items: [
      { id: 'guide', icon: 'help', href: '#/uitleg' },
      { id: 'feedback', icon: 'feedback', action: (button) => openFeedbackSheet({ opener: button }) },
      { id: 'legal', icon: 'shield', build: () => [legalSection()] },
      { id: 'about', icon: 'info', build: () => [isNativeApp() ? updateSection() : null, versionLine()], value: () => hubText.values.about(config.appVersion) },
    ] },
  ];
}

/** Eén rij van het overzicht: icoon, titel, de huidige waarde (blijft bijgewerkt) en een pijltje. */
function settingsRow(item, { current }) {
  const title = hubText.sections[item.id];
  const value = h('span', { class: 'settings-row__value' });
  const showValue = () => {
    const text = item.value?.() ?? null;
    value.textContent = text ?? '';
    value.hidden = text === null || text === '';
  };
  const content = [
    h('span', { class: 'settings-row__icon' }, icon(item.icon)),
    h('span', { class: 'settings-row__text' }, h('span', { class: 'settings-row__title' }, title), value),
    h('span', { class: 'settings-row__chevron' }, icon('next')),
  ];
  const control = item.action
    ? h('button', { type: 'button', class: 'settings-row', id: `settingsRow-${item.id}`, 'aria-haspopup': 'dialog', onclick: () => item.action(control) }, ...content)
    : h('a', { class: 'settings-row', id: `settingsRow-${item.id}`, href: item.href ?? `#/settings/${item.id}`, 'aria-current': current ? 'page' : null }, ...content);
  const li = h('li', { class: 'settings-list__item' }, control);
  const refresh = () => {
    showValue();
    li.hidden = item.visible ? !item.visible() : false;
  };
  refresh();
  if (item.listen) {
    const stop = item.listen(() => (li.isConnected ? refresh() : stop()));
  }
  return li;
}

/** De pagina van één onderdeel: een terugknop (alleen op de telefoon), de titel en de inhoud. */
function settingsDetail(item) {
  const title = hubText.sections[item.id];
  const nodes = item.build().filter(Boolean);
  // heet het eerste blok op de pagina hetzelfde als de pagina zelf, dan is die tweede kop dubbel: visueel verbergen, voor schermlezers blijft hij staan
  const first = nodes[0]?.querySelector?.('.section__title');
  if (first && first.textContent.trim() === title) first.classList.add('visually-hidden');
  return h('div', { class: 'settings__detail', id: `settings-${item.id}` },
    h('div', { class: 'page-header' },
      h('a', { class: 'back-link settings__back', href: '#/settings' }, `‹ ${hubText.back}`),
      h('h2', { class: 'page-title settings__detail-title' }, title)),
    ...nodes);
}

export function settingsView({ section = null } = {}) {
  const groups = settingsGroups();
  const items = groups.flatMap((group) => group.items);
  const chosen = items.find((item) => item.id === section && item.build) ?? null;
  // op een breed scherm staat er altijd een pagina naast het overzicht: zonder keuze de eerste
  const shown = chosen ?? items.find((item) => item.build);
  return h('div', { class: `settings${chosen ? ' settings--detail' : ''}` },
    h('div', { class: 'settings__layout' },
      h('nav', { class: 'settings__nav', 'aria-label': nl.settings.title },
        h('h1', { class: 'page-title' }, nl.settings.title),
        ...groups.map((group) => h('section', { class: 'settings-group', 'aria-labelledby': `settings-group-${group.id}` },
          h('h2', { class: 'kicker settings-group__title', id: `settings-group-${group.id}` }, hubText.groups[group.id]),
          h('ul', { class: 'settings-list' }, ...group.items.map((item) => settingsRow(item, { current: item === shown }))))),
      ),
      settingsDetail(shown)));
}
