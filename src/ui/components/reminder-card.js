import { fill, h } from '../dom.js';
import { showToast } from './toast.js';
import { disableReminder, enableReminder, onRemindersChanged, reminders, setReminderTime, testReminder } from '../reminders.js';
import { state } from '../state.js';
import { nl } from '../../content/nl.js';

/**
 * "Ochtendherinnering" voor Instellingen. Verborgen zolang de server niet is ingericht (geen VAPID-sleutel in de config);
 * daarna per toestand: uitgelegd waarom het niet kan, of aan/uit met tijdstip en een testknop.
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

  function timeField(input) {
    return h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'reminderTime' }, r.time),
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
      const key = status === 'signed-out' ? 'signedOut' : status;
      fill(root, ...heading, h('p', { class: 'field__hint', id: 'reminderUnavailable' }, r.unavailable[key]));
      return;
    }

    const input = h('input', {
      id: 'reminderTime', class: 'input', type: 'time', value: reminders.time, required: true, disabled: busy,
      'aria-describedby': 'reminderMessage',
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
        timeField(input),
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
            type: 'button', id: 'disableReminder', class: 'button button--ghost button--block', disabled: busy,
            onclick: () => guarded(async () => {
              await disableReminder();
              say('');
              showToast({ message: r.disabled });
            }),
          }, r.disable),
          message));
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
              const result = await enableReminder(time);
              if (result.ok) showToast({ message: r.enabled });
              else if (result.reason === 'invalid' || result.reason === 'before_day_start') say(timeError(result.reason), true);
              else say(r.errors[result.reason] ?? r.errors.failed, true);
            });
          },
        }, r.enable),
        message),
      h('p', { class: 'field__hint' }, r.privacy));
  }

  const stop = onRemindersChanged(() => (root.isConnected ? render() : stop()));
  render();
  return root;
}
