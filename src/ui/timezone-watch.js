// Staat het toestel op een andere tijdzone dan de app (je bent op reis, of verhuisd)? Dan vraagt de app één keer of hij die moet overnemen.
// Het antwoord "Zo laten" wordt onthouden voor die tijdzone, zodat de vraag niet bij elk openen terugkomt.
import { detectTimeZone } from '../data/repository.js';
import { timezoneLabel, timezoneToOffer } from '../app/timezone.js';
import { nl } from '../content/nl.js';
import { openDialog } from './components/dialog.js';
import { saveSettings, state } from './state.js';

const DECLINED_KEY = 'hb-tz-declined';

const readDeclined = () => { try { return localStorage.getItem(DECLINED_KEY); } catch { return null; } };
const writeDeclined = (zone) => { try { localStorage.setItem(DECLINED_KEY, zone); } catch { /* opslag geblokkeerd: dan vraagt hij vaker */ } };

let asking = false;

/** Vraagt zo nodig om de tijdzone over te nemen. Geeft de voorgestelde tijdzone, of null als er niets te vragen viel. */
export function offerTimezone({ device = detectTimeZone(), ask = openDialog } = {}) {
  const zone = timezoneToOffer({ device, saved: state.settings?.timezone, declined: readDeclined() });
  // niet midden in iets anders: een open venster of de introductie wacht tot de volgende keer
  if (!zone || asking || globalThis.document?.querySelector?.('dialog[open]') || globalThis.location?.hash?.startsWith('#/welkom')) return null;
  asking = true;
  let accepted = false;
  ask({
    title: nl.timezone.title,
    description: nl.timezone.text(timezoneLabel(zone), timezoneLabel(state.settings.timezone)),
    actions: [{ label: nl.timezone.accept(timezoneLabel(zone)), variant: 'primary', onClick: async () => { accepted = true; await saveSettings({ timezone: zone }); } }],
    cancelLabel: nl.timezone.keep,
    onClose: () => {
      asking = false;
      if (!accepted) writeDeclined(zone);
    },
  });
  return zone;
}

export function initTimezoneWatch() {
  offerTimezone();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) offerTimezone(); });
}
