// Gebruikersinstellingen: standaardwaarden en validatie (pure logica).
import { DEFAULT_DAY_START_HOUR, MAX_DAY_START_HOUR } from '../domain/constants.js';
import { DEFAULT_THEME, isTheme } from './themes.js';

export const DISPLAY_NAME_MAX = 30;

export function defaultSettings(timezone) {
  return { id: 'user', timezone, dayStartHour: DEFAULT_DAY_START_HOUR, displayName: '', nameAsked: false, theme: DEFAULT_THEME };
}

/**
 * Een voorstel voor de naam uit de gegevens die de inlogdienst meestuurt (Google geeft given_name / full_name).
 * Geeft de voornaam, of '' als er niets bruikbaars is (bij inloggen met alleen e-mail).
 */
export function suggestDisplayName(metadata) {
  const given = typeof metadata?.given_name === 'string' ? metadata.given_name.trim() : '';
  const full = [metadata?.full_name, metadata?.name].find((value) => typeof value === 'string' && value.trim() !== '');
  const name = given || (full ? full.trim().split(/\s+/)[0] : '');
  return name.slice(0, DISPLAY_NAME_MAX);
}

/** Vragen we de naam? Alleen als er nog geen is en we het nog niet eerder hebben gevraagd (ook niet op een ander apparaat). */
export function shouldAskName(settings) {
  return String(settings.displayName ?? '').trim() === '' && settings.nameAsked !== true;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Geeft [{ field, code }]; leeg = geldig. */
export function validateSettings(settings) {
  const errors = [];
  if (!isValidTimeZone(settings.timezone)) errors.push({ field: 'timezone', code: 'invalid' });
  const hour = settings.dayStartHour;
  if (!Number.isInteger(hour) || hour < 0 || hour > MAX_DAY_START_HOUR) errors.push({ field: 'dayStartHour', code: 'invalid' });
  if (settings.theme != null && !isTheme(settings.theme)) errors.push({ field: 'theme', code: 'invalid' });
  if (settings.displayName != null && String(settings.displayName).trim().length > DISPLAY_NAME_MAX) {
    errors.push({ field: 'displayName', code: 'too_long' });
  }
  return errors;
}
