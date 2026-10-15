// Gebruikersinstellingen: standaardwaarden en validatie (pure logica).
import { DEFAULT_DAY_START_HOUR, MAX_DAY_START_HOUR } from '../domain/constants.js';

export const DISPLAY_NAME_MAX = 30;

export function defaultSettings(timezone) {
  return { id: 'user', timezone, dayStartHour: DEFAULT_DAY_START_HOUR, displayName: '' };
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
  if (settings.displayName != null && String(settings.displayName).trim().length > DISPLAY_NAME_MAX) {
    errors.push({ field: 'displayName', code: 'too_long' });
  }
  return errors;
}
