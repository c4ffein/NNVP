// Which concept articles have been opened — the book's read marks.
//
// Same guarded-localStorage pattern as lib/Tutorial/progress.ts (a separate
// key: reading the book and playing the course are independent trails).

const STORAGE_KEY = 'nnvp-concepts-read';

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* SSR / privacy mode */ }
  return null;
}

/** The set of concept ids that have been opened at least once. */
export function readConceptIds(): Set<string> {
  const store = storage();
  if (!store) return new Set();
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY)!);
    return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Drop all read marks (the debug menu's fresh-user reset). */
export function resetConceptReads(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch { /* privacy mode */ }
}

/** Record that a concept article was opened. */
export function markConceptRead(id: string): void {
  const store = storage();
  if (!store) return;
  const ids = readConceptIds();
  ids.add(id);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch { /* quota / privacy mode */ }
}
