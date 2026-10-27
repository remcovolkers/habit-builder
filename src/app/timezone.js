// De tijdzone volgt het toestel. Zonder aanwijzing van de gebruiker neemt de app hem niet stilzwijgend over (een melding komt op jouw lokale tijd, en
// de dag begint bij jouw tijdzone): hij stelt voor, en onthoudt een "zo laten".
import { isValidTimeZone } from './settings.js';

/**
 * De tijdzone die de app moet voorstellen over te nemen, of null: het toestel staat anders dan de app, het is een geldige tijdzone, en de gebruiker
 * heeft dit niet al eens afgewezen.
 */
export function timezoneToOffer({ device, saved, declined = null }) {
  if (!isValidTimeZone(device)) return null;
  if (device === saved || device === declined) return null;
  return device;
}

/** Een leesbare naam: "Europe/Amsterdam" wordt "Amsterdam", "America/Argentina/Buenos_Aires" wordt "Buenos Aires". */
export function timezoneLabel(zone) {
  const city = String(zone ?? '').split('/').pop().replace(/_/g, ' ');
  return city || String(zone ?? '');
}
