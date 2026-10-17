// De Supabase-kant van de feedbackhub: de functies uit supabase/migrations/0007_feedback.sql. Geen DOM, geen opslag.
// Versturen werkt ook zonder account. Lezen, afhandelen en verwijderen kan alleen de beheerder (de server controleert dat; de app toont het alleen aan hem).

import { FEEDBACK_BODY_MAX, FEEDBACK_KINDS } from '../domain/feedback.js';

export { FEEDBACK_BODY_MAX, FEEDBACK_KINDS };

/**
 * Foutcodes die de UI kan vertalen: 'invalid' (soort of tekst klopt niet), 'too_many_requests' (het tempo van de server), 'offline',
 * 'unavailable' (de server kent de functie niet: de migratie is nog niet uitgevoerd) en 'unknown'.
 */
export class FeedbackError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'FeedbackError';
    this.code = code;
    this.cause = cause;
  }
}

export function toFeedbackError(error) {
  if (error instanceof FeedbackError) return error;
  const message = String(error?.message ?? '');
  const status = Number(error?.status ?? 0);
  if (message === 'invalid_feedback') return new FeedbackError('invalid', error);
  if (message === 'too_many_requests' || status === 429) return new FeedbackError('too_many_requests', error);
  if (error?.code === 'PGRST202' || error?.code === '42883' || status === 404) return new FeedbackError('unavailable', error);
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message) || error?.name === 'TypeError') return new FeedbackError('offline', error);
  return new FeedbackError('unknown', error);
}

/** `getClient` geeft (een belofte van) de Supabase-client; die wordt pas gevraagd als er echt iets verstuurd wordt. */
async function call(getClient, fn, args = {}) {
  let result;
  try {
    result = await (await getClient()).rpc(fn, args);
  } catch (error) {
    throw toFeedbackError(error);
  }
  if (result.error) throw toFeedbackError(result.error);
  return result.data;
}

/** Verstuurt een bericht. `contact`: de afzender mag gemaild worden (alleen als hij is ingelogd; de server pakt het adres van het account). */
export async function sendFeedback(getClient, { kind, body, route = null, version = null, contact = false }) {
  await call(getClient, 'feedback_send', { p_kind: kind, p_body: body, p_route: route, p_version: version, p_contact: contact === true });
}

/** Is de aanroeper beheerder? Gooit nooit: elke fout is "nee" (ook een server die de functie nog niet kent). */
export async function fetchIsAdmin(getClient) {
  try {
    return (await call(getClient, 'app_is_admin')) === true;
  } catch {
    return false;
  }
}

/** De berichten, nieuwste eerst (alleen voor een beheerder; voor een ander een lege lijst). */
export async function listFeedback(getClient) {
  const rows = await call(getClient, 'feedback_list');
  return Array.isArray(rows) ? rows : [];
}

export const setFeedbackStatus = async (getClient, id, status) => (await call(getClient, 'feedback_set_status', { p_id: id, p_status: status })) === true;
export const deleteFeedback = async (getClient, id) => (await call(getClient, 'feedback_delete', { p_id: id })) === true;
