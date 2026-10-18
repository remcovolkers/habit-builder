// De Supabase-kant van de e-mailherinnering voor de week- en maandreview: de voorkeur in Instellingen (functies uit
// supabase/migrations/0008_review_mails.sql) en de afmeldcode uit de mail (Edge Function send-review-mails). Geen DOM, geen opslag.

/** Wil dit account de mail ontvangen? Gooit nooit: zonder antwoord (offline, migratie nog niet uitgevoerd) is het antwoord `null`. */
export async function fetchReviewMailPref(getClient) {
  try {
    const { data, error } = await (await getClient()).rpc('review_mail_pref');
    return error || typeof data !== 'boolean' ? null : data;
  } catch {
    return null;
  }
}

/** Zet de mail aan of uit. Geeft de nieuwe stand terug, of `null` als het niet lukte. */
export async function setReviewMailPref(getClient, on) {
  try {
    const { data, error } = await (await getClient()).rpc('review_mail_set_pref', { p_on: on === true });
    return error || typeof data !== 'boolean' ? null : data;
  } catch {
    return null;
  }
}

/**
 * Afmelden (of met `undo` weer aanmelden) met de code uit de mail, zonder in te loggen. De code is ondertekend door de server.
 * Geeft 'ok', 'invalid' (de code klopt niet) of 'failed' (geen verbinding of de functie ontbreekt).
 */
export async function unsubscribeWithToken({ supabaseUrl, token, undo = false, fetchImpl = globalThis.fetch }) {
  try {
    const response = await fetchImpl(`${supabaseUrl}/functions/v1/send-review-mails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsubscribe: token, undo: undo === true }),
    });
    if (response.ok) return 'ok';
    return response.status === 400 ? 'invalid' : 'failed';
  } catch {
    return 'failed';
  }
}
