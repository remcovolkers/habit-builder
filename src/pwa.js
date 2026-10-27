// De app als PWA: service worker registreren, een nieuwe versie melden en installeren mogelijk maken.
//
// Updates: de nieuwe worker installeert op de achtergrond en wacht. Pas als de gebruiker op "Vernieuwen" tikt,
// activeren we hem en laden we de pagina opnieuw. Zo verdwijnt er nooit iets wat je net aan het invullen bent.
import { isNativeApp } from './native.js';

const listeners = new Set();

// In de Android-app (Capacitor) geldt de app als geïnstalleerd: de webweergave heeft geen display-mode standalone, maar de installatie-uitleg
// (onboarding, Instellingen) hoort daar niet te verschijnen. Zie docs/MELDINGEN-EN-OPSCHONEN.md §1.
const standalone = () => isNativeApp() || globalThis.matchMedia?.('(display-mode: standalone)').matches === true || globalThis.navigator?.standalone === true;
const iosBrowser = () => /iphone|ipad|ipod/i.test(globalThis.navigator?.userAgent ?? '') && !standalone();

export const pwa = {
  updateReady: false,
  canInstall: false,
  installed: standalone(),
  ios: iosBrowser(),
};

let registration = null;
let deferredPrompt = null;
let userRequestedUpdate = false;

const emit = () => { for (const listener of listeners) listener({ ...pwa }); };

export function onPwaChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// De browser meldt "installeerbaar" één keer en vaak vroeg: luisteren vanaf het laden van deze module.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // we tonen zelf een knop op een rustig moment
  deferredPrompt = event;
  pwa.canInstall = true;
  emit();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  pwa.canInstall = false;
  pwa.installed = true;
  emit();
});

/** Toont het installatievenster van de browser. Geeft 'accepted', 'dismissed' of null (kan nu niet). */
export async function promptInstall() {
  if (!deferredPrompt) return null;
  const prompt = deferredPrompt;
  deferredPrompt = null; // een melding kan maar één keer gebruikt worden
  pwa.canInstall = false;
  emit();
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome;
}

function markUpdate() {
  pwa.updateReady = true;
  emit();
}

/** Activeert de wachtende versie; de pagina herlaadt zodra die het overneemt. */
export function applyUpdate() {
  userRequestedUpdate = true;
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export async function startPwa() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('service worker registreren mislukt', error);
    return;
  }

  // Een update bestaat alleen als er al een worker de pagina bestuurt; de allereerste installatie is geen update.
  const watch = (worker) => worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) markUpdate();
  });
  if (registration.waiting && navigator.serviceWorker.controller) markUpdate();
  if (registration.installing) watch(registration.installing);
  registration.addEventListener('updatefound', () => registration.installing && watch(registration.installing));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userRequestedUpdate) location.reload();
  });

  const check = () => registration.update().catch(() => {}); // offline: stil mislukken
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 60 * 60_000);
}
