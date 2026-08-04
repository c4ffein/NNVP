/**
 * historyView.ts — pure view logic for the History tab (Phase F): filter
 * predicates over folds and grouping by workHash. The panel stays a thin
 * binding; everything decidable without pixels is decided here, so both test
 * worlds (and any future consumer) share one behavior.
 */

import { describeEngine } from './engineInfo';
import type { EngineLib, RanOn } from './engineInfo';
import type { FoldedRun } from './runEvents';
import type { ModelIdentity } from './modelIdentity';

/** null = "any" for every dimension; hidden runs need the explicit opt-in. */
export interface RunFilters {
  dataset: string | null;
  /** 'unfinished' is the synthetic bucket for outcome === null folds. */
  outcome: 'completed' | 'cancelled' | 'error' | 'unfinished' | null;
  ranOn: RanOn | null;
  lib: EngineLib | null;
  showHidden: boolean;
}

export const EMPTY_RUN_FILTERS: RunFilters = {
  dataset: null, outcome: null, ranOn: null, lib: null, showHidden: false,
};

export function runMatchesFilters(run: FoldedRun, filters: RunFilters): boolean {
  if (!filters.showHidden && run.hidden) return false;
  if (filters.dataset !== null && run.config?.dataset !== filters.dataset) return false;
  if (filters.outcome !== null) {
    const matches = filters.outcome === 'unfinished'
      ? run.outcome === null
      : run.outcome === filters.outcome;
    if (!matches) return false;
  }
  if (filters.ranOn !== null || filters.lib !== null) {
    const info = describeEngine(run.engineId);
    if (filters.ranOn !== null && info.ranOn !== filters.ranOn) return false;
    if (filters.lib !== null && info.lib !== filters.lib) return false;
  }
  return true;
}

/** One architecture's bucket: runs in the order given (newest-first there). */
export interface RunGroup {
  /** null = the "unknown model" bucket (orphan folds, unparseable snapshots). */
  workHash: string | null;
  summary: string | null;
  runs: FoldedRun[];
  /** Highest val-acc any epoch of any run in the group reached. */
  bestValAcc: number | null;
  /** Distinct docHashes — >1 means the same network exists under several namings. */
  docVariantCount: number;
}

/**
 * Bucket runs by their snapshot's workHash, groups in encounter order (the
 * caller passes newest-first, so the freshest architecture leads). Runs
 * whose identity is null share ONE trailing "unknown" bucket.
 */
export function groupRuns(
  runs: FoldedRun[],
  identities: Record<string, ModelIdentity | null>,
): RunGroup[] {
  const groups: RunGroup[] = [];
  const byHash = new Map<string | null, RunGroup>();
  const docHashes = new Map<RunGroup, Set<string>>();
  for (const run of runs) {
    const identity = identities[run.uuid] ?? null;
    const key = identity === null ? null : identity.workHash;
    let group = byHash.get(key);
    if (!group) {
      group = {
        workHash: key,
        summary: identity === null ? null : identity.summary,
        runs: [],
        bestValAcc: null,
        docVariantCount: 0,
      };
      byHash.set(key, group);
      groups.push(group);
    }
    group.runs.push(run);
    if (identity !== null) {
      let seen = docHashes.get(group);
      if (!seen) { seen = new Set(); docHashes.set(group, seen); }
      seen.add(identity.docHash);
    }
    for (const metrics of run.epochMetrics) {
      if (typeof metrics.valAcc === 'number'
        && (group.bestValAcc === null || metrics.valAcc > group.bestValAcc)) {
        group.bestValAcc = metrics.valAcc;
      }
    }
  }
  groups.forEach((group) => {
    group.docVariantCount = docHashes.get(group)?.size ?? 0; // eslint-disable-line no-param-reassign
  });
  // The unknown bucket reads best at the end, whatever order it appeared in.
  return [...groups.filter(g => g.workHash !== null), ...groups.filter(g => g.workHash === null)];
}
