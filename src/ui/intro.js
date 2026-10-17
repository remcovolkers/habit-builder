// De introductie voor nieuwe gebruikers (docs/ONBOARDING.md): is ze al gezien, en staat de eenmalige tip op Vandaag nog klaar?
// Alles staat lokaal op dit apparaat; er gaat niets naar de server en er komt geen nieuw gegeven bij.
const SEEN_KEY = 'hb-intro-seen';
const TIP_KEY = 'hb-first-tip';

export const INTRO_HASH = '#/welkom/1';
/** Het hoogste aantal stappen: de stap "installeer de app" valt weg als de app al geïnstalleerd is (zie ui/views/welcome.js). */
export const INTRO_MAX_STEPS = 4;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* opslag geblokkeerd: dan komt de introductie bij de volgende start nog een keer, tot er een habit is */
  }
}

export const introSeen = () => read(SEEN_KEY) === '1';
export const markIntroSeen = () => write(SEEN_KEY, '1');

/** Moet de introductie nu vanzelf komen? Alleen voor wie nog geen habits heeft en haar nog niet zag. */
export const introDue = ({ habitCount, seen = introSeen() }) => !seen && habitCount === 0;

/** Na de eerste habit uit de introductie staat op Vandaag één keer een rustige tip. */
export const firstTipPending = () => read(TIP_KEY) === '1';
export const setFirstTipPending = () => write(TIP_KEY, '1');
export const clearFirstTip = () => write(TIP_KEY, null);
