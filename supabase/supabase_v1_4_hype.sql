-- MovieNight v1.4 — hype votes. Run once in the Supabase SQL editor (safe to re-run).
-- Each member can hype movies on the watchlist; when you both do, it gets a flame.

alter table public.movies add column if not exists hype jsonb not null default '{}'::jsonb;

-- Toggle only your own vote on the server, so two people voting at the same moment
-- never overwrite each other. Runs as the caller, so the "movies members" policy applies.
create or replace function public.set_hype(p_movie uuid, p_name text, p_on boolean)
returns jsonb language plpgsql set search_path = public as $$
declare h jsonb;
begin
  update movies
     set hype = case when p_on then hype || jsonb_build_object(p_name, true) else hype - p_name end
   where id = p_movie
  returning hype into h;
  if not found then raise exception 'not_found'; end if;
  return h;
end; $$;

grant execute on function public.set_hype(uuid, text, boolean) to authenticated;
