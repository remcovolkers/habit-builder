// Vrienden toevoegen (#/vrienden/toevoegen): zoeken op de exacte gebruikersnaam, of een uitnodigingslink delen.
import { h } from '../dom.js';
import { account } from '../account.js';
import { social, socialApp } from '../social-app.js';
import { socialLive } from '../social-view.js';
import { copyText, reasonText, shareLink, untilLabel } from '../components/social-parts.js';
import { showToast } from '../components/toast.js';
import { INVITE_MAX_USES } from '../../app/social.js';
import { nl } from '../../content/nl.js';

const f = nl.friends;
const t = f.add;

const pageHeader = () => h('div', { class: 'page-header' },
  h('a', { class: 'back-link', href: '#/vrienden' }, `‹ ${f.title}`),
  h('h1', { class: 'page-title' }, t.title));

export function friendsAddView() {
  const ui = { searched: null, person: null, relation: null, busy: false, invite: null };

  // het zoekformulier staat buiten de hertekening: wat je typt blijft staan
  const input = h('input', {
    id: 'findInput', class: 'input', type: 'text', maxlength: 30, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
    'aria-describedby': 'findHint findError',
  });
  const error = h('p', { id: 'findError', class: 'field__error', role: 'alert', hidden: true });
  const form = h('form', { class: 'form find', novalidate: true, onsubmit: search },
    h('div', { class: 'field' },
      h('label', { class: 'visually-hidden', for: 'findInput' }, t.searchLabel), // de kop erboven zegt al waar het veld voor is
      h('div', { class: 'find__row' }, input, h('button', { type: 'submit', id: 'findButton', class: 'button button--primary' }, t.searchButton)),
      h('p', { id: 'findHint', class: 'field__hint' }, t.searchHint),
      error));

  async function search(event) {
    event.preventDefault();
    error.hidden = true;
    const value = input.value.trim();
    if (value === '' || ui.busy) return;
    ui.busy = true;
    const result = await socialApp.find(value);
    ui.busy = false;
    if (!result.ok) {
      error.textContent = reasonText(result.reason);
      error.hidden = false;
      return;
    }
    ui.searched = value;
    ui.person = result.person;
    ui.relation = result.person?.relation ?? null;
    root.redraw();
  }

  async function sendRequest(person) {
    const result = await socialApp.request(person.userId);
    if (!result.ok) { showToast({ message: reasonText(result.reason) }); return; }
    ui.relation = result.status === 'accepted' ? 'friend' : 'outgoing';
    showToast({ message: t.requestSent(person.name) });
    root.redraw();
  }

  async function acceptRequest(person) {
    const result = await socialApp.respond(person.userId, true);
    if (!result.ok) { showToast({ message: reasonText(result.reason) }); return; }
    ui.relation = 'friend';
    showToast({ message: f.requests.accepted(person.name) });
    root.redraw();
  }

  function resultCard() {
    if (ui.searched === null) return null;
    if (!ui.person) return h('p', { class: 'muted', id: 'findNone', role: 'status' }, t.notFound);
    const person = ui.person;
    const action = {
      none: () => h('button', { type: 'button', class: 'button button--primary button--small', id: 'sendRequest', dataset: { focusKey: 'send' }, onclick: () => sendRequest(person) }, t.sendRequest),
      outgoing: () => h('span', { class: 'badge badge--ok', id: 'requestPending' }, t.pending),
      incoming: () => h('button', { type: 'button', class: 'button button--primary button--small', id: 'acceptIt', dataset: { focusKey: 'accept' }, onclick: () => acceptRequest(person) }, t.acceptIt),
      friend: () => h('span', { class: 'badge badge--ok', id: 'alreadyFriends' }, t.friend),
    }[ui.relation ?? 'none'];
    return h('div', { class: 'card person person--result', id: 'findResult' },
      h('div', { class: 'person__body' }, h('span', { class: 'person__name' }, person.name), h('span', { class: 'person__user' }, `@${person.username}`)),
      h('div', { class: 'person__actions' }, action()));
  }

  async function makeInvite() {
    const result = await socialApp.createInvite();
    if (!result.ok) { showToast({ message: reasonText(result.reason) }); return; }
    ui.invite = { link: result.link, expiresAt: result.expiresAt, uses: 0 };
    root.redraw();
    document.getElementById('inviteLink')?.select();
  }

  async function copyInvite() {
    const ok = await copyText(ui.invite.link);
    showToast({ message: ok ? t.copied : t.copyFailed });
    if (!ok) document.getElementById('inviteLink')?.select();
  }

  /** Je actieve link van dit apparaat staat er weer, zonder een nieuwe te maken (de server bewaart alleen een hash; de code staat op dit apparaat). */
  async function loadExisting() {
    if (account.status !== 'signed-in' || social.status !== 'on' || ui.invite) return;
    const result = await socialApp.invites();
    const mine = result.ok ? result.invites.find((invite) => invite.link) : null;
    if (mine) { ui.invite = { link: mine.link, expiresAt: mine.expires_at, uses: mine.uses }; root.redraw(); }
  }

  function inviteSection() {
    return h('section', { class: 'card invite' },
      h('h2', { class: 'section__title' }, t.inviteTitle),
      h('p', { class: 'section__hint' }, t.inviteText),
      ui.invite
        ? h('div', { class: 'invite__box' },
          h('label', { class: 'field__label', for: 'inviteLink' }, t.inviteLinkLabel),
          h('input', { id: 'inviteLink', class: 'input', type: 'text', readonly: true, value: ui.invite.link, onfocus: (e) => e.target.select() }),
          h('p', { class: 'xs muted' }, `${(ui.invite.uses ?? 0) >= INVITE_MAX_USES ? t.usesFull(ui.invite.uses) : t.uses(ui.invite.uses ?? 0)} · ${t.expires(untilLabel(ui.invite.expiresAt))}`),
          h('div', { class: 'invite__actions' },
            navigator.share ? h('button', { type: 'button', id: 'shareInvite', class: 'button button--primary', onclick: async () => { await shareLink(ui.invite.link); } }, t.share) : null,
            h('button', { type: 'button', id: 'copyInvite', class: navigator.share ? 'button button--secondary' : 'button button--primary', onclick: copyInvite }, t.copy),
            h('button', { type: 'button', id: 'newInvite', class: 'button button--ghost', onclick: makeInvite }, t.inviteNew)))
        : h('button', { type: 'button', id: 'makeInvite', class: 'button button--secondary button--block', onclick: makeInvite }, t.inviteMake));
  }

  function render() {
    if (account.status === 'signed-in' && social.status === 'on') {
      return h('div', { class: 'detail' }, pageHeader(),
        h('section', { class: 'card' },
          h('h2', { class: 'section__title' }, t.searchTitle),
          form,
          h('div', { class: 'find__result', 'aria-live': 'polite' }, resultCard())),
        inviteSection());
    }
    // niet ingelogd of nog niet aangemeld: terug naar het hoofdscherm, dat het uitlegt
    return h('div', { class: 'detail' }, pageHeader(),
      h('section', { class: 'card' },
        h('p', null, f.errors.not_enabled),
        h('a', { class: 'button button--primary', href: '#/vrienden' }, f.title)));
  }

  const root = socialLive({ className: 'friends friends--add', render, onAccount: loadExisting });
  loadExisting();
  return root;
}

