import { supabase, ListRow, MovieRow } from './supabase';

// Generate a short, easy-to-read pairing code (no confusing characters).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export async function createList(name: string): Promise<ListRow> {
  // Retry a few times in the unlikely case of a duplicate code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const { data, error } = await supabase
      .from('lists')
      .insert({ code, name })
      .select()
      .single();
    if (!error && data) return data as ListRow;
    if (error && !error.message.includes('duplicate')) throw error;
  }
  throw new Error('Kon geen unieke code aanmaken, probeer opnieuw.');
}

export async function findListByCode(code: string): Promise<ListRow | null> {
  const { data, error } = await supabase
    .from('lists')
    .select()
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return (data as ListRow) ?? null;
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
  // Put the new movie at the bottom of the unseen list.
  const { data } = await supabase
    .from('movies')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1);
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

export async function swapPositions(a: MovieRow, b: MovieRow): Promise<void> {
  await supabase.from('movies').update({ position: b.position }).eq('id', a.id);
  await supabase.from('movies').update({ position: a.position }).eq('id', b.id);
}

export async function deleteMovie(id: string): Promise<void> {
  await supabase.from('movies').delete().eq('id', id);
}

// Mark as seen (with your optional rating) or move back to the watchlist.
export async function markSeen(
  movie: MovieRow,
  memberName: string,
  score: number | null
): Promise<void> {
  const ratings = { ...(movie.ratings ?? {}) };
  if (score != null) ratings[memberName] = score;
  else delete ratings[memberName];
  await supabase
    .from('movies')
    .update({ seen: true, seen_at: new Date().toISOString(), ratings })
    .eq('id', movie.id);
}

export async function unmarkSeen(id: string): Promise<void> {
  await supabase.from('movies').update({ seen: false, seen_at: null }).eq('id', id);
}

// Save the new order after dragging: position = index in the list.
export async function persistOrder(items: MovieRow[]): Promise<void> {
  await Promise.all(
    items.map((m, i) =>
      m.position === i ? Promise.resolve() : supabase.from('movies').update({ position: i }).eq('id', m.id)
    )
  );
}
