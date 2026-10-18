-- Habit Builder · e-mailherinnering voor de week- en maandreview aan accounts die er even niet waren (docs/MAIL-HERINNERING.md)
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. (lokaal doet `npm run db:start` het zelf; een lopende lokale
-- database bijwerken kan met `npm run db:reset`)
-- Veilig om opnieuw uit te voeren (idempotent). Alleen toevoegingen: de app van vóór deze migratie blijft werken.
--
-- Wat er bijkomt:
--   • review_mail_state          per account: afgemeld?, wanneer de laatste mail ging en hoeveel mails achter elkaar onbeantwoord bleven.
--                                Niemand kan de tabel rechtstreeks lezen of schrijven (ook de app zelf niet): alles loopt via de functies.
--   • review_mail_candidates()   wie komt in aanmerking: een account met een e-mailadres, niet afgemeld, zonder activiteit in de laatste
--                                p_stale_days dagen (laatste schrijfactie in `records`) en met hoogstens p_max_unanswered onbeantwoorde mails
--                                achter elkaar. Alleen voor de Edge Function (met de service-sleutel).
--   • review_mail_mark_sent()    de Edge Function meldt dat er een mail is verstuurd. review_mail_set_opt_out(): afmelden of weer aanmelden
--                                via de link in de mail (zonder inloggen). Ook alleen voor de Edge Function.
--   • review_mail_pref()         zet de mail aan of uit voor jezelf (Instellingen); alleen voor een ingelogd account en alleen je eigen rij.
--     review_mail_set_pref()
-- Een mail telt als "beantwoord" zodra het account daarna weer iets heeft geschreven; dan begint de teller opnieuw.

create table if not exists public.review_mail_state (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  opted_out    boolean     not null default false,
  last_sent_on date,
  last_sent_at timestamptz,
  unanswered   integer     not null default 0 check (unanswered >= 0),
  updated_at   timestamptz not null default now()
);

alter table public.review_mail_state enable row level security;
alter table public.review_mail_state force row level security;
revoke all on public.review_mail_state from anon, authenticated, public;

-- ---------------------------------------------------------------------------------------------
-- Voor de Edge Function (de service-sleutel; Supabase geeft die standaard uitvoerrechten, wij nemen ze alleen van de anderen af)
-- ---------------------------------------------------------------------------------------------
create or replace function public.review_mail_candidates(p_stale_days integer default 14, p_max_unanswered integer default 3)
returns table (user_id uuid, email text, display_name text, timezone text, last_activity timestamptz, last_sent_on date)
language sql stable security definer set search_path = ''
as $$
  select u.id,
         u.email::text,
         nullif(btrim(coalesce(s.data ->> 'displayName', '')), ''),
         coalesce(nullif(btrim(coalesce(s.data ->> 'timezone', '')), ''), 'Europe/Amsterdam'),
         a.last_activity,
         st.last_sent_on
  from auth.users u
  left join public.review_mail_state st on st.user_id = u.id
  left join public.records s on s.user_id = u.id and s.collection = 'settings' and s.id = 'user' and s.deleted_at is null
  cross join lateral (select coalesce(max(r.updated_at), u.created_at) as last_activity from public.records r where r.user_id = u.id) a
  where u.email is not null and btrim(u.email) <> ''
    and coalesce(u.is_anonymous, false) = false
    and coalesce(st.opted_out, false) = false
    and a.last_activity < now() - make_interval(days => greatest(coalesce(p_stale_days, 14), 1))
    and (st.last_sent_at is null or a.last_activity > st.last_sent_at or st.unanswered < greatest(coalesce(p_max_unanswered, 3), 1))
$$;

create or replace function public.review_mail_mark_sent(p_user uuid, p_on date) returns void
language sql security definer set search_path = ''
as $$
  insert into public.review_mail_state as st (user_id, last_sent_on, last_sent_at, unanswered)
  values (p_user, p_on, now(), 1)
  on conflict (user_id) do update set
    unanswered = case
      when (select max(r.updated_at) from public.records r where r.user_id = p_user) > coalesce(st.last_sent_at, '-infinity'::timestamptz) then 1
      else st.unanswered + 1
    end,
    last_sent_on = excluded.last_sent_on,
    last_sent_at = excluded.last_sent_at,
    updated_at = now()
$$;

create or replace function public.review_mail_set_opt_out(p_user uuid, p_opt_out boolean) returns void
language sql security definer set search_path = ''
as $$
  insert into public.review_mail_state as st (user_id, opted_out) values (p_user, coalesce(p_opt_out, false))
  on conflict (user_id) do update set opted_out = excluded.opted_out, updated_at = now()
$$;

revoke all on function public.review_mail_candidates(integer, integer) from public, anon, authenticated;
revoke all on function public.review_mail_mark_sent(uuid, date) from public, anon, authenticated;
revoke all on function public.review_mail_set_opt_out(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Voor de app (ingelogd): staat de mail voor mij aan?
-- ---------------------------------------------------------------------------------------------
create or replace function public.review_mail_pref() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select not st.opted_out from public.review_mail_state st where st.user_id = auth.uid()), true)
$$;

create or replace function public.review_mail_set_pref(p_on boolean) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  perform public.review_mail_set_opt_out(auth.uid(), not coalesce(p_on, true));
  return coalesce(p_on, true);
end;
$$;

revoke all on function public.review_mail_pref() from public, anon;
revoke all on function public.review_mail_set_pref(boolean) from public, anon;
grant execute on function public.review_mail_pref() to authenticated;
grant execute on function public.review_mail_set_pref(boolean) to authenticated;
