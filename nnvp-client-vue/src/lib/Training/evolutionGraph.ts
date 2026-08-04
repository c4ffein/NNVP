/**
 * evolutionGraph.ts — the model's history as a commit graph (Phase G3).
 *
 * Nodes are STATES (docHash identity — a rename is a different state, a
 * different node; grouping by network happens in the timeline list, not
 * here). Edges come from RECORDED parentage only — the `parent` stamped
 * into graph.checkpoint and run.started events at the moment they happened.
 * Nothing is ever inferred: an unknown parent degrades to a root, it never
 * invents an edge. Content-addressed parents mean two devices that forked
 * the same state draw ONE branch point after sync.
 *
 * Lane layout is the classic commit-graph rule: the first child continues
 * its parent's lane, later children (forks) open new lanes, roots open
 * their own. Rows are chronological by first appearance.
 */

import { modelIdentityOf } from './modelIdentity';
import { structuralDiff, describeDiff } from './structuralDiff';
import type { NnvpModel } from '../../types/model';

export interface EvolutionInput {
  graphJson: string;
  /** The recorded parent docHash; null = root (or a pre-G event). */
  parent: string | null;
  /** When this snapshot happened (wall time, display/order only). */
  seenAt: string | null;
  kind: 'run' | 'checkpoint';
  /** The source event/stream uuid — lets the UI link back. */
  ref: string;
}

export interface EvolutionNode {
  docHash: string;
  workHash: string;
  summary: string;
  /**
   * The node's display line. Usually the summary — but when the parent has
   * the SAME summary (a param sweep, a rename: type-identical, so a repeated
   * summary says nothing), it becomes the diff from the parent instead
   * ("Dense: units 8 → 128").
   */
  label: string;
  /** The earliest snapshot of this state — what the preview renders. */
  graphJson: string;
  firstSeen: string | null;
  /** The state's latest re-arrival (any run/checkpoint of this docHash). */
  lastSeen: string | null;
  runCount: number;
  checkpointCount: number;
  /** The recorded parent (earliest occurrence wins); null = root. */
  parent: string | null;
  lane: number;
  row: number;
}

export interface EvolutionGraph {
  nodes: EvolutionNode[];
  /** parent docHash → child docHash, both ends guaranteed present. */
  edges: { from: string; to: string }[];
}

export async function buildEvolutionGraph(inputs: EvolutionInput[]): Promise<EvolutionGraph> {
  interface Bucket extends Omit<EvolutionNode, 'lane' | 'row' | 'label'> { }
  const buckets = new Map<string, Bucket>();
  for (const entry of inputs) {
    const identity = await modelIdentityOf(entry.graphJson);
    if (identity === null) continue; // eslint-disable-line no-continue
    let bucket = buckets.get(identity.docHash);
    if (!bucket) {
      bucket = {
        docHash: identity.docHash,
        workHash: identity.workHash,
        summary: identity.summary,
        graphJson: entry.graphJson,
        firstSeen: entry.seenAt,
        lastSeen: entry.seenAt,
        runCount: 0,
        checkpointCount: 0,
        parent: entry.parent,
      };
      buckets.set(identity.docHash, bucket);
    }
    if (entry.kind === 'run') bucket.runCount += 1;
    else bucket.checkpointCount += 1;
    if (entry.seenAt !== null && (bucket.lastSeen === null || entry.seenAt > bucket.lastSeen)) {
      bucket.lastSeen = entry.seenAt;
    }
    if (entry.seenAt !== null && (bucket.firstSeen === null || entry.seenAt < bucket.firstSeen)) {
      // The earliest occurrence defines the state: its snapshot AND its
      // recorded parent (later re-arrivals of the same state add counts only).
      bucket.firstSeen = entry.seenAt;
      bucket.graphJson = entry.graphJson;
      bucket.parent = entry.parent;
    }
  }

  const ordered = [...buckets.values()].sort((a, b) => {
    const keyA = a.firstSeen ?? '';
    const keyB = b.firstSeen ?? '';
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  // Lanes, with COMPACTION: the first child continues the parent's lane;
  // forks and roots take the LEFTMOST lane that is free for their whole
  // span (a lane is busy until its chain's last row; a fork's rail also
  // occupies the lane from the parent's row down, so reuse requires the
  // lane free from there). A new lineage started after everything went
  // quiet lands back at the far left instead of drifting right forever.
  const rowOf = new Map<string, number>(ordered.map((bucket, row) => [bucket.docHash, row]));
  const childrenOf = new Map<string, Bucket[]>(); // in row order (ordered walk)
  ordered.forEach((bucket) => {
    if (bucket.parent === null || !buckets.has(bucket.parent)) return;
    if (!childrenOf.has(bucket.parent)) childrenOf.set(bucket.parent, []);
    childrenOf.get(bucket.parent)!.push(bucket);
  });
  // A chain = a node plus its continuation children; its end row bounds the
  // lane's lifetime. Computed bottom-up so each lookup is O(1).
  const chainEnd = new Map<string, number>();
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const bucket = ordered[index]!;
    const continuation = childrenOf.get(bucket.docHash)?.[0];
    chainEnd.set(bucket.docHash, continuation
      ? chainEnd.get(continuation.docHash)! : rowOf.get(bucket.docHash)!);
  }
  const laneOf = new Map<string, number>();
  const laneEnd: number[] = []; // per lane: the last row it occupies
  const nodes: EvolutionNode[] = ordered.map((bucket, row) => {
    const parentBucket = bucket.parent !== null ? buckets.get(bucket.parent) : undefined;
    let lane: number;
    if (parentBucket && childrenOf.get(bucket.parent!)?.[0] === bucket) {
      lane = laneOf.get(bucket.parent!)!; // the continuation child
    } else {
      const freeFrom = parentBucket ? rowOf.get(bucket.parent!)! : row - 1;
      const reusable = laneEnd.findIndex(end => end <= freeFrom);
      lane = reusable === -1 ? laneEnd.length : reusable;
    }
    laneEnd[lane] = Math.max(laneEnd[lane] ?? -1, chainEnd.get(bucket.docHash)!);
    laneOf.set(bucket.docHash, lane);
    // A repeated summary reads as "nothing changed" — say what DID change.
    let label = bucket.summary;
    if (parentBucket && parentBucket.summary === bucket.summary) {
      try {
        const lines = describeDiff(structuralDiff(
          JSON.parse(parentBucket.graphJson) as NnvpModel,
          JSON.parse(bucket.graphJson) as NnvpModel,
        ));
        if (lines.length) {
          const joined = lines.join(' · ');
          label = joined.length > 70 ? `${joined.slice(0, 67)}…` : joined;
        }
      } catch { /* unparseable snapshot: the summary stands */ }
    }
    return {
      ...bucket, label, parent: parentBucket ? bucket.parent : null, lane, row,
    };
  });

  const edges = nodes
    .filter(node => node.parent !== null)
    .map(node => ({ from: node.parent!, to: node.docHash }));
  return { nodes, edges };
}
