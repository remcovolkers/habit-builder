// "Nieuwe versie staat klaar" in de Android-app (zie docs/ANDROID-APP.md, §4.3). De webkant van de app werkt zichzelf bij (de app toont de live site);
// dit gaat over de APK zelf. Eén controle per dag bij GitHub Releases; downloaden gaat via de systeembrowser, Android vraagt zelf om de installatie.
import { isNewer, LATEST_RELEASE_URL, pickUpdate } from '../app/app-update.js';
import { isNativeApp, nativePlugin } from '../native.js';

const CHECKED_KEY = 'hb-update-checked';
const FOUND_KEY = 'hb-update-found';
const DAY = 24 * 60 * 60 * 1000;

/** `available`: { version, apkUrl, pageUrl } of null. */
export const appUpdate = { available: null };

const events = new EventTarget();
export function onAppUpdateChanged(listener) {
  events.addEventListener('app-update', listener);
  return () => events.removeEventListener('app-update', listener);
}
const emit = () => events.dispatchEvent(new Event('app-update'));

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* opslag geblokkeerd: dan controleren we vaker */ } };

/** De versie van de geïnstalleerde APK ("1.2.0", bij een debug-build "1.2.0-debug"), of null. */
export async function installedVersion() {
  try {
    return (await nativePlugin('App')?.getInfo?.())?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Vraagt GitHub naar de nieuwste release, hoogstens één keer per dag (`force` slaat dat over).
 * Geeft { status: 'available' | 'current' | 'skipped' | 'failed', ... } zodat de ontwikkelaarsknop kan zeggen wat er gebeurde.
 */
export async function checkAppUpdate({ force = false, fetchImpl = globalThis.fetch?.bind(globalThis), now = Date.now() } = {}) {
  if (!isNativeApp()) return { status: 'skipped', reason: 'geen app' };
  const current = await installedVersion();
  if (!current) return { status: 'failed', reason: 'versie van de app onbekend' };

  const last = Number(read(CHECKED_KEY));
  if (!force && last > 0 && now - last < DAY) {
    // de uitkomst van de vorige controle geldt nog; de geïnstalleerde versie kan intussen veranderd zijn (bijgewerkt)
    try {
      const found = JSON.parse(read(FOUND_KEY) || 'null');
      appUpdate.available = found && isNewer(found.version, current) ? found : null;
    } catch {
      appUpdate.available = null;
    }
    emit();
    return { status: 'skipped', reason: 'vandaag al gecontroleerd', current };
  }

  let release;
  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (response.status === 404) release = null; // er is nog geen release
    else if (!response.ok) return { status: 'failed', reason: `GitHub antwoordde ${response.status}`, current };
    else release = await response.json();
  } catch (error) {
    return { status: 'failed', reason: String(error?.message ?? error), current };
  }

  write(CHECKED_KEY, String(now));
  const found = pickUpdate(release, current);
  write(FOUND_KEY, found ? JSON.stringify(found) : '');
  appUpdate.available = found;
  emit();
  return found ? { status: 'available', current, ...found } : { status: 'current', current, latest: release?.tag_name ?? null };
}

/** Opent de APK in de systeembrowser: die downloadt hem en Android toont daarna zelf de installatie. */
export function downloadAppUpdate() {
  if (appUpdate.available) globalThis.location.assign(appUpdate.available.apkUrl);
}

/** Alleen voor de ontwikkelaarsopties: doet alsof er een nieuwe versie klaarstaat, om de balk te zien. */
export function pretendAppUpdate() {
  appUpdate.available = { version: '9.9.9', apkUrl: 'https://github.com/remcovolkers/habit-builder/releases/latest', pageUrl: 'https://github.com/remcovolkers/habit-builder/releases/latest' };
  emit();
}

let started = false;

export function initAppUpdate() {
  if (started || !isNativeApp()) return;
  started = true;
  checkAppUpdate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAppUpdate(); }); // houdt zelf bij of de dag voorbij is
}
