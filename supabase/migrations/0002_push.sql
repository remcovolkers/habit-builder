-- Habit Builder · M7 · ochtendherinnering (Web Push)
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. Idempotent: opnieuw draaien kan.
--
-- Eén rij per apparaat dat de herinnering aan heeft. De Edge Function `send-reminders` leest deze tabel
-- (met de service key, buiten RLS om) en stuurt op het ingestelde tijdstip een Web Push.
--
-- Wat er staat: het push-adres van de browser (endpoint) en de sleutels om er versleuteld naartoe te sturen,
-- het gewenste tijdstip en de tijdzone, en een kleine samenvatting ("deze dag: 3 gewoontes, 2 in de stapel").
-- De app werkt die samenvatting bij zodra je iets wijzigt. Zo hoeft de server de habits zelf niet te begrijpen.

create table if not exists public.push_subscriptions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint           text        not null,
  p256dh             text        not null,
  auth               text        not null,
  remind_time        text        not null default '08:00',
  timezone           text        not null default 'Europe/Amsterdam',
  -- { "name": "Remco", "days": { "2026-10-16": [3, 2], ... } }  (per dag: [gepland, in de stapel])
  summary            jsonb       not null default '{}'::jsonb,
  last_notified_date date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint push_endpoint_https  check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  constraint push_keys_length     check (char_length(p256dh) <= 200 and char_length(auth) <= 100),
  constraint push_time_format     check (remind_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint push_timezone_length check (char_length(timezone) between 1 and 64),
  constraint push_summary_object  check (jsonb_typeof(summary) = 'object'),
  constraint push_summary_size    check (octet_length(summary::text) <= 4000),
  constraint push_unique_per_user unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- updated_at bepaalt de server, niet de client. En hoogstens 10 apparaten per gebruiker.
create or replace function public.push_subscriptions_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' and (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'te veel apparaten voor herinneringen' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_guard on public.push_subscriptions;
create trigger push_subscriptions_guard
  before insert or update on public.push_subscriptions
  for each row execute function public.push_subscriptions_guard();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: je ziet en beheert alleen je eigen apparaten. anon kan niets.
-- (De Edge Function gebruikt de service key en valt daar niet onder.)
-- ---------------------------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists "push: eigen apparaten lezen" on public.push_subscriptions;
create policy "push: eigen apparaten lezen" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "push: eigen apparaten toevoegen" on public.push_subscriptions;
create policy "push: eigen apparaten toevoegen" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "push: eigen apparaten wijzigen" on public.push_subscriptions;
create policy "push: eigen apparaten wijzigen" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push: eigen apparaten verwijderen" on public.push_subscriptions;
create policy "push: eigen apparaten verwijderen" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, public;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
