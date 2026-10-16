// Het account in de UI: inloggen, synchroniseren, uitloggen en account verwijderen aan elkaar knopen.
// De datalaag (data/auth.js, data/sync.js, data/account-link.js) weet niets van schermen; dit bestand wel.
import { h } from './dom.js';
import { notifyChanged, onChanged, reloadSettings, state } from './state.js';
import { openDialog } from './components/dialog.js';
import { showToast } from './components/toast.js';
import { downloadBackup } from './download.js';
import { openNameDialog } from './components/name-dialog.js';
import { shouldAskName, suggestDisplayName } from '../app/settings.js';
import * as auth from '../data/auth.js';
import { adoptUser, bindUser, countPending, unlinkAccount, wipeLocalData } from '../data/account-link.js';
import { createSyncEngine, readMeta } from '../data/sync.js';
import { createSupabaseRemote } from '../data/supabase-remote.js';
import { nl } from '../content/nl.js';

export const account = {
  // 'anonymous' | 'restoring' | 'signed-in'
  // restoring: er is een bewaarde sessie (of we komen terug van Google) maar die is nog niet opgehaald of gecontroleerd.
  // In die tussentijd zeggen we niet dat je bent uitgelogd: geen inlogknop en geen zetje om in te loggen.
  status: auth.hasStoredSession() || auth.isAuthCallback() ? 'restoring' : 'anonymous',
  user: null, // { id, email }
  sync: { state: 'idle', lastSyncAt: null, error: null },
  pending: 0,
};

const events = new EventTarget();
const emit = () => events.dispatchEvent(new Event('account'));
export function onAccountChanged(listener) {
  events.addEventListener('account', listener);
  return () => events.removeEventListener('account', listener);
}

// Onderdelen die iets moeten opruimen vóór uitloggen of account verwijderen (bv. de herinnering van dit apparaat).
const beforeLeave = new Set();
export function onBeforeLeave(handler) {
  beforeLeave.add(handler);
  return () => beforeLeave.delete(handler);
}
async function runBeforeLeave() {
  for (const handler of beforeLeave) {
    try {
      await handler();
    } catch (error) {
      console.warn('opruimen mislukt', error);
    }
  }
}

let engine = null;
let started = false;
let debounce = null;
let attaching = Promise.resolve();

async function refreshPending() {
  account.pending = await countPending(state.repo.store);
}

/** Verstuurt en haalt op. Veilig om vaak aan te roepen: de motor doet één sync tegelijk. */
export async function syncNow() {
  if (!engine || !navigator.onLine) return null;
  try {
    const result = await engine.request();
    await refreshPending();
    if (result.pulled > 0) await reloadSettings(); // ververst ook de schermen
    return result;
  } catch (error) {
    console.warn('synchroniseren mislukt', error);
    // een foreign-key-fout (409) betekent meestal dat het account op de server niet meer bestaat: dan is deze sessie waardeloos en loggen we uit
    if (auth.isUserGoneError(error) && (await auth.sessionIsGone())) {
      await auth.signOutLocal().catch(() => {});
      return null;
    }
    await refreshPending();
    emit();
    return null;
  }
}

function scheduleSync() {
  clearTimeout(debounce);
  debounce = setTimeout(syncNow, 1500);
}

async function askSwitch(pending) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    openDialog({
      title: nl.account.switchTitle,
      description: pending > 0 ? `${nl.account.switchText} ${nl.account.switchUnsynced(pending)}` : nl.account.switchText,
      actions: [
        ...(pending > 0
          ? [{ label: nl.account.backupFirst, onClick: async () => { await downloadBackup(state.repo, state.today); return false; } }]
          : []),
        { label: nl.account.switchConfirm, variant: 'danger', onClick: () => finish(true) },
      ],
      onClose: () => finish(false), // sluiten zonder keuze = annuleren
    });
  });
}

async function attach(user) {
  const store = state.repo.store;
  const link = await adoptUser({ store, userId: user.id });
  if (link.action === 'other-account') {
    const proceed = await askSwitch(link.pending);
    if (!proceed) {
      await auth.signOutLocal();
      return;
    }
    await wipeLocalData(store);
    await bindUser(store, user.id);
    await reloadSettings();
  }

  const client = await auth.getClient();
  engine = createSyncEngine({ store, remote: createSupabaseRemote({ client, userId: user.id }) });
  engine.subscribe((sync) => {
    account.sync = sync;
    emit();
  });
  account.user = { id: user.id, email: user.email ?? '', suggestedName: suggestDisplayName(user.user_metadata) };
  account.status = 'signed-in';
  const meta = await readMeta(store);
  account.sync = { state: 'idle', lastSyncAt: meta.lastSyncAt, error: null };
  await refreshPending();
  emit();
  await syncNow();
  maybeAskName();
}

let askedName = false;
let nameAskGuard = () => false;

/** Een uitnodiging die wacht vraagt de naam zelf (één naamstap, ITERATIE-1.2 §2): dan toont het account zijn eigen vraag niet. */
export function setNameAskGuard(guard) {
  nameAskGuard = guard;
}

