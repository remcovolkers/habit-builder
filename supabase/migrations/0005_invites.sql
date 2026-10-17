-- Habit Builder · uitnodigingslinks: gebruiksteller, plafond per link, "al vrienden" en een voorvertoning zonder account
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. (lokaal doet `npm run db:start` het zelf; een lopende lokale
-- database bijwerken kan met `npm run db:reset`)
-- Veilig om opnieuw uit te voeren (idempotent). Alleen toevoegingen: de app van vóór deze migratie blijft werken.
--
-- Wat er verandert (docs/ITERATIE-1.2.md §1 en §2):
--   • invite_codes.uses     hoeveel mensen er via deze link vrienden werden
--   • invite_peek(code)     voor wie nog geen account heeft: alleen de weergavenaam van de uitnodiger, zodat het welkomstscherm
--                           kan zeggen wie uitnodigt. Geeft voor elke ongeldige, verlopen, ingetrokken of volle code hetzelfde antwoord.
--   • invite_redeem(code)   telt mee in `uses`, weigert na 25 mensen per link en meldt "al vrienden" (zonder iets te veranderen)
--   • invite_list()         geeft ook `uses` terug

alter table public.invite_codes add column if not exists uses integer not null default 0;

-- ---------------------------------------------------------------------------------------------
-- Voorvertoning: ook voor anon. Geeft niets anders terug dan de weergavenaam. Een code is 128 bit lang, dus raden helpt niet;
-- zonder inlog is er geen gebruiker om een limiet op te zetten, vandaar het ene, neutrale antwoord voor alles wat niet klopt.
-- ---------------------------------------------------------------------------------------------
create or replace function public.invite_peek(p_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  hash  text := encode(sha256(convert_to(lower(btrim(coalesce(p_code, ''))), 'utf8')), 'hex');
  inv   public.invite_codes;
  owner_profile public.social_profiles;
begin
  select * into inv from public.invite_codes c
    where c.code_hash = hash and c.revoked_at is null and c.expires_at > now() and c.uses < 25;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  select * into owner_profile from public.social_profiles p where p.user_id = inv.owner and p.enabled;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  -- wie ingelogd is en zijn eigen link opent, krijgt dat te horen (een anoniem iemand kan dit niet zijn)
  if auth.uid() is not null and auth.uid() = inv.owner then return jsonb_build_object('status', 'own'); end if;
  return jsonb_build_object('status', 'ok', 'display_name', owner_profile.display_name);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Inwisselen: telt mee, 25 mensen per link, en "al vrienden" verandert niets.
-- ---------------------------------------------------------------------------------------------
create or replace function public.invite_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid   uuid := public.social_uid();
  hash  text := encode(sha256(convert_to(lower(btrim(coalesce(p_code, ''))), 'utf8')), 'hex');
  inv   public.invite_codes;
  owner_profile public.social_profiles;
  f     public.friendships;
  had   boolean;
begin
  perform public.social_require_enabled(uid);
  perform public.social_rate_use(uid, 'redeem', 20, interval '1 hour');

  select * into inv from public.invite_codes c where c.code_hash = hash and c.revoked_at is null and c.expires_at > now() for update;
  if not found or inv.owner = uid then return jsonb_build_object('status', 'invalid'); end if;
  select * into owner_profile from public.social_profiles p where p.user_id = inv.owner and p.enabled;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  select * into f from public.friendships x where x.user_low = least(uid, inv.owner) and x.user_high = greatest(uid, inv.owner) for update;
  had := found;

  -- al vrienden: niets te doen, ook als de link intussen vol zit
  if had and f.status = 'accepted' then
    return jsonb_build_object('status', 'ok', 'already_friends', true, 'user_id', owner_profile.user_id,
                              'username', owner_profile.username, 'display_name', owner_profile.display_name);
  end if;

  if inv.uses >= 25 then return jsonb_build_object('status', 'invalid'); end if;
  if public.social_friend_count(uid) >= 50 or public.social_friend_count(inv.owner) >= 50 then raise exception 'friend_limit'; end if;
  if had then
    update public.friendships x set status = 'accepted', responded_at = now() where x.id = f.id;
  else
    insert into public.friendships (user_low, user_high, requested_by, status, responded_at)
    values (least(uid, inv.owner), greatest(uid, inv.owner), uid, 'accepted', now());
  end if;
  update public.invite_codes c set uses = c.uses + 1 where c.id = inv.id;

  return jsonb_build_object('status', 'ok', 'already_friends', false, 'user_id', owner_profile.user_id,
                            'username', owner_profile.username, 'display_name', owner_profile.display_name);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- De lijst met je actieve links: nu ook met het aantal mensen dat ze gebruikte.
-- (Een andere uitvoerkolom kan niet met "or replace": eerst weg, dan opnieuw met dezelfde rechten.)
-- ---------------------------------------------------------------------------------------------
drop function if exists public.invite_list();
create function public.invite_list() returns table (id uuid, created_at timestamptz, expires_at timestamptz, uses integer)
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  return query select c.id, c.created_at, c.expires_at, c.uses from public.invite_codes c
    where c.owner = uid and c.revoked_at is null and c.expires_at > now() order by c.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Rechten
-- ---------------------------------------------------------------------------------------------
revoke all on function public.invite_list() from public, anon;
revoke all on function public.invite_redeem(text) from public, anon;
revoke all on function public.invite_peek(text) from public;
grant execute on function public.invite_list() to authenticated;
grant execute on function public.invite_redeem(text) to authenticated;
grant execute on function public.invite_peek(text) to anon, authenticated;
