/**
 * The run journal: every Train click writes an immutable run record — config
 * snapshot, graph JSON, per-epoch metrics, outcome — through the RecordStore
 * seam ('runs' store). No weights in v1; "replay" means restoring the setup
 * and re-viewing the curves, not bit-identical reproduction.
 *
 * Consumers hold a RunHandle for the duration of a training: epoch() appends
 * a metrics row and persists, finish() stamps the outcome exactly once (a
 * second finish is a no-op — the cancel and error paths may both fire).
 *
 * TrainingConfigSnapshot is deliberately defined HERE, not imported from the
 * training-config store: a journaled record is a frozen copy, decoupled from
 * whatever the live config module evolves into.
 */

import type { RecordStore } from '../LocalStore/recordStore';
import { getRecordStore } from '../LocalStore/db';

export interface EpochMetrics {
  epoch: number;
  acc?: number;
  loss?: number;
  valAcc?: number;
  valLoss?: number;
}

export interface TrainingConfigSnapshot {
  dataset: string;
  optimizer: string;
  optimizerParams: Record<string, unknown>;
  epochs: number;
  loss: string;
}

export interface RunRecord {
  uuid: string;
  startedAt: string;
  finishedAt?: string;
  outcome: 'running' | 'completed' | 'cancelled' | 'error';
  error?: string;
  engineId: string;
  config: TrainingConfigSnapshot;
  graphJson: string;
  epochMetrics: EpochMetrics[];
  durationMs?: number;
  /** Phase 6: excluded from cloud push after a cloud-side delete. */
  localOnly?: boolean;
}

export interface RunHandle {
  uuid: string;
  epoch(m: EpochMetrics): Promise<void>;
  finish(outcome: 'completed' | 'cancelled' | 'error', error?: string): Promise<void>;
}

/**
 * Open a run: persists the 'running' record immediately, so even a crash
 * mid-training leaves a journaled trace.
 */
export async function startRun(
  init: { engineId: string; config: TrainingConfigSnapshot; graphJson: string },
  store: RecordStore = getRecordStore(),
): Promise<RunHandle> {
  const startedAtMs = Date.now();
  const record: RunRecord = {
    uuid: crypto.randomUUID(),
    startedAt: new Date(startedAtMs).toISOString(),
    outcome: 'running',
    engineId: init.engineId,
    config: init.config,
    graphJson: init.graphJson,
    epochMetrics: [],
  };
  await store.put('runs', record);
  let finished = false;
  return {
    uuid: record.uuid,
    async epoch(m: EpochMetrics): Promise<void> {
      record.epochMetrics.push(m);
      await store.put('runs', record);
    },
    async finish(outcome: 'completed' | 'cancelled' | 'error', error?: string): Promise<void> {
      if (finished) return; // idempotent: cancel and error paths may both fire
      finished = true;
      record.outcome = outcome;
      if (error !== undefined) record.error = error;
      record.finishedAt = new Date().toISOString();
      record.durationMs = Date.now() - startedAtMs;
      await store.put('runs', record);
    },
  };
}

/** All journaled runs, newest first (ISO startedAt sorts lexicographically). */
export async function listRuns(store: RecordStore = getRecordStore()): Promise<RunRecord[]> {
  const runs = await store.list<RunRecord>('runs');
  return runs.sort((a, b) => (b.startedAt < a.startedAt ? -1 : b.startedAt > a.startedAt ? 1 : 0));
}

export async function getRun(
  uuid: string,
  store: RecordStore = getRecordStore(),
): Promise<RunRecord | null> {
  return store.get<RunRecord>('runs', uuid);
}

/** Local delete only — the Phase 6 delete UX adds the cloud-side choices. */
export async function deleteRunLocal(
  uuid: string,
  store: RecordStore = getRecordStore(),
): Promise<void> {
  await store.delete('runs', uuid);
}
