-- Habit Builder · M4 · eerste migratie
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run.
-- Veilig om opnieuw uit te voeren (idempotent).
--
-- Opzet: één tabel `records` waarin elk record van de app (habit, check-in, pauze, …) als JSON staat.
-- De app is offline-first: de bron van waarheid staat lokaal, deze tabel is de gedeelde kopie per gebruiker.
-- Beveiliging: Row Level Security — een gebruiker ziet en schrijft uitsluitend zijn eigen rijen.

-- ---------------------------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------------------------
create sequence if not exists public.records_seq;

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection text        not null,
  id         text        not null,
  data       jsonb       not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  -- seq loopt op bij elke schrijfactie; de app haalt "alles na seq X" op (zie trigger hieronder)
  seq        bigint      not null default nextval('public.records_seq'),
  primary key (user_id, collection, id),
  constraint records_collection_known check (
    collection in ('settings', 'habits', 'checkIns', 'pauses', 'dayPlans', 'achievements', 'ratings', 'reviews')
  ),
  constraint records_id_length check (char_length(id) between 1 and 200),
  constraint records_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint records_data_size check (octet_length(data::text) <= 20000)
);

create index if not exists records_user_seq_idx on public.records (user_id, seq);

-- Bij elke insert of update: nieuwe seq en tijdstempel (de client bepaalt die nooit zelf).
create or replace function public.records_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.seq := nextval('public.records_seq');
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.records enable row level security;
alter table public.records force row level security;

drop policy if exists "records: eigen rijen lezen" on public.records;
create policy "records: eigen rijen lezen" on public.records
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "records: eigen rijen toevoegen" on public.records;
create policy "records: eigen rijen toevoegen" on public.records
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "records: eigen rijen wijzigen" on public.records;
create policy "records: eigen rijen wijzigen" on public.records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Bewust geen delete-policy: verwijderen gebeurt "zacht" (deleted_at). Weg is weg bij account verwijderen (cascade).

revoke all on public.records from anon, public;
grant select, insert, update on public.records to authenticated;
revoke all on sequence public.records_seq from anon, public;
grant usage on sequence public.records_seq to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Eigen account verwijderen (vanuit de app): wist de gebruiker en, via cascade, al zijn records.
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Keepalive: een heel kleine publieke functie. De dagelijkse GitHub Action roept hem aan zodat het
-- gratis project niet na een week zonder activiteit gepauzeerd wordt. Geeft alleen 'ok' terug.
-- ---------------------------------------------------------------------------------------------
create or replace function public.ping() returns text
language sql
stable
set search_path = ''
as $$ select 'ok'::text $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
