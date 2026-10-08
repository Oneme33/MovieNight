import { supabase, ListRow, MovieRow } from './supabase';

// supabase-js returns errors instead of throwing; throw them so callers can roll back.
const check = <T extends { error: unknown }>(res: T): T => {
  if (res.error) throw res.error;
  return res;
};

// Create a new list (server generates the code and adds you as the first member).
export async function createList(name: string, memberName: string): Promise<ListRow> {
  const { data, error } = await supabase.rpc('create_list', {
    p_name: name,
    p_member_name: memberName,
  });
  if (error) throw error;
  return data as ListRow;
}

// Join a list by code (also used to (re)establish membership on launch). Throws
// 'code_not_found' when the code doesn't exist.
export async function joinList(code: string, memberName: string): Promise<ListRow> {
  const { data, error } = await supabase.rpc('join_list', {
    p_code: code.trim().toUpperCase(),
    p_member_name: memberName,
  });
  if (error) throw error;
  return data as ListRow;
}

// Leave a list on this device (frees your membership).
export async function leaveList(listId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  check(await supabase.from('list_members').delete().eq('list_id', listId).eq('user_id', uid));
}

export async function fetchMovies(listId: string): Promise<MovieRow[]> {
  const { data, error } = await supabase
    .from('movies')
    .select()
    .eq('list_id', listId)
    .order('seen', { ascending: true })
    .order('position', { ascending: true });
  if (error) throw error;
  return (data as MovieRow[]) ?? [];
}

export async function addMovie(
  listId: string,
  addedBy: string,
  fields: Partial<MovieRow> & { title: string }
): Promise<void> {
  // A movie can only be on the list once (seen or unseen).
  if (fields.tmdb_id) {
    const { data: dup } = check(await supabase
      .from('movies')
      .select('id')
      .eq('list_id', listId)
      .eq('tmdb_id', fields.tmdb_id)
      .limit(1));
    if (dup && dup.length) return;
  }
  // Put the new movie at the bottom of the unseen list.
  const { data } = check(await supabase
    .from('movies')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1));
  const maxPos = data && data.length ? (data[0] as any).position ?? 0 : 0;
  const { error } = await supabase.from('movies').insert({
    list_id: listId,
    added_by: addedBy,
    position: maxPos + 1,
    seen: false,
    ...fields,
  });
  if (error) throw error;
}

export async function deleteMovie(id: string): Promise<void> {
  check(await supabase.from('movies').delete().eq('id', id));
}

// Mark as seen with your optional rating (or edit it later). The server changes only
// your own score and keeps the original watch date (supabase_v1_4_1_ratings.sql).
export async function markSeen(movieId: string, memberName: string, score: number | null): Promise<MovieRow> {
  const { data } = check(await supabase.rpc('set_rating', { p_movie: movieId, p_name: memberName, p_score: score }));
  return data as MovieRow;
}

export async function unmarkSeen(id: string): Promise<void> {
  check(await supabase.from('movies').update({ seen: false, seen_at: null }).eq('id', id));
}

// Save the new order after dragging: position = index in the list.
export async function persistOrder(items: MovieRow[]): Promise<void> {
  await Promise.all(
    items.map((m, i) =>
      m.position === i ? Promise.resolve() : supabase.from('movies').update({ position: i }).eq('id', m.id).then(check)
    )
  );
}

// Hype a movie (or take it back). The server toggles only your own vote.
export async function setHype(movieId: string, memberName: string, on: boolean): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.rpc('set_hype', { p_movie: movieId, p_name: memberName, p_on: on });
  if (error) throw error;
  return (data ?? {}) as Record<string, boolean>;
}

// Your partner's vote stays secret until you both hype it — then it's a 🔥 match.
export const hypeOf = (m: MovieRow, me?: string) => {
  const names = Object.keys(m.hype ?? {});
  return { mine: !!me && names.includes(me), both: names.length >= 2 };
};
