-- Habit Builder · losse afspraken (collectie 'appointments')
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. (lokaal doet `npm run db:start` het zelf)
-- Veilig om opnieuw uit te voeren (idempotent).
--
-- Voegt de collectie `appointments` toe aan de toegestane collecties van `records`. Verder verandert er niets:
-- de app bewaart een losse afspraak als gewoon record. Voer dit uit VÓÓR de app met losse afspraken wordt uitgerold:
-- zonder deze regel weigert de server de records en blijven ze alleen op het toestel staan.

alter table public.records drop constraint if exists records_collection_known;
alter table public.records add constraint records_collection_known check (
  collection in ('settings', 'habits', 'checkIns', 'pauses', 'dayPlans', 'achievements', 'ratings', 'reviews', 'reasons', 'appointments')
);
