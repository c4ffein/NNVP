// The engine-benchmark mode gate: hidden unless explicitly requested.
// `?bench=1` on the URL turns it on and REMEMBERS it (localStorage), so the
// flag is per-browser sticky; `?bench=0` turns it back off. No UI toggles it.

const STORAGE_KEY = 'nnvp-bench-mode';

export interface BenchModeResolution {
  enabled: boolean;
  /** The value to persist, or null to leave storage untouched. */
  store: string | null;
}

/** Pure resolver: the search string decides, else the stored value. */
export function resolveBenchMode(
  search: string | null | undefined,
  stored: string | null,
): BenchModeResolution {
  const param = new URLSearchParams(search || '').get('bench');
  if (param === '1') return { enabled: true, store: '1' };
  if (param === '0') return { enabled: false, store: '0' };
  return { enabled: stored === '1', store: null };
}

/** Browser entry point: resolves against location + localStorage, persisting. */
export function benchModeEnabled(): boolean {
  try {
    const { enabled, store } = resolveBenchMode(
      window.location.search,
      localStorage.getItem(STORAGE_KEY),
    );
    if (store !== null) localStorage.setItem(STORAGE_KEY, store);
    return enabled;
  } catch {
    return false;
  }
}
