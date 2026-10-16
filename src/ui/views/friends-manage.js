// Vrienden beheren (#/vrienden/beheer): verzoeken, vrienden, uitnodigingslinks en je profiel (naam, uitzetten).
import { h } from '../dom.js';
import { account } from '../account.js';
import { social, socialApp } from '../social-app.js';
import { socialLive } from '../social-view.js';
import { openDialog } from '../components/dialog.js';
import { openNameDialog } from '../components/name-dialog.js';
import { copyText, reasonText, shareLink, untilLabel } from '../components/social-parts.js';
import { showToast } from '../components/toast.js';
import { state } from '../state.js';
import { INVITE_MAX_USES } from '../../app/social.js';
import { nl } from '../../content/nl.js';

const f = nl.friends;
const t = f.manage;

const toast = (result, okMessage) => showToast({ message: result.ok ? okMessage : reasonText(result.reason) });

function person(p, actions) {
  return h('li', { class: 'person', dataset: { userId: p.userId } },
    h('div', { class: 'person__body' }, h('span', { class: 'person__name' }, p.name), h('span', { class: 'person__user' }, `@${p.username}`)),
    h('div', { class: 'person__actions' }, ...actions));
}

function confirmRemove(p) {
  openDialog({
    title: t.removeTitle(p.name),
    description: t.removeText,
    actions: [{ label: t.removeConfirm, variant: 'danger', onClick: async () => { toast(await socialApp.remove(p.userId), t.removed); } }],
  });
}

function confirmLeave() {
  openDialog({
    title: t.leaveConfirmTitle,
    description: t.leaveText,
    actions: [{
      label: t.leaveConfirm,
      variant: 'danger',
      onClick: async () => {
        const result = await socialApp.disable();
        toast(result, t.left);
        if (result.ok) location.hash = '#/vrienden';
        return result.ok ? undefined : false;
      },
    }],
  });
}

export function friendsManageView() {
  const ui = { invites: null };

  async function loadInvites() {
    if (account.status !== 'signed-in' || social.status !== 'on') return;
    const result = await socialApp.invites();
    ui.invites = result.ok ? result.invites : [];
    root.redraw();
  }

  const section = (id, title, ...children) => h('section', { class: 'section', id }, h('h2', { class: 'section__title' }, title), ...children);

  function render() {
    const header = h('div', { class: 'page-header' },
      h('a', { class: 'back-link', href: '#/vrienden' }, `‹ ${f.title}`),
      h('h1', { class: 'page-title' }, t.title));
    if (account.status !== 'signed-in' || social.status !== 'on') {
      return h('div', { class: 'detail' }, header, h('section', { class: 'card' }, h('p', null, f.errors.not_enabled), h('a', { class: 'button button--primary', href: '#/vrienden' }, f.title)));
    }
    const name = String(state.settings.displayName ?? '').trim() || social.me?.username || '';
    return h('div', { class: 'detail' },
      header,
      social.incoming.length > 0
        ? section('incoming', t.incomingTitle, h('ul', { class: 'person-list card' }, ...social.incoming.map((p) => person(p, [
          h('button', { type: 'button', class: 'button button--primary button--small', dataset: { focusKey: `accept-${p.userId}` }, onclick: async () => toast(await socialApp.respond(p.userId, true), f.requests.accepted(p.name)) }, f.requests.accept),
          h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `decline-${p.userId}` }, onclick: async () => toast(await socialApp.respond(p.userId, false), f.requests.declined) }, f.requests.decline),
        ]))))
        : null,
      social.outgoing.length > 0
        ? section('outgoing', t.outgoingTitle, h('ul', { class: 'person-list card' }, ...social.outgoing.map((p) => person(p, [
          h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `cancel-${p.userId}` }, onclick: async () => toast(await socialApp.cancel(p.userId), t.cancelled) }, t.cancel),
        ]))))
        : null,
      section('friends', t.friendsTitle,
        social.friends.length > 0
          ? h('ul', { class: 'person-list card' }, ...social.friends.map((p) => person(p, [
            h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `remove-${p.userId}` }, 'aria-label': `${t.remove}: ${p.name}`, onclick: () => confirmRemove(p) }, t.remove),
          ])))
          : h('p', { class: 'muted' }, t.noFriends)),
      section('invites', t.invitesTitle,
        ui.invites === null
          ? h('p', { class: 'muted' }, f.loading)
          : ui.invites.length > 0
            ? h('ul', { class: 'person-list card' }, ...ui.invites.map((inv) => h('li', { class: 'person', dataset: { inviteId: inv.id } },
              h('div', { class: 'person__body' },
                h('span', { class: 'person__name' }, t.invite(untilLabel(inv.expires_at))),
                h('span', { class: 'person__user' }, (inv.uses ?? 0) >= INVITE_MAX_USES ? t.inviteFull(inv.uses) : `${t.inviteUses(inv.uses ?? 0)} via deze link`),
                inv.link ? null : h('span', { class: 'person__user' }, t.inviteOtherDevice)),
              h('div', { class: 'person__actions' },
                inv.link ? h('button', {
                  type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: `copy-${inv.id}` },
                  onclick: async () => { showToast({ message: (await copyText(inv.link)) ? t.inviteCopied : f.add.copyFailed }); },
                }, t.inviteCopy) : null,
                inv.link && navigator.share ? h('button', {
                  type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: `share-${inv.id}` },
                  onclick: () => shareLink(inv.link),
                }, t.inviteShare) : null,
                h('button', {
                  type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: `revoke-${inv.id}` },
                  onclick: async () => {
                    const result = await socialApp.revokeInvite(inv.id);
                    toast(result, t.revoked);
                    if (result.ok) { ui.invites = ui.invites.filter((x) => x.id !== inv.id); root.redraw(); }
                  },
                }, t.revoke)))))
            : h('p', { class: 'muted' }, t.noInvites),
        h('a', { class: 'button button--secondary button--small', href: '#/vrienden/toevoegen' }, f.actions.add)),
      section('profile', t.profileTitle,
        h('div', { class: 'card profile' },
          h('div', { class: 'profile__row' }, h('span', { class: 'muted' }, t.profileName), h('b', { id: 'profileName' }, name),
            h('button', { type: 'button', id: 'changeSocialName', class: 'button button--ghost button--small', onclick: () => openNameDialog({ initial: state.settings.displayName ?? '', onSaved: () => root.redraw() }) }, t.changeName)),
          h('div', { class: 'profile__row' }, h('span', { class: 'muted' }, t.profileUser), h('b', { id: 'profileUsername' }, `@${social.me?.username ?? ''}`))),
        h('div', { class: 'card card--quiet leave' },
          h('h3', { class: 'section__title' }, t.leaveTitle),
          h('p', { class: 'section__hint' }, t.leaveText),
          h('button', { type: 'button', id: 'leaveSocial', class: 'button button--danger button--block', onclick: confirmLeave }, t.leave))));
  }

  const root = socialLive({ className: 'friends friends--manage', render, onAccount: loadInvites });
  // altijd even bijwerken bij het openen: een verzoek van net kan er zijn
  if (account.status === 'signed-in' && social.status === 'on') socialApp.refresh({ background: true });
  loadInvites();
  return root;
}
