-- Habit Builder · S2 · vrienden en ranglijst (docs/SOCIAAL.md)
-- Uitvoeren: Supabase dashboard → SQL Editor → New query → plakken → Run. Idempotent: opnieuw draaien kan.
-- Lokaal (Docker) wordt dit bestand door `npm run db:start` / `npm run db:reset` vanzelf toegepast.
--
-- ACHTERWAARTS COMPATIBEL: alleen nieuwe tabellen en functies. `records`, `push_subscriptions` en alles wat de huidige
-- productie-app gebruikt blijft ongemoeid.
--
-- Opzet: de tabellen zijn DICHT (RLS aan, geen enkele policy, alle rechten ingetrokken). Toegang loopt uitsluitend via de
-- onderstaande functies (security definer, vaste search_path). Zo kan niemand rechtstreeks in andermans rijen kijken of door
-- gebruikers bladeren:
--   - zoeken kan alleen op de EXACTE gebruikersnaam en geeft hooguit één rij;
--   - een vriend ziet van jou alleen je naam, gebruikersnaam en de samenvatting (punten, reeks, aantal habits, laatst actief);
--   - nooit je e-mailadres, habit-namen, notities of check-ins.
--
-- Fouten zijn stabiele codes in de melding (bijv. 'username_taken'); de app vertaalt ze naar tekst.

-- ---------------------------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------------------------
create table if not exists public.social_profiles (
  user_id             uuid        primary key references auth.users (id) on delete cascade,
  username            text        not null,
  display_name        text        not null default '',
  enabled             boolean     not null default true,
  username_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint social_username_format check (username ~ '^[a-z0-9_.]{3,20}$'),
  constraint social_display_name_length check (char_length(display_name) <= 30)
);
create unique index if not exists social_profiles_username_key on public.social_profiles (username);

-- Woorden die niet in een gebruikersnaam mogen (nabootsen van de beheerder e.d.). Aanvullen kan met een insert in de SQL-editor.
create table if not exists public.social_blocked_terms (
  term text primary key,
  constraint social_blocked_term_format check (term ~ '^[a-z0-9]+$')
);
insert into public.social_blocked_terms (term) values
  ('admin'), ('administrator'), ('moderator'), ('beheerder'), ('support'), ('habitbuilder'), ('system')
on conflict do nothing;

create table if not exists public.friendships (
  id           uuid        primary key default gen_random_uuid(),
  user_low     uuid        not null references auth.users (id) on delete cascade,
  user_high    uuid        not null references auth.users (id) on delete cascade,
  requested_by uuid        not null references auth.users (id) on delete cascade,
  status       text        not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_order     check (user_low < user_high),
  constraint friendships_status    check (status in ('pending', 'accepted', 'declined')),
  constraint friendships_requester check (requested_by in (user_low, user_high)),
  constraint friendships_pair      unique (user_low, user_high)
);
create index if not exists friendships_high_idx on public.friendships (user_high);

