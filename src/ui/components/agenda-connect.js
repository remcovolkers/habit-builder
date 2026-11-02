import { fill, h } from '../dom.js';
import { showToast } from './toast.js';
import { agenda } from '../agenda.js';
import { account, onAccountChanged } from '../account.js';
import { state } from '../state.js';
import { deviceCalendarAvailable } from '../../data/device-calendar.js';
import { nl } from '../../content/nl.js';

const clock = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

/**
 * "Agenda" voor Instellingen (docs/AGENDA.md): afspraken uit je agenda op Vandaag. Twee manieren, los van elkaar te gebruiken:
 *   • het geheime iCal-adres van je Google Agenda (alleen met een account: de server haalt hem voor je op);
 *   • de agenda van de telefoon (alleen in de Android-app, zonder account en zonder server).
 */
export function agendaConnectCard() {
  const a = nl.agenda;
  const root = h('section', { class: 'section agenda-connect', id: 'agendaConnect' });
  let busy = false;

  // een melding per blok, onder de knop waar het over gaat
  const messageFor = (id) => {
    const el = h('p', { class: 'field__hint', id, role: 'status', 'aria-live': 'polite' });
    return {
      el,
      say: (text, isError = false) => {
        el.textContent = text;
        el.className = isError ? 'field__error' : 'field__hint';
      },
    };
  };
  const feedMessage = messageFor('agendaMessage');
  const deviceMessage = messageFor('agendaDeviceMessage');

  // het invoerveld blijft hetzelfde element, zodat een verversing op de achtergrond niet wegpakt wat je net plakte
  const input = h('input', {
    id: 'agendaUrl', class: 'input', type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: a.feed.placeholder, 'aria-describedby': 'agendaMessage',
  });

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

  const upcoming = () => agenda.model.feed.items.filter((item) => item.date >= state.today).length;

  function feedSection() {
    const { model } = agenda;
    const f = a.feed;
    const head = h('h3', { class: 'agenda-connect__title' }, f.title);

    if (model.feedUrl) {
      const fetchedAt = model.feed.fetchedAt;
      return h('div', { class: 'agenda-connect__block', id: 'agendaFeed' },
        head,
        h('p', { class: 'field__hint', id: 'agendaFeedStatus' }, f.status(upcoming()), ' ', fetchedAt ? f.updated(clock(fetchedAt)) : f.notYet),
        model.feedError ? h('p', { class: 'field__error', id: 'agendaFeedError', role: 'alert' }, f.errors[model.feedError] ?? f.errors.unknown) : null,
        h('div', { class: 'stack' },
          h('button', {
            type: 'button', id: 'agendaRefresh', class: 'button button--secondary button--block', disabled: busy || model.loading,
            onclick: () => guarded(() => agenda.refresh({ force: true })),
          }, busy || model.loading ? f.refreshing : f.refresh),
          h('button', {
            type: 'button', id: 'agendaDisconnect', class: 'button button--ghost button--block', disabled: busy,
            onclick: () => {
              agenda.disconnectFeed();
              input.value = '';
              feedMessage.say('');
              showToast({ message: f.disconnected });
            },
          }, f.disconnect)),
        h('p', { class: 'field__hint' }, f.privacy));
    }

    // zonder account kan de server de agenda niet voor je ophalen; tijdens het herstellen van de sessie laten we het veld weg in plaats van "log in" te zeggen
    if (account.status !== 'signed-in') {
      return h('div', { class: 'agenda-connect__block', id: 'agendaFeed' },
        head,
        account.status === 'anonymous' ? h('p', { class: 'field__hint', id: 'agendaSignedOut' }, f.signedOut) : null);
    }

    return h('div', { class: 'agenda-connect__block', id: 'agendaFeed' },
      head,
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'agendaUrl' }, f.label),
        input),
      h('div', { class: 'stack' },
        h('button', {
          type: 'button', id: 'agendaConnectButton', class: 'button button--primary button--block', disabled: busy,
          onclick: () => guarded(async () => {
            feedMessage.say('');
            const result = await agenda.connectFeed(input.value);
            if (!result.ok) {
              feedMessage.say(f.errors[result.reason] ?? f.errors.unknown, true);
              return;
            }
            input.value = '';
            showToast({ message: f.connected(result.count) });
          }),
        }, busy ? f.connecting : f.connect),
        feedMessage.el),
      h('details', { class: 'agenda-connect__how', id: 'agendaHow' },
        h('summary', null, f.howTitle),
        h('ol', { class: 'agenda-connect__steps' }, ...f.steps.map((step) => h('li', null, step))),
        h('p', { class: 'field__hint' }, f.secret)),
      h('p', { class: 'field__hint' }, f.privacy));
  }

  function deviceSection() {
    if (!deviceCalendarAvailable()) return null;
    const { model } = agenda;
    const d = a.device;
    const head = h('h3', { class: 'agenda-connect__title' }, d.title);
    if (model.device) {
      return h('div', { class: 'agenda-connect__block', id: 'agendaDevice' },
        head,
        h('p', { class: model.deviceAccess === 'granted' ? 'field__hint' : 'field__error', id: 'agendaDeviceStatus', role: model.deviceAccess === 'granted' ? 'status' : 'alert' },
          model.deviceAccess === 'granted' ? d.on : d.revoked),
        h('button', {
          type: 'button', id: 'agendaDeviceOff', class: 'button button--ghost button--block',
          onclick: () => { agenda.disableDevice(); deviceMessage.say(''); showToast({ message: d.disabled }); },
        }, d.disable));
    }
    return h('div', { class: 'agenda-connect__block', id: 'agendaDevice' },
      head,
      h('p', { class: 'field__hint' }, d.hint),
      h('div', { class: 'stack' },
        h('button', {
          type: 'button', id: 'agendaDeviceOn', class: 'button button--secondary button--block', disabled: busy,
          onclick: () => guarded(async () => {
            deviceMessage.say('');
            const result = await agenda.enableDevice();
            if (result.ok) showToast({ message: d.enabled });
            else deviceMessage.say(d[result.reason] ?? d.unavailable, true);
          }),
        }, busy ? d.enabling : d.enable),
        deviceMessage.el));
  }

  function render() {
    const { model } = agenda;
    const both = Boolean(model.feedUrl) && model.device;
    fill(root,
      h('h2', { class: 'section__title' }, a.title),
      h('p', { class: 'section__hint' }, a.hint),
      feedSection(),
      deviceSection(),
      both ? h('p', { class: 'field__hint', id: 'agendaBoth' }, a.both) : null);
  }

  const stop = agenda.onChange(() => (root.isConnected ? render() : stop()));
  const stopAccount = onAccountChanged(() => (root.isConnected ? render() : stopAccount()));
  render();
  return root;
}
