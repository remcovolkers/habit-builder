import { fill, h } from '../dom.js';
import { showToast } from './toast.js';
import { disableReminder, enableReminder, onRemindersChanged, readPushLog, reminders, setReminderTime, testReminder } from '../reminders.js';
import { state } from '../state.js';
import { openDialog } from './dialog.js';
import { timePicker } from './time-picker.js';
import { pwa } from '../../pwa.js';
import { isDev, onDevChanged } from '../dev.js';
import { isAndroid } from '../../app/reminder.js';
import { isNativeApp } from '../../native.js';
import { nl } from '../../content/nl.js';

/**
 * "Ochtendherinnering" voor Instellingen. Verborgen zolang de server niet is ingericht (geen VAPID-sleutel in de config; in de Android-app
 * is die niet nodig); daarna per toestand: uitgelegd waarom het niet kan, of aan/uit met tijdstip en een testknop.
 */
export function reminderCard() {
  const r = nl.reminder;
  const root = h('section', { class: 'section reminder-card' });
  let busy = false;

  const message = h('p', { class: 'field__hint', role: 'status', 'aria-live': 'polite' });
  const say = (text, isError = false) => {
    message.textContent = text;
    message.className = isError ? 'field__error' : 'field__hint';
  };

  const timeError = (code) => (typeof r.timeErrors[code] === 'function' ? r.timeErrors[code](state.settings.dayStartHour) : r.timeErrors[code]);

  async function guarded(action) {
    if (busy) return;
    busy = true;
    render();
    try {
      await action();
    } finally {
      busy = false;
      render();
    }
  }

  const pushLog = h('p', { id: 'pushLog', class: 'field__hint' });
  const lateNote = h('p', { id: 'batteryLate', class: 'field__error', hidden: true });
  const onAndroid = isAndroid(globalThis.navigator?.userAgent);
  const inApp = isNativeApp(); // de Android-app: meldingen via Google in plaats van via Chrome

  /** Alleen in de app: wie de herinnering ook in Chrome aan heeft staan, krijgt twee meldingen. */
  const appNote = () => (inApp ? h('p', { class: 'field__hint', id: 'appNote' }, r.appNote) : null);

  /** De stappen om de batterij-instelling te openen; voor de app die je nu gebruikt, en bij een geïnstalleerde app ook voor Chrome. */
  const batterySteps = () => nl.reminder.battery.steps(inApp || pwa.installed ? 'Habit Builder' : 'Chrome', pwa.installed && !inApp);
  const batteryList = () => h('ol', { class: 'battery-steps' }, ...batterySteps().map((step) => h('li', null, step)));

  const BATTERY_TIP_KEY = 'hb-battery-tip-seen';
  const batteryTipSeen = () => { try { return localStorage.getItem(BATTERY_TIP_KEY) === '1'; } catch { return false; } };
  const markBatteryTipSeen = () => { try { localStorage.setItem(BATTERY_TIP_KEY, '1'); } catch { /* opslag geblokkeerd: dan krijg je hem vaker te zien */ } };

  /** Direct na het aanzetten, één keer: zonder dit wordt een melding op Android vaak pas bezorgd als je de app opent. */
  function showBatteryTip() {
    if (!onAndroid || batteryTipSeen()) return;
    markBatteryTipSeen();
    openDialog({
      title: nl.reminder.battery.title,
      description: nl.reminder.battery.intro,
      content: batteryList(),
      actions: [{ label: nl.reminder.battery.understood, variant: 'primary' }],
      cancelLabel: null,
    });
  }

  function batteryDetails(open) {
    if (!onAndroid) return null;
    return h('details', { class: 'reminder-card__battery', id: 'batteryTips', open },
      h('summary', null, nl.reminder.battery.summary),
      h('p', { class: 'field__hint' }, nl.reminder.battery.intro),
      batteryList(),
      lateNote);
  }

  /** Wanneer kwam de laatste melding aan, en hoeveel later dan verstuurd? */
  async function showPushLog() {
    lateNote.hidden = true;
    if (inApp) { // de service worker die dit bijhoudt ontvangt de meldingen van de app niet: Android toont ze zelf
      pushLog.hidden = true;
      return;
    }
    const log = await readPushLog();
    const clock = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!log) {
      pushLog.textContent = r.lastPush.none;
      return;
    }
    if (log.sent === null) {
      pushLog.textContent = r.lastPush.received(clock(log.received));
      return;
    }
    const seconds = Math.round((log.received - log.sent) / 1000);
    const lateText = seconds < 3600 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds / 3600)} uur`;
    if (seconds > 120) { // te laat: de uitleg gaat vanzelf open, want dit is bijna altijd de batterij-instelling
      lateNote.textContent = nl.reminder.battery.late(lateText);
      lateNote.hidden = false;
      lateNote.closest('details')?.setAttribute('open', '');
    }
    const late = seconds <= 60 ? r.lastPush.immediately : r.lastPush.late(lateText);
    pushLog.textContent = r.lastPush.detail(clock(log.sent), clock(log.received), late);
  }

  /** Testmeldingen en de logregel: alleen met ontwikkelaarsopties aan (zie dev.js). */
  function devTools() {
    if (!isDev()) return null;
    return h('div', { class: 'reminder-card__dev', id: 'devTools' },
      h('p', { class: 'kicker' }, r.devTitle),
      h('div', { class: 'stack' },
        h('button', {
          type: 'button', id: 'testReminder', class: 'button button--secondary button--block', disabled: busy,
          onclick: () => guarded(async () => {
            say('');
            const result = await testReminder();
            if (result.ok) say(r.testSent);
            else say(r.testFailed[result.reason] ?? r.testFailed.unknown, true);
          }),
        }, r.test),
        h('button', {
          type: 'button', id: 'testReminderDelayed', class: 'button button--ghost button--block', disabled: busy,
          onclick: () => guarded(async () => {
            say('');
            const result = await testReminder({ delaySeconds: 15 });
            if (result.ok) say(r.testDelayedSent);
            else say(r.testFailed[result.reason] ?? r.testFailed.unknown, true);
          }),
        }, r.testDelayed),
        pushLog));
  }

  function timeField(input) {
    return h('div', { class: 'field' },
      h('span', { class: 'field__label', id: 'reminderTimeLabel' }, r.time),
      input);
  }

  function render() {
    const { status } = reminders;
    root.hidden = status === 'unconfigured';
    if (root.hidden) {
      fill(root);
      return;
    }

    const heading = [h('h2', { class: 'section__title' }, r.title), h('p', { class: 'section__hint' }, r.hint)];
    if (status === 'unsupported' || status === 'signed-out' || status === 'denied') {
      const key = status === 'signed-out' ? 'signedOut' : status === 'denied' && inApp ? 'deniedApp' : status;
      fill(root, ...heading, h('p', { class: 'field__hint', id: 'reminderUnavailable' }, r.unavailable[key]));
      return;
    }

    // 24-uursnotatie, ongeacht de instelling van het toestel (zie time-picker.js)
    const input = timePicker({
      id: 'reminderTime', value: reminders.time, label: r.time, hourLabel: r.hour, minuteLabel: r.minute, disabled: busy, describedBy: 'reminderMessage',
    });
    message.id = 'reminderMessage';

    if (status === 'on') {
      input.addEventListener('change', () => guarded(async () => {
        const problem = await setReminderTime(input.value);
        if (problem) {
          input.value = reminders.time;
          say(timeError(problem), true);
        } else {
          say(r.timeSaved);
        }
      }));
      fill(root, ...heading,
        h('p', { class: 'field__hint', id: 'reminderStatus' }, r.status(reminders.time)),
        appNote(),
        timeField(input),
        h('div', { class: 'stack' },
          h('button', {
            type: 'button', id: 'disableReminder', class: 'button button--ghost button--block', disabled: busy,
            onclick: () => guarded(async () => {
              await disableReminder();
              say('');
              showToast({ message: r.disabled });
            }),
          }, r.disable),
          message),
        batteryDetails(false),
        devTools());
      showPushLog();
      return;
    }

    fill(root, ...heading,
      timeField(input),
      h('div', { class: 'stack' },
        h('button', {
          type: 'button', id: 'enableReminder', class: 'button button--primary button--block', disabled: busy,
          onclick: () => {
            const time = input.value;
            // de browser vraagt om toestemming en wil daarvoor een directe tik: deze aanroep gebeurt dus zonder omwegen
            guarded(async () => {
              say('');
              // met ontwikkelaarsopties aan: elke stap zichtbaar, zodat te zien is waar het vastloopt
              const result = await enableReminder(time, { onStep: (text) => { if (isDev()) say(text); } });
              if (result.ok) {
                showToast({ message: r.enabled });
                showBatteryTip();
              }
              else if (result.reason === 'invalid' || result.reason === 'before_day_start') say(timeError(result.reason), true);
              else if (result.detail && isDev()) say(r.failedDetail(result.detail), true);
              else say(r.errors[result.reason === 'denied' && inApp ? 'deniedApp' : result.reason] ?? r.errors.failed, true);
            });
          },
        }, busy ? r.enabling : r.enable),
        message),
      appNote(),
      h('p', { class: 'field__hint' }, inApp ? r.privacyApp : r.privacy));
  }

  const stop = onRemindersChanged(() => (root.isConnected ? render() : stop()));
  const stopDev = onDevChanged(() => (root.isConnected ? render() : stopDev()));
  render();
  return root;
}
