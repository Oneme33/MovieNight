-- MovieNight v1.1 — PART A (safe to run now; keeps the v1.0 app working).
-- Also enable Anonymous sign-ins:
--   Dashboard → Authentication → Sign In / Providers → enable "Anonymous sign-ins".
-- This adds the new membership-based security ALONGSIDE the existing open access.
-- The final lock-down (removing open access) is a separate file, run at release.

-- 1) Members table: who belongs to which list
create table if not exists public.list_members (
  list_id uuid references public.lists(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz default now(),
  primary key (list_id, user_id)
);
alter table public.list_members enable row level security;

-- helper: is the current user a member of the given list?
create or replace function public.is_member(p_list uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from list_members m where m.list_id = p_list and m.user_id = auth.uid());
$$;

-- 2) Membership policies (added next to the existing open policies for now)
drop policy if exists "lists select members" on public.lists;
create policy "lists select members" on public.lists
  for select to authenticated using (public.is_member(id));

drop policy if exists "movies members" on public.movies;
create policy "movies members" on public.movies
  for all to authenticated using (public.is_member(list_id)) with check (public.is_member(list_id));

drop policy if exists "members select" on public.list_members;
create policy "members select" on public.list_members
  for select to authenticated using (public.is_member(list_id));
drop policy if exists "members delete self" on public.list_members;
create policy "members delete self" on public.list_members
  for delete to authenticated using (user_id = auth.uid());

-- 3) Create/join via security-definer functions
create or replace function public.create_list(p_name text, p_member_name text)
returns public.lists language plpgsql security definer set search_path = public as $$
declare new_code text; l public.lists; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from lists where code = new_code);
  end loop;
  insert into lists(code, name) values (new_code, p_name) returning * into l;
  insert into list_members(list_id, user_id, name) values (l.id, auth.uid(), p_member_name);
  return l;
end; $$;

create or replace function public.join_list(p_code text, p_member_name text)
returns public.lists language plpgsql security definer set search_path = public as $$
declare l public.lists;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from lists where code = upper(trim(p_code));
  if l.id is null then raise exception 'code_not_found'; end if;
  insert into list_members(list_id, user_id, name) values (l.id, auth.uid(), p_member_name)
    on conflict (list_id, user_id) do update set name = excluded.name;
  return l;
end; $$;

grant execute on function public.create_list(text, text) to authenticated;
grant execute on function public.join_list(text, text) to authenticated;
