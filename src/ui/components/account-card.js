import { fill, h } from '../dom.js';
import { openDialog } from './dialog.js';
import { showToast } from './toast.js';
import { account, deleteAccount, onAccountChanged, prepareSignOut, refreshAccountUI, signOut, syncNow } from '../account.js';
import { openNameDialog } from './name-dialog.js';
import { downloadBackup } from '../download.js';
import { state } from '../state.js';
import { nl } from '../../content/nl.js';

function syncText() {
  const s = nl.account.sync;
  if (!navigator.onLine) return s.offline;
  if (account.sync.state === 'syncing') return s.syncing;
  if (account.sync.state === 'error') return s.error;
  if (account.sync.lastSyncAt) {
    const time = new Date(account.sync.lastSyncAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    return s.done(time);
  }
  return s.never;
}

async function confirmSignOut() {
  const pending = await prepareSignOut();
  openDialog({
    title: nl.account.signOutTitle,
    description: pending > 0 ? `${nl.account.signOutText} ${nl.account.signOutUnsynced(pending)}` : nl.account.signOutText,
    actions: [
      ...(pending > 0 ? [{ label: nl.account.backupFirst, onClick: async () => { await downloadBackup(state.repo, state.today); return false; } }] : []),
      { label: nl.account.signOutConfirm, variant: 'danger', onClick: () => signOut() },
    ],
  });
}

function confirmDelete() {
  openDialog({
    title: nl.account.deleteTitle,
    description: nl.account.deleteText,
    actions: [{
      label: nl.account.deleteConfirm,
      variant: 'danger',
      onClick: async () => {
        try {
          await deleteAccount();
        } catch (error) {
          console.warn('account verwijderen mislukt', error);
          showToast({ message: nl.account.deleteFailed });
          return false;
        }
        return undefined;
      },
    }],
  });
}

/** Accountsectie voor Instellingen; tekent zichzelf opnieuw bij elke wijziging in inlogstatus of sync. */
export function accountCard() {
  const root = h('section', { class: 'section account-card' });

  function render() {
    if (account.status !== 'signed-in') {
      fill(root,
        h('h2', { class: 'section__title' }, nl.account.title),
        h('p', { class: 'section__hint' }, nl.account.anonymous),
        h('a', { id: 'loginLink', class: 'button button--primary button--block', href: '#/login' }, nl.account.login));
      return;
    }
    fill(root,
      h('h2', { class: 'section__title' }, nl.account.title),
      h('p', { id: 'accountEmail', class: 'account-card__email' }, nl.account.signedInAs(account.user.email)),
      h('p', { id: 'syncStatus', class: 'section__hint', role: 'status' }, syncText()),
      account.pending > 0 ? h('p', { class: 'section__hint' }, nl.account.sync.pending(account.pending)) : null,
      h('div', { class: 'account-card__name' },
        h('span', { class: 'muted' }, nl.account.name.current),
        h('b', { id: 'accountName' }, String(state.settings.displayName ?? '').trim() || nl.account.name.notSet),
        h('button', {
          type: 'button', id: 'changeName', class: 'button button--ghost button--small',
          onclick: () => openNameDialog({ initial: state.settings.displayName ?? '', onSaved: refreshAccountUI }),
        }, nl.account.name.change)),
      h('div', { class: 'stack' },
        h('button', {
          type: 'button', id: 'syncNow', class: 'button button--secondary button--block',
          disabled: account.sync.state === 'syncing',
          onclick: async () => {
            await syncNow();
            showToast({ message: nl.account.synced });
          },
        }, nl.account.syncNow),
        h('button', { type: 'button', id: 'signOut', class: 'button button--secondary button--block', onclick: confirmSignOut }, nl.account.signOut),
        h('button', { type: 'button', id: 'deleteAccount', class: 'button button--danger button--block', onclick: confirmDelete }, nl.account.delete)));
  }

  const stop = onAccountChanged(() => (root.isConnected ? render() : stop()));
  render();
  return root;
}
