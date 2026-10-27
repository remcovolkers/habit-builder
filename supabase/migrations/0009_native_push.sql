-- Habit Builder · Android-app · ochtendherinnering via Firebase Cloud Messaging (FCM)
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. Idempotent: opnieuw draaien kan.
--
-- De Android-app krijgt geen Web Push maar een FCM-token. Dat past in dezelfde tabel als de browser-abonnementen (0002_push.sql):
-- de logica voor "aan de beurt", "vandaag al gemeld" en de samenvatting blijft gedeeld.
--
-- Een rij is nu óf een webabonnement (platform 'web': endpoint + sleutels, zoals voorheen) óf een app-toestel (platform 'android': fcm_token).
-- Alleen uitbreiden: de huidige app schrijft nog steeds webrijen (platform krijgt zelf de standaardwaarde 'web'), dus een oudere app-versie
-- blijft werken. Zie docs/WERKWIJZE.md, "Wijzigingen aan de database".

alter table public.push_subscriptions add column if not exists platform  text not null default 'web';
alter table public.push_subscriptions add column if not exists fcm_token text;

-- een app-rij heeft geen webadres en geen sleutels
alter table public.push_subscriptions alter column endpoint drop not null;
alter table public.push_subscriptions alter column p256dh   drop not null;
alter table public.push_subscriptions alter column auth     drop not null;

-- de lengtecontroles gelden nog steeds, maar mogen leeg zijn
alter table public.push_subscriptions drop constraint if exists push_endpoint_https;
alter table public.push_subscriptions add  constraint push_endpoint_https
  check (endpoint is null or (endpoint like 'https://%' and char_length(endpoint) <= 1000));

alter table public.push_subscriptions drop constraint if exists push_keys_length;
alter table public.push_subscriptions add  constraint push_keys_length
  check ((p256dh is null or char_length(p256dh) <= 200) and (auth is null or char_length(auth) <= 100));

alter table public.push_subscriptions drop constraint if exists push_fcm_token_length;
alter table public.push_subscriptions add  constraint push_fcm_token_length
  check (fcm_token is null or char_length(fcm_token) between 1 and 500);

-- precies één vorm per rij
alter table public.push_subscriptions drop constraint if exists push_platform_shape;
alter table public.push_subscriptions add  constraint push_platform_shape check (
  (platform = 'web'     and endpoint is not null and p256dh is not null and auth is not null and fcm_token is null)
  or
  (platform = 'android' and fcm_token is not null and endpoint is null and p256dh is null and auth is null)
);

-- één rij per toestel per gebruiker (voor webrijen bestaat push_unique_per_user op user_id + endpoint al)
alter table public.push_subscriptions drop constraint if exists push_unique_fcm_per_user;
alter table public.push_subscriptions add  constraint push_unique_fcm_per_user unique (user_id, fcm_token);

-- RLS, de trigger (updated_at, hoogstens 10 apparaten) en de rechten uit 0002 gelden voor alle rijen en blijven ongewijzigd.
