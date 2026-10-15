// Gedeelde app-status: de repository, de instellingen en de huidige "vandaag" (met dagwissel).
// Schermen luisteren naar 'changed' om opnieuw te laden na elke wijziging of dagwissel.
import { todayFor } from '../domain/dates.js';
import { applyTheme } from './theme.js';

const events = new EventTarget();

export const state = { repo: null, settings: null, today: null };

function recomputeToday(now = new Date()) {
  const next = todayFor(now, state.settings.timezone, state.settings.dayStartHour);
  const changed = next !== state.today;
  state.today = next;
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
