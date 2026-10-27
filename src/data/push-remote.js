// De Supabase-kant van de ochtendherinnering: tabel public.push_subscriptions en de Edge Function send-reminders
// (zie supabase/migrations/0002_push.sql en supabase/functions/send-reminders). Geen DOM, geen browser-API's.

const TABLE = 'push_subscriptions';

function fail(error, fallback) {
  const wrapped = new Error(error?.message ?? fallback);
  wrapped.code = error?.code;
  wrapped.status = Number(error?.status ?? 0);
  return wrapped;
}

/** Registreert dit apparaat (of werkt het bij). `subscription` is wat `pushSubscription.toJSON()` geeft. */
export async function saveSubscription({ client, userId, subscription, remindTime, timezone, summary, lastNotifiedDate }) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error('onvolledig push-abonnement');
  const row = { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, remind_time: remindTime, timezone, summary };
  // alleen meesturen als het tijdstip is ingesteld of gewijzigd (zie rearmDate); een gewone bijwerking van de samenvatting laat het staan
  if (lastNotifiedDate !== undefined) row.last_notified_date = lastNotifiedDate;
  const { error } = await client.from(TABLE).upsert(row, { onConflict: 'user_id,endpoint' });
  if (error) throw fail(error, 'Opslaan mislukt');
}

/** Registreert de Android-app op dit toestel (of werkt hem bij). `token` is het FCM-token; de server stuurt er via Firebase naartoe. */
export async function saveAppDevice({ client, userId, token, remindTime, timezone, summary, lastNotifiedDate }) {
  if (!token || typeof token !== 'string') throw new Error('geen FCM-token');
  const row = { user_id: userId, platform: 'android', fcm_token: token, remind_time: remindTime, timezone, summary };
  if (lastNotifiedDate !== undefined) row.last_notified_date = lastNotifiedDate; // zie saveSubscription
  const { error } = await client.from(TABLE).upsert(row, { onConflict: 'user_id,fcm_token' });
  if (error) throw fail(error, 'Opslaan mislukt');
}

export async function deleteAppDevice({ client, token }) {
  const { error } = await client.from(TABLE).delete().eq('fcm_token', token);
  if (error) throw fail(error, 'Verwijderen mislukt');
}

/** Wijzigt tijdstip, tijdzone en/of samenvatting van dit apparaat. */
export async function updateSubscription({ client, endpoint, patch }) {
  const columns = {};
  if (patch.remindTime !== undefined) columns.remind_time = patch.remindTime;
  if (patch.timezone !== undefined) columns.timezone = patch.timezone;
  if (patch.summary !== undefined) columns.summary = patch.summary;
  const { error } = await client.from(TABLE).update(columns).eq('endpoint', endpoint);
  if (error) throw fail(error, 'Bijwerken mislukt');
}

export async function deleteSubscription({ client, endpoint }) {
  const { error } = await client.from(TABLE).delete().eq('endpoint', endpoint);
  if (error) throw fail(error, 'Verwijderen mislukt');
}

/**
 * Laat de server nu een testmelding naar dit apparaat sturen.
 * Geeft { ok: true } of { ok: false, reason }: 'not_deployed' (functie bestaat niet), 'not_configured' (geheimen ontbreken),
 * 'no_device' (geen abonnement gevonden), 'push_failed' (de push-dienst weigerde het) of 'unknown'.
 * Een browser wijst zichzelf aan met zijn `endpoint`, de Android-app met zijn FCM-`token`.
 */
export async function sendTestReminder({ client, endpoint, token, delaySeconds = 0 }) {
  const device = endpoint === undefined ? { token } : { endpoint };
  const { data, error } = await client.functions.invoke('send-reminders', { body: delaySeconds > 0 ? { test: true, ...device, delaySeconds } : { test: true, ...device } });
  if (error) {
    const status = Number(error.context?.status ?? 0);
    if (status === 404) {
      const body = await error.context?.json?.().catch(() => null);
      return { ok: false, reason: body?.error === 'geen apparaat gevonden' ? 'no_device' : 'not_deployed' };
    }
    if (status === 500) return { ok: false, reason: 'not_configured' };
    return { ok: false, reason: 'unknown' };
  }
  if (data?.scheduled === true) return { ok: true, scheduled: true }; // komt over `delaySeconds` seconden, vanaf de server
  if (data?.sent > 0) return { ok: true };
  return { ok: false, reason: data?.removed > 0 ? 'no_device' : 'push_failed' };
}
