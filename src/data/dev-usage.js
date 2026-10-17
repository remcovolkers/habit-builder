// De teller voor de ontwikkelaar (supabase/migrations/0006_dev_usage.sql): hoeveel mensen buiten jou gebruiken de app?
// De server geeft alleen antwoord aan een beheerder. Geen DOM, geen opslag.

/**
 * `getClient` geeft (een belofte van) de Supabase-client. Geeft { users, activeToday } of null: je bent geen beheerder, er is geen verbinding of
 * de migratie is niet uitgevoerd. Een mislukte telling mag nooit iets in de app verstoren, dus er wordt nooit gegooid.
 */
export async function fetchDevUsage(getClient) {
  try {
    const { data, error } = await (await getClient()).rpc('dev_usage');
    if (error || !data) return null;
    const users = Number(data.users);
    const activeToday = Number(data.active_today);
    return Number.isInteger(users) && Number.isInteger(activeToday) ? { users, activeToday } : null;
  } catch {
    return null;
  }
}
