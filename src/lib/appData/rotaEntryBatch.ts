import { RotaEntry } from '../../types';

/** One saved rota entry, and whether it was saved to live Supabase. */
export interface SavedRotaEntryResult {
  entry: RotaEntry;
  live: boolean;
}

/** The outcome of saving several rota entries as one plan. */
export interface RotaEntryBatchResult {
  /** Entries saved before any failure, in order. */
  created: RotaEntry[];
  /** True when at least one entry was saved to live Supabase. */
  live: boolean;
  /** The first failure (null when every entry was saved). */
  error: unknown;
}

/**
 * Saves rota entries one at a time, in order, stopping at the first failure.
 * Entries saved before the failure stay saved and are reported, so the caller
 * can tell the leader exactly how much of a plan (for example Plan the Month)
 * was created, and can request one push delivery for everything that was.
 */
export async function saveRotaEntriesInOrder<T>(
  items: T[],
  save: (item: T) => Promise<SavedRotaEntryResult>,
): Promise<RotaEntryBatchResult> {
  const created: RotaEntry[] = [];
  let live = false;
  for (const item of items) {
    try {
      const saved = await save(item);
      created.push(saved.entry);
      live = live || saved.live;
    } catch (error) {
      return { created, live, error };
    }
  }
  return { created, live, error: null };
}
