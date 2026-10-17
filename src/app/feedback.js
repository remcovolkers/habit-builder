// Feedback: wat een bericht moet zijn om verstuurd te worden, de context die meegaat, wanneer we er een keer om vragen, en de lijst voor de beheerder. Puur.
import { FEEDBACK_BODY_MAX, FEEDBACK_KINDS } from '../domain/feedback.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Een soort kiezen en iets schrijven. Geeft [{ field, code }]; leeg = geldig. */
export function validateFeedback({ kind, body }) {
  const errors = [];
  if (!FEEDBACK_KINDS.includes(kind)) errors.push({ field: 'kind', code: 'required' });
  const text = String(body ?? '').trim();
  if (text === '') errors.push({ field: 'body', code: 'required' });
  else if (text.length > FEEDBACK_BODY_MAX) errors.push({ field: 'body', code: 'too_long' });
  return errors;
}

/** De pagina waarop je zat, zonder zoekopdracht (die kan een datum of een uitnodigingscode bevatten), hoogstens 100 tekens. */
export function routeForFeedback(hash) {
  const path = String(hash ?? '').split('?')[0];
  // een uitnodigingslink bevat een geheime code: die gaat nooit mee
  const cleaned = path.replace(/^(#\/vrienden\/uitnodiging\/).*/, '$1…');
  return cleaned.slice(0, 100);
}

/**
 * Vragen we nu een keer om feedback (de rustige kaart op Vandaag)? Pas na zeven dagen gebruik, niet als er net een bericht is gestuurd
 * (negentig dagen rust), en na "Niet nu" pas weer na achtentwintig dagen. Alle tijden in milliseconden; null = nooit.
 */
export const INVITE_AFTER_DAYS = 7;
export const INVITE_SNOOZE_DAYS = 28;
export const INVITE_AFTER_SENT_DAYS = 90;

export function inviteDue({ now, firstRun, lastAsked = null, lastSent = null }) {
  if (firstRun === null || firstRun === undefined || now - firstRun < INVITE_AFTER_DAYS * DAY_MS) return false;
  if (lastSent !== null && now - lastSent < INVITE_AFTER_SENT_DAYS * DAY_MS) return false;
  if (lastAsked !== null && now - lastAsked < INVITE_SNOOZE_DAYS * DAY_MS) return false;
  return true;
}

/** De lijst voor de beheerder, gefilterd: status ('new' | 'done' | 'all') en soort ('all' of een van FEEDBACK_KINDS). */
export function filterFeedback(items, { status = 'all', kind = 'all' } = {}) {
  return items.filter((item) => (status === 'all' || item.status === status) && (kind === 'all' || item.kind === kind));
}

export const countByStatus = (items) => ({
  new: items.filter((item) => item.status === 'new').length,
  done: items.filter((item) => item.status === 'done').length,
  all: items.length,
});