create table if not exists public.invite_codes (
  id         uuid        primary key default gen_random_uuid(),
  owner      uuid        not null references auth.users (id) on delete cascade,
  code_hash  text        not null unique,   -- sha256 van de code; de code zelf staat alleen in de link
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists invite_codes_owner_idx on public.invite_codes (owner);

create table if not exists public.score_summaries (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  as_of         date        not null,
  points        integer     not null check (points between 0 and 100000),
  done          integer     not null check (done between 0 and 5000),
  streak        integer     not null check (streak between 0 and 10000),
  active_habits integer     not null check (active_habits between 0 and 500),
  last_active   date,
  updated_at    timestamptz not null default now()
);

-- Telt zoek-, verzoek- en uitnodigingsacties per gebruiker, tegen raden en lastigvallen.
create table if not exists public.social_rate (
  id      bigint      generated always as identity primary key,
  user_id uuid        not null references auth.users (id) on delete cascade,
  action  text        not null,
  at      timestamptz not null default now()
);
create index if not exists social_rate_idx on public.social_rate (user_id, action, at);

-- Alles dicht: geen policies, geen rechten. Toegang alleen via de functies hieronder.
alter table public.social_profiles      enable row level security;
alter table public.social_blocked_terms enable row level security;
alter table public.friendships          enable row level security;
alter table public.invite_codes         enable row level security;
alter table public.score_summaries      enable row level security;
alter table public.social_rate          enable row level security;
revoke all on public.social_profiles, public.social_blocked_terms, public.friendships, public.invite_codes,
              public.score_summaries, public.social_rate from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Hulpfuncties (alleen voor de functies hieronder; niemand mag ze rechtstreeks aanroepen)
-- ---------------------------------------------------------------------------------------------
create or replace function public.social_uid() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return uid;
end;
$$;

create or replace function public.social_require_enabled(p_uid uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.social_profiles p where p.user_id = p_uid and p.enabled) then
    raise exception 'not_enabled';
  end if;
end;
$$;

-- Telt een actie en weigert als er te veel in het venster zijn. De rij blijft alleen staan als de aanroep zelf slaagt;
-- functies die op ongeldige invoer niet mogen mislukken (zoeken, uitnodiging inwisselen) geven daarom een resultaat terug in plaats van een fout.
create or replace function public.social_rate_use(p_uid uuid, p_action text, p_limit integer, p_window interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.social_rate r where r.user_id = p_uid and r.at < now() - interval '2 days';
  if (select count(*) from public.social_rate r where r.user_id = p_uid and r.action = p_action and r.at > now() - p_window) >= p_limit then
    raise exception 'too_many_requests';
  end if;
  insert into public.social_rate (user_id, action) values (p_uid, p_action);
end;
$$;

create or replace function public.social_friend_count(p_uid uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.friendships f
  where f.status = 'accepted' and (f.user_low = p_uid or f.user_high = p_uid);
$$;

-- ---------------------------------------------------------------------------------------------
-- Meedoen
-- ---------------------------------------------------------------------------------------------
-- Zet sociaal aan (of werkt je naam bij). Eén functie voor beide: dezelfde gebruikersnaam opnieuw opgeven wijzigt niets aan de naamregel.
create or replace function public.social_enable(p_username text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid   uuid := public.social_uid();
  uname text := lower(btrim(coalesce(p_username, '')));
  dname text := btrim(coalesce(p_display_name, ''));
  cur   public.social_profiles;
  had   boolean;
begin
  if uname !~ '^[a-z0-9_.]{3,20}$' then raise exception 'invalid_username'; end if;
  if char_length(dname) > 30 then raise exception 'invalid_display_name'; end if;
  if exists (select 1 from public.social_blocked_terms t where position(t.term in uname) > 0) then
    raise exception 'username_not_allowed';
  end if;

  select * into cur from public.social_profiles p where p.user_id = uid;
  had := found;
  begin
    if had then
      if cur.username <> uname and cur.username_changed_at is not null and cur.username_changed_at > now() - interval '30 days' then
        raise exception 'username_change_too_soon';
      end if;
      update public.social_profiles p set
        username = uname,
        display_name = dname,
        enabled = true,
        username_changed_at = case when cur.username <> uname then now() else cur.username_changed_at end,
        updated_at = now()
      where p.user_id = uid;
    else
      insert into public.social_profiles (user_id, username, display_name) values (uid, uname, dname);
    end if;
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  return jsonb_build_object('username', uname, 'display_name', dname, 'enabled', true);
end;
$$;

-- Zet sociaal uit: je verdwijnt uit andermans lijsten en zoekresultaten, je samenvatting en uitnodigingen worden gewist.
-- Vriendschappen blijven bewaard (gepauzeerd) tot je het weer aanzet.
create or replace function public.social_disable() returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  update public.social_profiles p set enabled = false, updated_at = now() where p.user_id = uid;
  delete from public.score_summaries s where s.user_id = uid;
  update public.invite_codes c set revoked_at = now() where c.owner = uid and c.revoked_at is null;
end;
$$;

create or replace function public.social_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  return (select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'enabled', p.enabled)
          from public.social_profiles p where p.user_id = uid);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Zoeken: alleen op de exacte gebruikersnaam, hooguit één resultaat, nooit een lijst.
-- Gebruikers die sociaal uit hebben, jezelf en wie jouw verzoek recent weigerde komen er niet in voor ("niet gevonden").
-- ---------------------------------------------------------------------------------------------
create or replace function public.social_find(p_username text)
returns table (id uuid, username text, display_name text, relation text)
language plpgsql security definer set search_path = ''
as $$
declare
  uid   uuid := public.social_uid();
  uname text := lower(btrim(coalesce(p_username, '')));
begin
  perform public.social_require_enabled(uid);
  perform public.social_rate_use(uid, 'find', 20, interval '1 hour');
  return query
    select p.user_id, p.username, p.display_name,
           case f.status
             when 'accepted' then 'friend'
             when 'pending' then case when f.requested_by = uid then 'outgoing' else 'incoming' end
             else 'none'
           end
    from public.social_profiles p
    left join public.friendships f on f.user_low = least(uid, p.user_id) and f.user_high = greatest(uid, p.user_id)
    where p.username = uname and p.enabled and p.user_id <> uid
      and not (coalesce(f.status = 'declined', false) and f.requested_by = uid and f.responded_at > now() - interval '30 days'); -- coalesce: zonder eerdere vriendschap is f.status NULL
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Vriendschappen
-- ---------------------------------------------------------------------------------------------
-- Stuurt een verzoek. Had de ander jou al een verzoek gestuurd, dan worden jullie meteen vrienden.
create or replace function public.friend_request(p_user uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid  uuid := public.social_uid();
  lo   uuid := least(uid, p_user);
  hi   uuid := greatest(uid, p_user);
  f    public.friendships;
  had  boolean;
begin
  perform public.social_require_enabled(uid);
  if p_user is null or p_user = uid
     or not exists (select 1 from public.social_profiles p where p.user_id = p_user and p.enabled) then
    raise exception 'not_found';
  end if;

  select * into f from public.friendships x where x.user_low = lo and x.user_high = hi for update;
  had := found; -- PERFORM verderop verandert FOUND, dus nu vastleggen
  if had then
    if f.status = 'accepted' then return jsonb_build_object('status', 'accepted'); end if;
    if f.status = 'pending' and f.requested_by = uid then return jsonb_build_object('status', 'pending'); end if;
    if f.status = 'pending' then
      -- de ander wilde jou al: dat is een wederzijds verzoek
      if public.social_friend_count(uid) >= 50 or public.social_friend_count(p_user) >= 50 then raise exception 'friend_limit'; end if;
      update public.friendships x set status = 'accepted', responded_at = now() where x.id = f.id;
      return jsonb_build_object('status', 'accepted');
    end if;
    if f.status = 'declined' and f.requested_by = uid and f.responded_at > now() - interval '30 days' then
      raise exception 'not_found'; -- precies zoals "niet gevonden": de afzender merkt niets van de weigering
    end if;
  end if;

  perform public.social_rate_use(uid, 'request', 10, interval '1 day');
  if (select count(*) from public.friendships x where x.requested_by = uid and x.status = 'pending') >= 20 then
    raise exception 'pending_limit';
  end if;
  if public.social_friend_count(uid) >= 50 then raise exception 'friend_limit'; end if;

  if had then
    update public.friendships x set requested_by = uid, status = 'pending', created_at = now(), responded_at = null where x.id = f.id;
  else
    insert into public.friendships (user_low, user_high, requested_by) values (lo, hi, uid);
  end if;
  return jsonb_build_object('status', 'pending');
end;
$$;

-- Beantwoordt een verzoek dat aan jou gericht is. Weigeren is stil: de afzender krijgt geen melding.
create or replace function public.friend_respond(p_user uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := public.social_uid();
  f   public.friendships;
begin
  perform public.social_require_enabled(uid);
  select * into f from public.friendships x
  where x.user_low = least(uid, p_user) and x.user_high = greatest(uid, p_user)
    and x.status = 'pending' and x.requested_by = p_user
  for update;
  if not found or not exists (select 1 from public.social_profiles p where p.user_id = p_user and p.enabled) then
    raise exception 'not_found';
  end if;
  if p_accept then
    if public.social_friend_count(uid) >= 50 or public.social_friend_count(p_user) >= 50 then raise exception 'friend_limit'; end if;
    update public.friendships x set status = 'accepted', responded_at = now() where x.id = f.id;
    return jsonb_build_object('status', 'accepted');
  end if;
  update public.friendships x set status = 'declined', responded_at = now() where x.id = f.id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- Trekt een eigen, nog openstaand verzoek in.
create or replace function public.friend_cancel(p_user uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.social_uid(); n integer;
begin
  delete from public.friendships x
  where x.user_low = least(uid, p_user) and x.user_high = greatest(uid, p_user) and x.status = 'pending' and x.requested_by = uid;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Verwijdert een vriend (wederzijds, direct).
create or replace function public.friend_remove(p_user uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.social_uid(); n integer;
begin
  delete from public.friendships x
  where x.user_low = least(uid, p_user) and x.user_high = greatest(uid, p_user) and x.status = 'accepted';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Je vrienden, de verzoeken aan jou en de verzoeken van jou. Alleen mensen die sociaal aan hebben; geweigerde verzoeken staan er niet in.
create or replace function public.friend_list()
returns table (user_id uuid, username text, display_name text, state text, since timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  perform public.social_require_enabled(uid);
  return query
    select p.user_id, p.username, p.display_name,
           case when f.status = 'accepted' then 'friend'
                when f.requested_by = uid then 'outgoing'
                else 'incoming' end,
           coalesce(f.responded_at, f.created_at)
    from public.friendships f
    join public.social_profiles p on p.user_id = case when f.user_low = uid then f.user_high else f.user_low end and p.enabled
    where (f.user_low = uid or f.user_high = uid) and f.status in ('accepted', 'pending')
    order by lower(p.display_name), p.username;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Uitnodigingslinks: direct vrienden voor wie de link opent. Lang, onraadbaar, verlopend en intrekbaar.
-- ---------------------------------------------------------------------------------------------
-- De code (64 tekens) wordt hier één keer teruggegeven; in de database staat alleen de hash.
create or replace function public.invite_create() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid  uuid := public.social_uid();
  code text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  rec  public.invite_codes;
begin
  perform public.social_require_enabled(uid);
  perform public.social_rate_use(uid, 'invite', 10, interval '1 day');
  if (select count(*) from public.invite_codes c where c.owner = uid and c.revoked_at is null and c.expires_at > now()) >= 5 then
    raise exception 'invite_limit';
  end if;
  insert into public.invite_codes (owner, code_hash, expires_at)
  values (uid, encode(sha256(convert_to(code, 'utf8')), 'hex'), now() + interval '7 days')
  returning * into rec;
  return jsonb_build_object('id', rec.id, 'code', code, 'expires_at', rec.expires_at);
end;
$$;

create or replace function public.invite_list() returns table (id uuid, created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  return query select c.id, c.created_at, c.expires_at from public.invite_codes c
    where c.owner = uid and c.revoked_at is null and c.expires_at > now() order by c.created_at desc;
end;
$$;

create or replace function public.invite_revoke(p_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.social_uid(); n integer;
begin
  update public.invite_codes c set revoked_at = now() where c.id = p_id and c.owner = uid and c.revoked_at is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Wisselt een code in. Een ongeldige, verlopen of ingetrokken code geeft altijd hetzelfde antwoord ({"status":"invalid"}) en
-- GEEN fout, zodat elke poging meetelt voor de begrenzing (20 per uur) en raden niet loont.
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

  select * into inv from public.invite_codes c where c.code_hash = hash and c.revoked_at is null and c.expires_at > now();
  if not found or inv.owner = uid then return jsonb_build_object('status', 'invalid'); end if;
  select * into owner_profile from public.social_profiles p where p.user_id = inv.owner and p.enabled;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  select * into f from public.friendships x where x.user_low = least(uid, inv.owner) and x.user_high = greatest(uid, inv.owner) for update;
  had := found;
  if not had or f.status <> 'accepted' then
    if public.social_friend_count(uid) >= 50 or public.social_friend_count(inv.owner) >= 50 then raise exception 'friend_limit'; end if;
    if had then
      update public.friendships x set status = 'accepted', responded_at = now() where x.id = f.id;
    else
      insert into public.friendships (user_low, user_high, requested_by, status, responded_at)
      values (least(uid, inv.owner), greatest(uid, inv.owner), uid, 'accepted', now());
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', owner_profile.user_id, 'username', owner_profile.username,
                            'display_name', owner_profile.display_name);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- De ranglijst
-- ---------------------------------------------------------------------------------------------
-- Publiceert jouw samenvatting (alleen getallen en datums). De app berekent hem lokaal; de server bewaakt alleen de bereiken.
create or replace function public.publish_summary(
  p_as_of date, p_points integer, p_done integer, p_streak integer, p_active_habits integer, p_last_active date
) returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  perform public.social_require_enabled(uid);
  perform public.social_rate_use(uid, 'publish', 60, interval '1 hour');
  if p_as_of is null or p_as_of not between current_date - 2 and current_date + 2
     or p_points is null or p_points not between 0 and 100000
     or p_done is null or p_done not between 0 and 5000
     or p_streak is null or p_streak not between 0 and 10000
     or p_active_habits is null or p_active_habits not between 0 and 500
     or (p_last_active is not null and (p_last_active > p_as_of or p_last_active < p_as_of - 3650)) then
    raise exception 'invalid_summary';
  end if;
  insert into public.score_summaries (user_id, as_of, points, done, streak, active_habits, last_active, updated_at)
  values (uid, p_as_of, p_points, p_done, p_streak, p_active_habits, p_last_active, now())
  on conflict (user_id) do update set
    as_of = excluded.as_of, points = excluded.points, done = excluded.done, streak = excluded.streak,
    active_habits = excluded.active_habits, last_active = excluded.last_active, updated_at = excluded.updated_at;
end;
$$;

-- Jouw samenvatting en die van je geaccepteerde vrienden (die sociaal aan hebben). Het wegfilteren van wie 3 dagen niets deed,
-- doet de app (met de dag van degene die kijkt).
create or replace function public.leaderboard()
returns table (user_id uuid, username text, display_name text, points integer, done integer, streak integer,
               active_habits integer, last_active date, as_of date, is_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.social_uid();
begin
  perform public.social_require_enabled(uid);
  return query
    select p.user_id, p.username, p.display_name, s.points, s.done, s.streak, s.active_habits, s.last_active, s.as_of, p.user_id = uid
    from public.social_profiles p
    join public.score_summaries s on s.user_id = p.user_id
    where p.enabled and (
      p.user_id = uid or exists (
        select 1 from public.friendships f
        where f.status = 'accepted' and f.user_low = least(uid, p.user_id) and f.user_high = greatest(uid, p.user_id)));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Rechten: alleen ingelogde gebruikers mogen de functies aanroepen; de hulpfuncties niemand.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.social_uid() from public, anon, authenticated;
revoke all on function public.social_require_enabled(uuid) from public, anon, authenticated;
revoke all on function public.social_rate_use(uuid, text, integer, interval) from public, anon, authenticated;
revoke all on function public.social_friend_count(uuid) from public, anon, authenticated;

revoke all on function public.social_enable(text, text) from public, anon;
revoke all on function public.social_disable() from public, anon;
revoke all on function public.social_me() from public, anon;
revoke all on function public.social_find(text) from public, anon;
revoke all on function public.friend_request(uuid) from public, anon;
revoke all on function public.friend_respond(uuid, boolean) from public, anon;
revoke all on function public.friend_cancel(uuid) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.friend_list() from public, anon;
revoke all on function public.invite_create() from public, anon;
revoke all on function public.invite_list() from public, anon;
revoke all on function public.invite_revoke(uuid) from public, anon;
revoke all on function public.invite_redeem(text) from public, anon;
revoke all on function public.publish_summary(date, integer, integer, integer, integer, date) from public, anon;
revoke all on function public.leaderboard() from public, anon;

grant execute on function public.social_enable(text, text) to authenticated;
grant execute on function public.social_disable() to authenticated;
grant execute on function public.social_me() to authenticated;
grant execute on function public.social_find(text) to authenticated;
grant execute on function public.friend_request(uuid) to authenticated;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;
grant execute on function public.friend_cancel(uuid) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.invite_create() to authenticated;
grant execute on function public.invite_list() to authenticated;
grant execute on function public.invite_revoke(uuid) to authenticated;
grant execute on function public.invite_redeem(text) to authenticated;
grant execute on function public.publish_summary(date, integer, integer, integer, integer, date) to authenticated;
grant execute on function public.leaderboard() to authenticated;
