-- Habit Builder · teller voor de ontwikkelaar: hoeveel mensen gebruiken de app, en hoeveel waren er vandaag actief
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. (lokaal doet `npm run db:start` het zelf; een lopende lokale
-- database bijwerken kan met `npm run db:reset`)
-- Veilig om opnieuw uit te voeren (idempotent). Alleen toevoegingen: de app van vóór deze migratie blijft werken.
--
-- Wat er bijkomt:
--   • app_admins    wie de aantallen mag opvragen. Staat voor iedereen dicht (ook voor de app zelf); je vult hem één keer met de hand:
--                     insert into public.app_admins (user_id) select id from auth.users where email = 'jij@example.com';
--   • dev_usage()   geeft { users, active_today } terug, zonder jezelf mee te tellen. Voor wie geen beheerder is: null.
--                   Alleen aantallen: geen namen, geen e-mailadressen, geen ID's. Er komt niets nieuws vast te liggen; het telt wat er al is
--                   (accounts, en de tijdstippen waarop records voor het laatst zijn gesynchroniseerd).
--   "Vandaag" is de dag in Nederland (Europe/Amsterdam), niet in UTC.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.app_admins enable row level security;
alter table public.app_admins force row level security;
revoke all on public.app_admins from anon, authenticated, public;

create or replace function public.dev_usage() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if uid is null or not exists (select 1 from public.app_admins a where a.user_id = uid) then
    return null;
  end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users u where u.id <> uid),
    'active_today', (select count(distinct r.user_id) from public.records r
                     where r.user_id <> uid and (r.updated_at at time zone 'Europe/Amsterdam')::date = today));
end;
$$;

revoke all on function public.dev_usage() from public, anon;
grant execute on function public.dev_usage() to authenticated;
