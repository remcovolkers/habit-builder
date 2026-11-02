// De agenda van het toestel, alleen in de Android-app (docs/AGENDA.md): de brug naar de eigen plugin DeviceCalendar
// (android/.../calendar/DeviceCalendarPlugin.java). De telefoon rekent herhalingen en tijdzones zelf uit; wij lezen alleen wat er in de komende en vorige
// dagen staat. Niets hiervan verlaat het toestel. In de browser doet dit niets.
import { isNativeApp, nativePlugin } from '../native.js';

/** De plugin, of null in de browser. */
const plugin = () => (isNativeApp() ? nativePlugin('DeviceCalendar') : null);

export const deviceCalendarAvailable = () => plugin() !== null;

const known = (state) => (state === 'granted' || state === 'denied' ? state : 'prompt');

/** 'granted' | 'denied' | 'prompt' (nog niet gevraagd) | 'unavailable' (geen app). Vraagt niets. */
export async function deviceCalendarAccess() {
  const native = plugin();
  if (!native) return 'unavailable';
  try {
    return known((await native.checkPermissions())?.calendar);
  } catch {
    return 'unavailable';
  }
}

/** Vraagt de toestemming om de agenda te lezen (Android toont zijn eigen scherm). Geeft dezelfde waarden als deviceCalendarAccess. */
export async function requestDeviceCalendarAccess() {
  const native = plugin();
  if (!native) return 'unavailable';
  try {
    return known((await native.requestPermissions({ permissions: ['calendar'] }))?.calendar);
  } catch {
    return 'unavailable';
  }
}

/** De afspraken tussen twee momenten (ms), als [{ id, title, begin, end, allDay }]. Leeg als er geen toestemming of geen app is. */
export async function readDeviceEvents({ begin, end }) {
  const native = plugin();
  if (!native) return [];
  const { events } = await native.getEvents({ begin, end });
  return Array.isArray(events) ? events : [];
}
