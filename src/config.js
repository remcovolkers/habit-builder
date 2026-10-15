// Publieke configuratie. De publishable key is bedoeld om in de client te staan;
// de echte beveiliging zit in Row Level Security (zie supabase/migrations).
// Zet hier NOOIT de service-role key neer.

// Twee Supabase-projecten: productie (de echte gebruikers) en ontwikkeling (testaccounts, nieuwe features).
// De app kiest op basis van waar hij draait (zie pickEnvironment): alles wat niet op de productie-site draait
// (localhost, het IP-adres van je computer) praat met het ontwikkelproject. Zo raakt een feature-versie nooit
// de echte gegevens. Zie docs/DEV-OMGEVING.md. Is het ontwikkelproject (nog) niet ingevuld, dan geldt productie.
export const PRODUCTION_HOST = 'remcovolkers.github.io';

const environments = Object.freeze({
  production: Object.freeze({
    supabaseUrl: 'https://rbsqafttotdaakpwtjmh.supabase.co',
    supabasePublishableKey: 'sb_publishable_urCSdZ4XH3w1ojZLne7WbA_y9rnK7zq',
    // Publieke VAPID-sleutel voor de ochtendherinnering (de privésleutel staat alleen als secret in Supabase).
    // Leeg = de herinnering is nog niet ingericht en de knop in Instellingen blijft verborgen. Zie docs/M7-SETUP.md.
    vapidPublicKey: 'BD3G0l0Him4c4U6xidaHdMNmhu_kJ_0nzN4D9XzR90033-i_5YX0truvEJAi391OVvlFp5XqGUL9uthy4e3gHNs',
  }),
  development: Object.freeze({
    supabaseUrl: '',
    supabasePublishableKey: '',
    // Het ontwikkelproject heeft geen herinnering-functie: de knop blijft daar verborgen.
    vapidPublicKey: '',
  }),
});

/**
 * Kiest de omgeving op basis van de hostnaam van de pagina. Alleen de productie-site (en een omgeving zonder pagina, zoals
 * de tests en de server) krijgt productie; elke andere host krijgt ontwikkeling, mits die is ingevuld.
 */
export function pickEnvironment(hostname, envs = environments) {
  const development = envs.development;
  const isProductionHost = !hostname || hostname === PRODUCTION_HOST;
  const useDevelopment = !isProductionHost && development.supabaseUrl !== '' && development.supabasePublishableKey !== '';
  return { environment: useDevelopment ? 'development' : 'production', ...(useDevelopment ? development : envs.production) };
}

export const config = Object.freeze({
  appVersion: '1.0',
  ...pickEnvironment(globalThis.location?.hostname),
});