/** Eerste keer ingelogd en nog geen naam? Vraag hem één keer, na de eerste sync (dan weten we of een ander apparaat hem al kent). */
function maybeAskName() {
  if (askedName || !account.user || !shouldAskName(state.settings) || nameAskGuard()) return;
  askedName = true;
  openNameDialog({ initial: account.user.suggestedName, onSaved: emit });
}

/** Voor de accountkaart: na het wijzigen van de naam opnieuw tekenen. */
export const refreshAccountUI = emit;

function detach() {
  engine = null;
  account.status = 'anonymous';
  account.user = null;
  askedName = false;
  account.sync = { state: 'idle', lastSyncAt: null, error: null };
  account.pending = 0;
  emit();
}

/**
 * Geen sessie gevonden terwijl we er een verwachtten. Is hij ook echt uit de opslag verdwenen (verlopen of ingetrokken), dan zijn we
 * anoniem. Staat hij er nog, maar kon hij niet gecontroleerd worden (geen verbinding), dan blijven we "ophalen" en proberen we het later opnieuw.
 */
function settleRestoring() {
  if (auth.hasStoredSession()) return;
  account.status = 'anonymous';
  emit();
}

function handleSession(user) {
  // één na één verwerken: de auth-callback kan snel achter elkaar meerdere keren komen
  attaching = attaching.then(async () => {
    if (!user) {
      if (account.status === 'signed-in') detach();
      else if (account.status === 'restoring') settleRestoring();
      return;
    }
    if (account.user?.id === user.id) return;
    try {
      await attach(user);
    } catch (error) {
      console.error('account koppelen mislukt', error);
    }
  });
  return attaching;
}

/** Start alleen als er een sessie is of we terugkomen van Google; anders blijft de SDK ongeladen. */
export async function initAccount() {
  if (started) return;
  if (!auth.hasStoredSession() && !auth.isAuthCallback()) return;
  await activate();
}

/** Laadt de SDK en luistert naar inloggen/uitloggen (ook vanuit een ander tabblad). */
export async function activate() {
  if (started) return;
  started = true;
  await auth.onAuthChange((event, session) => {
    // niet in de callback zelf met de SDK werken (dat blokkeert): even loskoppelen
    setTimeout(() => handleSession(session?.user ?? null), 0);
  });
  const user = await auth.currentUser().catch((error) => {
    console.warn('sessie ophalen mislukt (offline?)', error);
    return null;
  });
  await handleSession(user);

  onChanged(() => {
    if (account.status === 'signed-in') scheduleSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (account.status === 'signed-in') syncNow();
    else if (account.status === 'restoring') retryRestore();
  });
  const retryRestore = () => auth.currentUser().then((u) => handleSession(u)).catch(() => {});
  window.addEventListener('online', () => {
    if (account.status === 'signed-in') syncNow();
    else retryRestore();
  });
  setInterval(() => {
    if (!document.hidden && account.status === 'signed-in') syncNow();
  }, 5 * 60_000);
}

/** Na een geslaagde inlog vanuit het inlogscherm: zorgen dat alles draait. */
export async function afterLogin() {
  await activate();
  const user = await auth.currentUser();
  await handleSession(user);
}

/** Probeert nog een laatste keer te syncen en meldt hoeveel wijzigingen nog niet verstuurd zijn. */
export async function prepareSignOut() {
  await syncNow();
  await refreshPending();
  return account.pending;
}

export async function signOut() {
  const store = state.repo.store;
  await runBeforeLeave(); // nog ingelogd: dan kan de server-kant van de herinnering netjes weg
  await wipeLocalData(store);
  await auth.signOutLocal();
  detach();
  await reloadSettings();
  showToast({ message: nl.account.signedOut });
}

export async function deleteAccount() {
  await auth.deleteMyAccount(); // de rijen op de server verdwijnen mee (cascade)
  await runBeforeLeave();
  await unlinkAccount(state.repo.store); // de data op dit apparaat blijft, maar is weer "anoniem"
  detach();
  notifyChanged();
  showToast({ message: nl.account.deleted });
}

/** Een slim, dismissbaar zetje voor wie nog geen account heeft (alleen tonen als er al data is). */
const NUDGE_KEY = 'hb-nudge-dismissed';
export function nudgeDismissed() {
  try {
    return localStorage.getItem(NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}
export function dismissNudge() {
  try {
    localStorage.setItem(NUDGE_KEY, '1');
  } catch {
    /* opslag geblokkeerd: dan blijft het zetje gewoon staan */
  }
}
export const nudgeElement = (onDismiss) => h('div', { class: 'banner nudge' },
  h('span', null, nl.account.nudge, ' '),
  h('a', { href: '#/login' }, nl.account.nudgeLink),
  h('button', { type: 'button', class: 'nudge__dismiss', onclick: onDismiss }, nl.account.nudgeDismiss));
