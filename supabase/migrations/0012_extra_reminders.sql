-- Habit Builder · extra meldingen: de avondmelding en de weekreview-meldingen
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. Idempotent: opnieuw draaien kan.
--
-- Naast de ochtendherinnering (remind_time, last_notified_date) komen er drie meldingen op vaste momenten, per apparaat aan of uit te zetten:
--   avond            elke dag 23:00     "Laatste sprintje?" als er nog taken open staan, anders "Wil je je dag afsluiten?"
--   review open      zondag 18:00       "Weekreview staat vanaf nu open"
--   review sluit     maandag 23:30      "Weekreview staat nog open" (de review sluit maandag 23:59)
--
-- Alleen uitbreiden: de huidige app schrijft deze kolommen niet, dus een oudere appversie blijft werken (alles blijft uit). Wat er gemeld moet worden,
-- staat in de samenvatting die de app al meestuurt (summary.days); de server kent geen habitnamen. Zie docs/WERKWIJZE.md, "Wijzigingen aan de database".
--
-- De drie last_*-kolommen zijn de claims: de datum waarop dat soort melding het laatst is gemeld, zodat twee gelijktijdige runs niets dubbel sturen.

alter table public.push_subscriptions add column if not exists notify_evening        boolean not null default false;
alter table public.push_subscriptions add column if not exists notify_review         boolean not null default false;
alter table public.push_subscriptions add column if not exists last_evening_date     date;
alter table public.push_subscriptions add column if not exists last_review_open      date;
alter table public.push_subscriptions add column if not exists last_review_closing   date;

-- RLS, de trigger (updated_at, hoogstens 10 apparaten) en de rechten uit 0002 gelden voor alle kolommen en blijven ongewijzigd.
-- De samenvatting mag nog steeds hoogstens 4000 bytes zijn (push_summary_size); zeven dagen met acht getallen blijft daar ver onder.
