// Is deze gebruiker de beheerder? Bepaalt of het tabje Feedback in de navigatie staat (alleen op de computer, zie styles/layout.css). De server beslist
// echt (app_is_admin en de beheerdersfuncties van 0007_feedback.sql); dit is alleen om het tabje aan de juiste persoon te tonen.
import * as auth from '../data/auth.js';
import { fetchIsAdmin, listFeedback } from '../data/feedback-remote.js';
import { countByStatus } from '../app/feedback.js';
import { account, onAccountChanged } from './account.js';

/** status: 'unknown' (nog niet gevraagd) | 'checking' | 'yes' | 'no'; newCount: het aantal nieuwe berichten (alleen voor de beheerder, anders 0). */
export const admin = { status: 'unknown', newCount: 0 };

const events = new EventTarget();
const emit = () => events.dispatchEvent(new Event('admin'));
export function onAdminChanged(listener) {
  events.addEventListener('admin', listener);
  return () => events.removeEventListener('admin', listener);
}

const RECHECK_MS = 5 * 60_000;
let userId = null;
let checkedAt = 0;

/** Het aantal nieuwe berichten opnieuw ophalen (na het openen van de lijst, een wijziging of als je terugkomt in de app). */
export async function refreshFeedbackCount() {
  if (admin.status !== 'yes') return;
  try {
    admin.newCount = countByStatus(await listFeedback(() => auth.getClient())).new;
    emit();
  } catch {
    /* geen verbinding: het getal blijft zoals het was */
  }
}

async function check() {
  admin.status = 'checking';
  emit();
  const yes = await fetchIsAdmin(() => auth.getClient());
  checkedAt = Date.now();
  admin.status = yes ? 'yes' : 'no';
  if (!yes) admin.newCount = 0;
  emit();
  if (yes) refreshFeedbackCount();
}

function sync() {
  const signedIn = account.status === 'signed-in' && account.user;
  if (!signedIn) {
    // zonder account ben je geen beheerder (een bewaarde sessie die nog hersteld wordt, 'restoring', blijft "onbekend")
    if (account.status === 'anonymous') {
      userId = null;
      if (admin.status !== 'no' || admin.newCount !== 0) { admin.status = 'no'; admin.newCount = 0; emit(); }
    }
    return;
  }
  if (account.user.id !== userId) { userId = account.user.id; admin.status = 'unknown'; }
  if (admin.status === 'unknown') check();
}

/** Start de controle zodra er een sessie is, en vraagt het opnieuw als je een tijd weg was (een eerdere fout, zoals geen verbinding, telt dan niet blijvend). */
export function initAdmin() {
  onAccountChanged(sync);
  sync();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !account.user) return;
    if (admin.status === 'yes') refreshFeedbackCount();
    else if (admin.status === 'no' && Date.now() - checkedAt > RECHECK_MS) { admin.status = 'unknown'; sync(); }
  });
}
