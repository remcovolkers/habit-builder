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
// afronden of overslaan: een onthouden "terug na het inloggen" is dan niet meer aan de orde
export const markIntroSeen = () => { write(SEEN_KEY, '1'); write(RETURN_KEY, null); };

/** Moet de introductie nu vanzelf komen? Alleen voor wie nog geen habits heeft en haar nog niet zag. */
export const introDue = ({ habitCount, seen = introSeen() }) => !seen && habitCount === 0;

/** Na de eerste habit uit de introductie staat op Vandaag één keer een rustige tip. */
export const firstTipPending = () => read(TIP_KEY) === '1';
export const setFirstTipPending = () => write(TIP_KEY, '1');
export const clearFirstTip = () => write(TIP_KEY, null);

// Vanuit de introductie inloggen: na het inloggen kom je weer bij de introductie (ook na de omweg via Google, waarbij de pagina opnieuw laadt).
// De bestemming wordt even onthouden en vervalt vanzelf: wie niet meteen inlogt, wordt later niet onverwacht teruggestuurd.
const RETURN_KEY = 'hb-after-login';
export const RETURN_TTL_MS = 10 * 60_000;

export function rememberReturn(hash, now = Date.now()) {
  write(RETURN_KEY, JSON.stringify({ hash, at: now }));
}

/** De onthouden bestemming (en vergeet haar), of null als er geen is of ze is verlopen. */
export function takeReturn(now = Date.now()) {
  const raw = read(RETURN_KEY);
  write(RETURN_KEY, null);
  try {
    const { hash, at } = JSON.parse(raw ?? 'null') ?? {};
    return typeof hash === 'string' && hash.startsWith('#/') && now - at <= RETURN_TTL_MS ? hash : null;
  } catch {
    return null;
  }
}

export const peekReturn = (now = Date.now()) => {
  const raw = read(RETURN_KEY);
  if (raw === null) return false;
  try {
    const { at } = JSON.parse(raw) ?? {};
    return now - at <= RETURN_TTL_MS;
  } catch {
    return false;
  }
};

/**
 * Waar ga je heen na het inloggen? Terug naar waar je vandaan kwam, behalve naar de introductie als dit account al habits heeft
 * (je meldde je aan met een bestaand account op een nieuw apparaat: dan is de introductie niet meer voor jou).
 */
export function afterLoginHash({ back, habitCount }) {
  if (back === INTRO_HASH && habitCount > 0) {
    markIntroSeen();
    return '#/today';
  }
  return back;
}

/** "Heb je al een account? Log in" past alleen bij wie niet ingelogd is. Bij 'restoring' staat er al een sessie (de inlog wordt hersteld), dus ook dan niet. */
export const showLoginHint = (accountStatus) => accountStatus === 'anonymous';
