-- MovieNight v1.4.1 — safe ratings. Run once in the Supabase SQL editor (safe to re-run).
-- Mark as seen with your rating while changing only your own score on the server, so
-- two people rating at the same moment never overwrite each other. Editing a rating later
-- keeps the original watch date. Runs as the caller, so the "movies members" policy applies.

create or replace function public.set_rating(p_movie uuid, p_name text, p_score numeric)
returns public.movies language plpgsql set search_path = public as $$
declare m public.movies;
begin
  update movies
     set seen = true,
         seen_at = coalesce(seen_at, now()),
         ratings = case when p_score is null then coalesce(ratings, '{}'::jsonb) - p_name
                        else coalesce(ratings, '{}'::jsonb) || jsonb_build_object(p_name, p_score) end
   where id = p_movie
  returning * into m;
  if not found then raise exception 'not_found'; end if;
  return m;
end; $$;

grant execute on function public.set_rating(uuid, text, numeric) to authenticated;
