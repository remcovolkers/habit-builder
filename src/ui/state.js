// Gedeelde app-status: de repository, de instellingen en de huidige "vandaag" (met dagwissel).
// Schermen luisteren naar 'changed' om opnieuw te laden na elke wijziging of dagwissel.
import { localNow, todayFor } from '../domain/dates.js';
import { applyTheme } from './theme.js';

const events = new EventTarget();

export const state = { repo: null, settings: null, today: null };

/** De lokale muurtijd nu, 'YYYY-MM-DDTHH:MM' (voor het openen en sluiten van reviews). */
export const wallClockNow = (now = new Date()) => localNow(now, state.settings.timezone);

// Een review opent om 00:00 en sluit om 12:00 (domain/reviews.js): schermen tekenen opnieuw als de halve dag omslaat, ook als de dagwissel (04:00) later is.
let clockHalf = null;
const halfOfDay = (now) => { const t = wallClockNow(now); return `${t.slice(0, 10)}${t.slice(11, 13) >= '12' ? 'pm' : 'am'}`; };

function recomputeToday(now = new Date()) {
  const next = todayFor(now, state.settings.timezone, state.settings.dayStartHour);
  const half = halfOfDay(now);
  const changed = next !== state.today || (clockHalf !== null && half !== clockHalf);
  state.today = next;
  clockHalf = half;
  return changed;
}

export async function initState(repo) {
  state.repo = repo;
  state.settings = await repo.getSettings();
  applyTheme(state.settings.theme);
  recomputeToday();

  // Blijft de app over de dagwissel heen openstaan, dan verspringt "vandaag" vanzelf.
  setInterval(() => recomputeToday() && notifyChanged(), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && recomputeToday()) notifyChanged();
  });
}

export async function saveSettings(patch) {
  state.settings = await state.repo.saveSettings(patch);
  applyTheme(state.settings.theme);
  recomputeToday();
  notifyChanged();
}

/** Na een import of andere ingreep die de instellingen kan hebben vervangen. */
export async function reloadSettings() {
  state.settings = await state.repo.getSettings();
  applyTheme(state.settings.theme);
  recomputeToday();
  notifyChanged();
}

export const notifyChanged = () => events.dispatchEvent(new Event('changed'));

/** Geeft een functie terug om het luisteren te stoppen. */
export function onChanged(listener) {
  events.addEventListener('changed', listener);
  return () => events.removeEventListener('changed', listener);
}
