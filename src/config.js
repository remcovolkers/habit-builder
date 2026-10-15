// Publieke configuratie. De publishable key is bedoeld om in de client te staan;
// de echte beveiliging zit in Row Level Security (zie supabase/migrations).
// Zet hier NOOIT de service-role key neer.
export const config = Object.freeze({
  supabaseUrl: 'https://rbsqafttotdaakpwtjmh.supabase.co',
  supabasePublishableKey: 'sb_publishable_urCSdZ4XH3w1ojZLne7WbA_y9rnK7zq',
  // Publieke VAPID-sleutel voor de ochtendherinnering (de privésleutel staat alleen als secret in Supabase).
  // Leeg = de herinnering is nog niet ingericht en de knop in Instellingen blijft verborgen. Zie docs/M7-SETUP.md.
  vapidPublicKey: '',
});
