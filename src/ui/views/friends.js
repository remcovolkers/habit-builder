// De ranglijst (#/vrienden): afhankelijk van waar je staat het inlogvraagstuk, het aanmelden, of de ranglijst met je vrienden.
import { h } from '../dom.js';
import { account } from '../account.js';
import { social, socialApp } from '../social-app.js';
import { socialLive } from '../social-view.js';
import { emptyState } from '../components/empty-state.js';
import { friendsList } from '../components/friends-list.js';
import { leaderboardList } from '../components/leaderboard.js';
import { breakdownCard, onboardingForm, pendingInviteBanner, reasonText, rulesCard, rulesList, sharingSummary } from '../components/social-parts.js';
import { showToast } from '../components/toast.js';
import { nl } from '../../content/nl.js';

const f = nl.friends;

const pageHeader = (title = f.title) => h('div', { class: 'page-header' },
  h('a', { class: 'back-link', href: '#/stats' }, `‹ ${f.back}`),
  h('h1', { class: 'page-title' }, title));

const message = (title, text, extra = null) => h('div', { class: 'detail' }, pageHeader(), h('section', { class: 'card friends__message' }, h('h2', { class: 'section__title' }, title), h('p', null, text), extra));

/** Openstaande verzoeken aan jou, direct te beantwoorden (hoogstens drie; de rest staat onder Beheren). */
export function requestsBanner(incoming) {
  const shown = incoming.slice(0, 3);
  async function answer(person, accept) {
    const result = await socialApp.respond(person.userId, accept);
    showToast({ message: result.ok ? (accept ? f.requests.accepted(person.name) : f.requests.declined) : reasonText(result.reason) });
  }
  return h('section', { class: 'card requests', id: 'requests', 'aria-label': f.requests.title },
    h('ul', { class: 'person-list' }, ...shown.map((person) =>
      h('li', { class: 'person' },
        h('div', { class: 'person__body' },
          h('span', { class: 'person__name' }, f.requests.incoming(person.name)),
          h('span', { class: 'person__user' }, `@${person.username}`)),
        h('div', { class: 'person__actions' },
          h('button', { type: 'button', class: 'button button--primary button--small', dataset: { focusKey: `accept-${person.userId}` }, onclick: () => answer(person, true) }, f.requests.accept),
          h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `decline-${person.userId}` }, onclick: () => answer(person, false) }, f.requests.decline))))),
    incoming.length > shown.length ? h('a', { class: 'xs', href: '#/vrienden/beheer' }, f.requests.more(incoming.length - shown.length)) : null);
}

function boardPage() {
  const hasFriends = social.friends.length > 0;
  const stale = social.stale
    ? h('p', { class: 'xs muted friends__stale', role: 'status' }, social.fetchedAt
      ? f.board.stale(new Date(social.fetchedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }))
      : f.board.staleNoTime)
    : null;

  return h('div', { class: 'detail' },
    pageHeader(),
    pendingInviteBanner(),
    social.incoming.length > 0 ? requestsBanner(social.incoming) : null,
    h('div', { class: 'friends__actions' },
      h('a', { class: 'button button--primary', id: 'addFriends', href: '#/vrienden/toevoegen' }, f.actions.add),
      h('a', { class: 'button button--secondary', id: 'manageFriends', href: '#/vrienden/beheer' }, f.actions.manage)),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { class: 'section__title' }, f.board.title),
        h('button', {
          type: 'button', id: 'refreshBoard', class: 'button button--ghost button--small', disabled: social.loading,
          onclick: async () => {
            const result = await socialApp.refresh();
            showToast({ message: result.ok ? f.refreshed : reasonText(result.reason) });
          },
        }, f.refresh)),
      h('p', { class: 'xs muted' }, f.board.sub),
      stale,
      social.board.length > 0 ? leaderboardList(social.board) : null,
      hasFriends ? null : emptyState({ art: 'friends', title: f.board.aloneTitle, text: f.board.aloneText, cta: { href: '#/vrienden/toevoegen', label: f.actions.add }, compact: true }),
      hasFriends ? h('p', { class: 'xs muted' }, f.board.hidden) : null),
    hasFriends ? friendsList() : null,
    breakdownCard(social.summary),
    rulesCard());
}

function introPage(form) {
  return h('div', { class: 'detail' },
    pageHeader(f.intro.title),
    pendingInviteBanner(),
    h('section', { class: 'card' },
      h('p', { class: 'friends__lead' }, f.intro.lead),
      sharingSummary()),
    h('section', { class: 'card', id: 'rulesIntro' }, h('h2', { class: 'section__title' }, f.rules.title), rulesList()),
    h('section', { class: 'card' }, form));
}

export function friendsView() {
  const ui = { offlineUnknown: false, checking: false };
  // het formulier bestaat één keer per scherm: bij elke hertekening dezelfde invoer en foutmelding, niet telkens een leeg exemplaar
  let form = null;

  function ensure() {
    if (account.status !== 'signed-in' || ui.checking || !socialApp.needsRefresh()) return;
    ui.checking = true;
    socialApp.refresh().then((result) => {
      ui.checking = false;
      ui.offlineUnknown = !result.ok && result.reason === 'offline' && social.status === 'unknown';
      root.redraw();
    });
  }

  function render() {
    if (account.status === 'restoring') return message(f.title, f.restoring);
    if (social.status === 'signed-out') {
      return message(f.signedOut.title, f.signedOut.text, h('a', { class: 'button button--primary', id: 'loginLink', href: '#/login' }, f.signedOut.login));
    }
    if (social.status === 'unavailable') return message(f.unavailable.title, f.unavailable.text);
    if (social.status === 'unknown') {
      if (!ui.offlineUnknown) return message(f.title, f.loading);
      return message(f.offline.title, f.offline.text, h('button', {
        type: 'button', id: 'retryFriends', class: 'button button--secondary',
        onclick: () => { ui.offlineUnknown = false; root.redraw(); ensure(); },
      }, f.offline.retry));
    }
    if (social.status === 'off') { form ??= onboardingForm(); return introPage(form); }
    return boardPage();
  }

  const root = socialLive({ className: 'friends', render, onAccount: ensure });
  ensure();
  return root;
}
