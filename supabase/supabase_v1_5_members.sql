-- MovieNight v1.5 — identity by member id instead of display name, plus app versions.
-- Run once in the Supabase SQL editor (safe to re-run).
--
-- Until now ratings, hype votes and "added by" were keyed by display name, so renaming
-- yourself orphaned your ratings and two people with the same name overwrote each other.
-- From v1.5 they're keyed by list_members.id. Older apps keep working while you update:
-- their name-based calls are translated to member ids on the server.

-- 0) Backup of the name-keyed data before converting (only on the first run). RLS without
--    policies: the app can't read it. Undo with:
--    update movies m set ratings = b.ratings, hype = b.hype from movies_backup_v1_5 b where b.id = m.id;
create table if not exists public.movies_backup_v1_5 as select id, ratings, hype, added_by, now() as saved_at from public.movies;
alter table public.movies_backup_v1_5 enable row level security;

-- 1) A stable id per member, and which app version they last opened.
alter table public.list_members add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists list_members_id_key on public.list_members (id);
alter table public.list_members add column if not exists app_version text;
alter table public.list_members add column if not exists last_seen_at timestamptz;

-- 2) Who added a movie, as a member id (the old added_by name stays for display/fallback).
alter table public.movies add column if not exists added_by_member uuid
  references public.list_members (id) on delete set null;

-- Member id of the current user in a list (null when not a member).
create or replace function public.my_member(p_list uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select id from list_members where list_id = p_list and user_id = auth.uid();
$$;

-- Member id for a display name in a list (oldest one if a name is used twice).
create or replace function public.member_by_name(p_list uuid, p_name text)
returns uuid language sql security definer stable set search_path = public as $$
  select id from list_members where list_id = p_list and name = p_name order by created_at limit 1;
$$;

-- 3) Convert existing keys from names to member ids (keys without a matching member stay).
update public.movies mv set ratings = (
  select jsonb_object_agg(coalesce(public.member_by_name(mv.list_id, e.key)::text, e.key), e.value)
  from jsonb_each(mv.ratings) e
) where mv.ratings is not null and mv.ratings <> '{}'::jsonb;

update public.movies mv set hype = (
  select jsonb_object_agg(coalesce(public.member_by_name(mv.list_id, e.key)::text, e.key), e.value)
  from jsonb_each(mv.hype) e
) where mv.hype <> '{}'::jsonb;

update public.movies mv set added_by_member = public.member_by_name(mv.list_id, mv.added_by)
where mv.added_by_member is null and mv.added_by is not null;

-- New movies get added_by_member from whoever inserts them (also from older apps).
create or replace function public.movies_set_added_by_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.added_by_member is null then new.added_by_member := public.my_member(new.list_id); end if;
  return new;
end; $$;
drop trigger if exists movies_added_by_member on public.movies;
create trigger movies_added_by_member before insert on public.movies
  for each row execute function public.movies_set_added_by_member();

-- 4) Ratings and hype: v1.5 calls these with just the movie; the server uses your member id.
create or replace function public.rate_movie(p_movie uuid, p_score numeric)
returns public.movies language plpgsql set search_path = public as $$
declare m public.movies; me uuid;
begin
  select public.my_member(list_id) into me from movies where id = p_movie;
  if me is null then raise exception 'not_found'; end if;
  update movies
     set seen = true,
         seen_at = coalesce(seen_at, now()),
         ratings = case when p_score is null then coalesce(ratings, '{}'::jsonb) - me::text
                        else coalesce(ratings, '{}'::jsonb) || jsonb_build_object(me::text, p_score) end
   where id = p_movie
  returning * into m;
  return m;
end; $$;

create or replace function public.hype_movie(p_movie uuid, p_on boolean)
returns jsonb language plpgsql set search_path = public as $$
declare h jsonb; me uuid;
begin
  select public.my_member(list_id) into me from movies where id = p_movie;
  if me is null then raise exception 'not_found'; end if;
  update movies
     set hype = case when p_on then hype || jsonb_build_object(me::text, true) else hype - me::text end
   where id = p_movie
  returning hype into h;
  return h;
end; $$;

-- The v1.4 functions (name-based) now write member ids too, so older apps stay correct.
create or replace function public.set_rating(p_movie uuid, p_name text, p_score numeric)
returns public.movies language plpgsql set search_path = public as $$
begin
  return public.rate_movie(p_movie, p_score);
end; $$;

create or replace function public.set_hype(p_movie uuid, p_name text, p_on boolean)
returns jsonb language plpgsql set search_path = public as $$
begin
  return public.hype_movie(p_movie, p_on);
end; $$;

-- 5) Joining: rejoining with a name that's already in the list (reinstall, new phone) takes
--    over that member, so your ratings come back. Otherwise you're added as a new member.
create or replace function public.join_list(p_code text, p_member_name text)
returns public.lists language plpgsql security definer set search_path = public as $$
declare l public.lists; existing uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from lists where code = upper(trim(p_code));
  if l.id is null then raise exception 'code_not_found'; end if;
  if exists (select 1 from list_members where list_id = l.id and user_id = auth.uid()) then
    update list_members set name = p_member_name where list_id = l.id and user_id = auth.uid();
    return l;
  end if;
  existing := public.member_by_name(l.id, p_member_name);
  if existing is not null then
    update list_members set user_id = auth.uid() where id = existing;
  else
    insert into list_members(list_id, user_id, name) values (l.id, auth.uid(), p_member_name);
  end if;
  return l;
end; $$;

-- 6) Rename yourself (ratings follow automatically, they're keyed by id).
create or replace function public.rename_member(p_list uuid, p_name text)
returns void language sql security definer set search_path = public as $$
  update list_members set name = p_name where list_id = p_list and user_id = auth.uid();
$$;

-- 7) Called on app start: records the app version and returns your member id + name.
create or replace function public.touch_member(p_list uuid, p_app_version text)
returns table (id uuid, name text) language sql security definer set search_path = public as $$
  update list_members set app_version = p_app_version, last_seen_at = now()
   where list_id = p_list and user_id = auth.uid()
  returning list_members.id, list_members.name;
$$;

grant execute on function public.my_member(uuid), public.rate_movie(uuid, numeric),
  public.hype_movie(uuid, boolean), public.rename_member(uuid, text),
  public.touch_member(uuid, text) to authenticated;
-- Only used inside the functions above; not callable from the app.
revoke execute on function public.member_by_name(uuid, text) from public, anon, authenticated;
