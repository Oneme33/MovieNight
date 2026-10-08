-- Filmavond — database-structuur (robuust / opnieuw uitvoerbaar)
-- Plak dit in de Supabase SQL Editor en klik "Run".

-- 1) Tabellen
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text,
  created_at timestamptz default now()
);

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  tmdb_id int,
  title text not null,
  year int,
  poster_path text,
  genre text,
  position double precision default 0,
  seen boolean default false,
  added_by text,
  created_at timestamptz default now()
);
create index if not exists movies_list_id_idx on public.movies(list_id);

-- 2) Toegangsregels (Row Level Security) — idempotent
alter table public.lists enable row level security;
alter table public.movies enable row level security;

drop policy if exists "lists open" on public.lists;
drop policy if exists "movies open" on public.movies;
create policy "lists open" on public.lists
  for all to anon, authenticated using (true) with check (true);
create policy "movies open" on public.movies
  for all to anon, authenticated using (true) with check (true);

-- 3) Realtime aanzetten (foutbestendig: negeer als het al aan staat of anders geregeld is)
do $$ begin
  alter publication supabase_realtime add table public.lists;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.movies;
exception when others then null; end $$;

-- 4) Kolommen voor gezien-cijfers per persoon + wanneer-gezien
alter table public.movies add column if not exists ratings jsonb default '{}'::jsonb;
alter table public.movies add column if not exists seen_at timestamptz;

-- 5) Volledige rij bij realtime-events (zodat verwijderen ook live synct)
alter table public.movies replica identity full;

-- 6) Schema-cache verversen zodat de app de tabellen meteen ziet
notify pgrst, 'reload schema';
