// Inloggen met Google in de Android-app (zie docs/ANDROID-APP.md, §4.4). De inlog zelf gebeurt in de systeembrowser (data/auth.js); Android opent daarna
// de app met habitbuilder://auth?code=…, en hier wordt die code ingewisseld voor een sessie.
import * as auth from '../data/auth.js';
import { nl } from '../content/nl.js';
import { isNativeApp, nativePlugin } from '../native.js';
import { afterLogin } from './account.js';
import { peekReturn } from './intro.js';
import { showToast } from './components/toast.js';
import { socialApp } from './social-app.js';

const handled = new Set(); // een code werkt maar één keer; Android kan hetzelfde adres meer dan eens aanbieden (nieuwe intent en startadres)

/**
 * Verwerkt een adres waarmee Android de app opent. Geeft true als het een inlogadres was (ook als het inloggen mislukte), anders false.
 * `deps` is er voor de tests.
 */
export async function handleAuthUrl(url, deps = {}) {
  const { complete = auth.completeNativeLogin, login = afterLogin, say = (message) => showToast({ message }) } = deps;
  const result = auth.parseNativeAuthUrl(url);
  if (!result) return false;
  if (result.error) {
    say(nl.login.errors.google_failed);
    return true;
  }
  if (handled.has(result.code)) return true;
  handled.add(result.code);
  try {
    await complete(result.code);
    await login();
  } catch (error) {
    console.warn('inloggen met Google in de app mislukt', error);
    say(nl.login.errors[auth.describeAuthError(error)] ?? nl.login.errors.unknown);
    return true;
  }
  // Staat het inlogscherm nog open, dan hoort daar niet langer "inloggen" te staan. Wie vanuit de introductie kwam, wordt door main.js teruggebracht.
  if (!peekReturn() && location.hash.startsWith('#/login')) {
    location.hash = socialApp.pendingInvite() ? `#/vrienden/uitnodiging/${socialApp.pendingInvite()}` : '#/today';
  }
  return true;
}

let started = false;

export function initNativeLogin() {
  if (started || !isNativeApp()) return;
  started = true;
  const app = nativePlugin('App');
  if (!app) return;
  app.addListener?.('appUrlOpen', ({ url }) => { handleAuthUrl(url); });
  // de app is gestart met het adres (hij was gesloten terwijl je bij Google was)
  Promise.resolve(app.getLaunchUrl?.()).then((launch) => (launch?.url ? handleAuthUrl(launch.url) : null)).catch(() => {});
}
