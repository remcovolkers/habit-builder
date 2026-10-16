// De bedrading van vrienden en ranglijst met de echte app: het account, de gegevens, de server en de opslag.
// De logica zelf staat in ui/social.js (createSocial), die zonder scherm te testen is.
import * as auth from '../data/auth.js';
import { createSocialCache } from '../data/social-cache.js';
import { createSocialRemote } from '../data/social-remote.js';
import { account, onAccountChanged, onBeforeLeave, setNameAskGuard } from './account.js';
import { createSocial } from './social.js';
import { onChanged, state } from './state.js';

/** Alles wat de schermen nodig hebben: `social` (de status, alleen lezen) en de acties. */
export const socialApp = createSocial({
  remote: createSocialRemote(() => auth.getClient()),
  cache: createSocialCache(),
  env: {
    signedIn: () => account.status === 'signed-in' && Boolean(account.user),
    userId: () => account.user?.id ?? null,
    settings: () => state.settings,
    today: () => state.today,
    snapshot: () => state.repo.snapshot(),
    online: () => navigator.onLine,
    now: () => Date.now(),
    baseUrl: () => `${location.origin}${location.pathname}`,
  },
});

export const social = socialApp.social;
export const onSocialChanged = socialApp.onChanged;

let started = false;
let openedInvite = false;

/**
 * Is er een uitnodiging die op je wacht en ben je nu ingelogd (ook na een omweg via Google, of met een bewaarde sessie)? Dan ga je er één keer
 * naartoe, zodat de flow afgemaakt wordt. Daarna laten we je met rust.
 */
function openPendingInvite() {
  if (account.status !== 'signed-in') { openedInvite = false; return; }
  if (openedInvite) return;
  const code = socialApp.pendingInvite();
  if (!code) return;
  openedInvite = true;
  if (!location.hash.startsWith('#/vrienden/uitnodiging/')) location.hash = `#/vrienden/uitnodiging/${code}`;
}

export function initSocial() {
  if (started) return;
  started = true;
  socialApp.syncAccount(); // al ingelogd en bekend dat je meedoet? dan staat de cache er direct en wordt hij bijgewerkt
  setNameAskGuard(() => Boolean(socialApp.pendingInvite()));
  onAccountChanged(() => { socialApp.syncAccount(); openPendingInvite(); }); // komt ook bij elke sync-melding: syncAccount doet dan niets
  onChanged(() => socialApp.scheduleRecompute()); // een wijziging in je habits: je punten bijwerken en publiceren (alleen als sociaal aan staat)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && social.status === 'on' && socialApp.needsRefresh()) socialApp.refresh({ background: true });
  });
  onBeforeLeave(() => socialApp.leave()); // uitloggen of account verwijderen: niets van dit account blijft op dit apparaat
}
