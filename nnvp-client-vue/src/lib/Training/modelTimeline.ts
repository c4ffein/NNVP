/**
 * modelTimeline.ts — the run journal's snapshots read as an architecture
 * history (Phase F3). Distinct workHashes ordered by first appearance,
 * each step annotated with its structural diff from the previous step.
 * Derives ENTIRELY from run.started snapshots already in the journal —
 * no new events, no new stores. Deliberately linear and chronological;
 * inferred branching is parked (real lineage belongs to Projects).
 */

import { modelIdentityOf } from './modelIdentity';
import { structuralDiff, describeDiff } from './structuralDiff';
import type { FoldedRun } from './runEvents';
import type { NnvpModel } from '../../types/model';

export interface TimelineStep {
  workHash: string;
  summary: string;
  /** When this architecture first showed up (earliest run or checkpoint). */
  firstSeen: string | null;
  /** Its latest iteration (any run or checkpoint of this workHash). */
  lastSeen: string | null;
  runCount: number;
  /** Checkpoint snapshots of this architecture (Phase G2). */
  checkpointCount: number;
  /** Distinct docHashes — naming/comment variants of this same network. */
  docVariants: number;
  /** describeDiff lines vs the previous step; null on the first step. */
  diffFromPrevious: string[] | null;
}

/** A non-run snapshot feeding the timeline (a checkpoint, structurally). */
export interface TimelineSnapshot {
  graphJson: string;
  at: string | null;
}

const timeOf = (run: FoldedRun): string | null => run.startedAt ?? run.lastEventAt;

/**
 * Fold the journal's runs (any order) — plus any non-run snapshots, i.e.
 * checkpoints (Phase G2) — into the oldest-first timeline. Entries without a
 * parseable snapshot are left out — they have no architecture to place.
 * Async only because identity hashing is (crypto.subtle).
 */
export async function buildModelTimeline(
  runs: FoldedRun[],
  snapshots: TimelineSnapshot[] = [],
): Promise<TimelineStep[]> {
  interface Bucket {
    workHash: string;
    summary: string;
    firstSeen: string | null;
    lastSeen: string | null;
    /** The EARLIEST snapshot — the architecture as it first appeared. */
    representative: NnvpModel;
    runCount: number;
    checkpointCount: number;
    docHashes: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  const place = async (graphJson: string, seen: string | null, kind: 'run' | 'checkpoint') => {
    const identity = await modelIdentityOf(graphJson);
    if (identity === null) return;
    let bucket = buckets.get(identity.workHash);
    if (!bucket) {
      bucket = {
        workHash: identity.workHash,
        summary: identity.summary,
        firstSeen: seen,
        lastSeen: seen,
        representative: JSON.parse(graphJson) as NnvpModel,
        runCount: 0,
        checkpointCount: 0,
        docHashes: new Set(),
      };
      buckets.set(identity.workHash, bucket);
    }
    if (kind === 'run') bucket.runCount += 1;
    else bucket.checkpointCount += 1;
    bucket.docHashes.add(identity.docHash);
    if (seen !== null && (bucket.firstSeen === null || seen < bucket.firstSeen)) {
      bucket.firstSeen = seen;
      bucket.representative = JSON.parse(graphJson) as NnvpModel;
    }
    if (seen !== null && (bucket.lastSeen === null || seen > bucket.lastSeen)) {
      bucket.lastSeen = seen;
    }
  };
  for (const run of runs) {
    if (run.graphJson === null) continue; // eslint-disable-line no-continue
    await place(run.graphJson, timeOf(run), 'run');
  }
  for (const snapshot of snapshots) {
    await place(snapshot.graphJson, snapshot.at, 'checkpoint');
  }
  const ordered = [...buckets.values()].sort((a, b) => {
    const keyA = a.firstSeen ?? '';
    const keyB = b.firstSeen ?? '';
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  return ordered.map((bucket, index) => ({
    workHash: bucket.workHash,
    summary: bucket.summary,
    firstSeen: bucket.firstSeen,
    lastSeen: bucket.lastSeen,
    runCount: bucket.runCount,
    checkpointCount: bucket.checkpointCount,
    docVariants: bucket.docHashes.size,
    diffFromPrevious: index === 0
      ? null
      : describeDiff(structuralDiff(ordered[index - 1]!.representative, bucket.representative)),
  }));
}
