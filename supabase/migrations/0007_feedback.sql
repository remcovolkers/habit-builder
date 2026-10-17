-- Habit Builder · feedbackhub: gebruikers laten feedback achter, de beheerder leest ze op het web (docs/FEEDBACK.md)
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. (lokaal doet `npm run db:start` het zelf; een lopende lokale
-- database bijwerken kan met `npm run db:reset`)
-- Veilig om opnieuw uit te voeren (idempotent). Alleen toevoegingen: de app van vóór deze migratie blijft werken. Vereist 0006 (app_admins).
--
-- Wat er bijkomt:
--   • feedback             de berichten. Niemand kan de tabel rechtstreeks lezen of schrijven (ook de app zelf niet): alles loopt via de functies.
--   • feedback_send(...)   versturen. Ook zonder account (anon): precies wie net begint heeft vaak iets te melden. Alleen de tekst, de soort, de pagina
--                          en de appversie gaan mee. Een naam of e-mailadres komt er alleen bij als de afzender "je mag me mailen" aanvinkt en is
--                          ingelogd; het adres komt dan van het account op de server, nooit van de telefoon.
--   • app_is_admin()       is de aanroeper beheerder? (voor het tabje Feedback; de app toont het alleen aan jou)
--   • feedback_list()      de berichten, nieuwste eerst. Alleen voor een beheerder; anderen krijgen niets.
--   • feedback_set_status  afgehandeld of weer nieuw. feedback_delete: verwijderen. Beide alleen voor een beheerder.
--
-- Tempo: hoogstens 20 berichten per minuut en 500 per dag, in totaal. Er wordt bewust niets per persoon bijgehouden: wie anoniem stuurt, blijft
-- anoniem. De prijs is dat een spammer de limiet kan volmaken; verwijder dan het overtollige (feedback_delete) en kijk even later opnieuw.

create table if not exists public.feedback (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text        not null check (kind in ('idea', 'problem', 'question', 'compliment')),
  body          text        not null check (char_length(body) between 1 and 1000),
  route         text        check (route is null or char_length(route) <= 100),
  app_version   text        check (app_version is null or char_length(app_version) <= 20),
  user_id       uuid        references auth.users (id) on delete cascade,
  contact_email text        check (contact_email is null or char_length(contact_email) <= 254),
  status        text        not null default 'new' check (status in ('new', 'done')),
  handled_at    timestamptz
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
alter table public.feedback force row level security;
revoke all on public.feedback from anon, authenticated, public;

-- ---------------------------------------------------------------------------------------------
-- Beheerder?
-- ---------------------------------------------------------------------------------------------
create or replace function public.app_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.app_admins a where a.user_id = auth.uid()) $$;

-- ---------------------------------------------------------------------------------------------
-- Versturen (ook zonder account)
-- ---------------------------------------------------------------------------------------------
create or replace function public.feedback_send(
  p_kind    text,
  p_body    text,
  p_route   text default null,
  p_version text default null,
  p_contact boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  body text := btrim(coalesce(p_body, ''));
  uid  uuid := auth.uid();
  mail text := null;
begin
  if p_kind is null or p_kind not in ('idea', 'problem', 'question', 'compliment') then raise exception 'invalid_feedback'; end if;
  if char_length(body) < 1 or char_length(body) > 1000 then raise exception 'invalid_feedback'; end if;

  if (select count(*) from public.feedback f where f.created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.feedback f where f.created_at > now() - interval '1 day') >= 500 then
    raise exception 'too_many_requests';
  end if;

  -- zonder vinkje (of zonder account) blijft het bericht anoniem: geen gebruiker en geen adres
  if coalesce(p_contact, false) and uid is not null then
    select u.email into mail from auth.users u where u.id = uid;
  else
    uid := null;
  end if;

  insert into public.feedback (kind, body, route, app_version, user_id, contact_email)
  values (p_kind, body, nullif(left(btrim(coalesce(p_route, '')), 100), ''), nullif(left(btrim(coalesce(p_version, '')), 20), ''), uid, mail);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Lezen en bijhouden (alleen beheerder; voor een ander: niets, geen foutmelding die iets verraadt)
-- ---------------------------------------------------------------------------------------------
create or replace function public.feedback_list() returns setof public.feedback
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.app_is_admin() then return; end if;
  return query select * from public.feedback f order by f.created_at desc limit 500;
end;
$$;

create or replace function public.feedback_set_status(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.app_is_admin() or p_status is null or p_status not in ('new', 'done') then return false; end if;
  update public.feedback f set status = p_status, handled_at = case when p_status = 'done' then now() else null end where f.id = p_id;
  return found;
end;
$$;

create or replace function public.feedback_delete(p_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.app_is_admin() then return false; end if;
  delete from public.feedback f where f.id = p_id;
  return found;
end;
$$;

revoke all on function public.app_is_admin() from public, anon;
revoke all on function public.feedback_send(text, text, text, text, boolean) from public;
revoke all on function public.feedback_list() from public, anon;
revoke all on function public.feedback_set_status(uuid, text) from public, anon;
revoke all on function public.feedback_delete(uuid) from public, anon;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.feedback_send(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.feedback_list() to authenticated;
grant execute on function public.feedback_set_status(uuid, text) to authenticated;
grant execute on function public.feedback_delete(uuid) to authenticated;
