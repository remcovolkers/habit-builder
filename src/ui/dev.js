// Ontwikkelaarsopties: gereedschap dat alleen jij nodig hebt (bv. testmeldingen). Standaard uit en niet te vinden voor anderen.
// Aanzetten: zeven keer tikken op de versieregel onderaan Instellingen, of de app openen met ?dev=1 (?dev=0 zet het uit).
// Het is een schakelaar in de app en geen beveiliging: wat erachter zit kan alleen jouw eigen gegevens raken.
const KEY = 'hb-dev';
const events = new EventTarget();

export function isDev() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDev(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* opslag geblokkeerd: dan blijft het uit */
  }
  events.dispatchEvent(new Event('dev'));
}

/** Geeft een functie terug om het luisteren te stoppen. */
export function onDevChanged(listener) {
  events.addEventListener('dev', listener);
  return () => events.removeEventListener('dev', listener);
}

export const TAPS_TO_ENABLE = 7;
const TAP_WINDOW_MS = 4000;

/**
 * Telt tikken op de versieregel. Geeft een functie die je bij elke tik aanroept en { toggled, left } teruggeeft:
 * `left` = nog zoveel tikken (alleen vanaf de derde tik getoond, zoals Android), `toggled` = de optie is net omgezet.
 */
export function createTapCounter({ now = () => Date.now() } = {}) {
  let taps = 0;
  let last = 0;
  return () => {
    const t = now();
    taps = t - last > TAP_WINDOW_MS ? 1 : taps + 1;
    last = t;
    if (taps >= TAPS_TO_ENABLE) {
      taps = 0;
      setDev(!isDev());
      return { toggled: true, left: 0 };
    }
    return { toggled: false, left: taps >= 3 ? TAPS_TO_ENABLE - taps : null };
  };
}
