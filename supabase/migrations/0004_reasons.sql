-- Habit Builder · redenen bij taken die bleven liggen (collectie 'reasons')
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. (lokaal doet `npm run db:start` het zelf)
-- Veilig om opnieuw uit te voeren (idempotent).
--
-- Voegt de collectie `reasons` toe aan de toegestane collecties van `records`. Verder verandert er niets:
-- de app bewaart de reden als gewoon record, per taak per dag.

alter table public.records drop constraint if exists records_collection_known;
alter table public.records add constraint records_collection_known check (
  collection in ('settings', 'habits', 'checkIns', 'pauses', 'dayPlans', 'achievements', 'ratings', 'reviews', 'reasons')
);
