// De Supabase-kant van de agenda: de Edge Function calendar-feed haalt het geheime iCal-adres voor ons op (docs/AGENDA.md). Geen DOM, geen browser-API's.

const REASONS = ['not_found', 'unavailable', 'too_large', 'not_calendar', 'timeout'];

/**
 * Laat de server de agenda ophalen. Geeft { ok: true, text } of { ok: false, reason }:
 * 'not_found' (het adres bestaat niet meer: opnieuw gemaakt of ingetrokken), 'unavailable' (Google geeft iets anders), 'too_large', 'not_calendar',
 * 'timeout', 'invalid' (de server wil dit adres niet), 'signed_out' (geen geldige sessie), 'not_deployed' (de functie bestaat niet),
 * 'not_configured' (de functie mist een instelling), 'offline' of 'unknown'.
 */
export async function fetchFeedText({ client, url }) {
  const { data, error } = await client.functions.invoke('calendar-feed', { body: { url } });
  if (error) {
    if (error.name === 'FunctionsFetchError') return { ok: false, reason: 'offline' };
    const status = Number(error.context?.status ?? 0);
    if (status === 404) return { ok: false, reason: 'not_deployed' };
    if (status === 401) return { ok: false, reason: 'signed_out' };
    if (status === 400) return { ok: false, reason: 'invalid' };
    if (status === 500) return { ok: false, reason: 'not_configured' };
    return { ok: false, reason: 'unknown' };
  }
  if (data?.ok === true && typeof data.ics === 'string') return { ok: true, text: data.ics };
  return { ok: false, reason: REASONS.includes(data?.reason) ? data.reason : 'unknown' };
}
