/**
 * The run journal, event-sourced (PLAN.md Phase C): every Train click opens
 * an append-only event stream — run.started, run.epoch per metrics row,
 * run.finished exactly once — through the domain event log
 * (lib/Events/store.ts, 'events' RecordStore). Readers get FOLDS
 * (lib/Training/runEvents.ts), never raw state: listRuns() folds every
 * stream, newest first, hidden filtered by default.
 *
 * There is deliberately NO stored 'running' state anywhere: a fold's outcome
 * stays null until run.finished arrives, and liveness is the pure isStale()
 * display rule — the executing TrainingZone's RunController is the only
 * "training here" truth (locked decision 4).
 *
 * "Delete" is hideRun() — a reversible run.hidden event that syncs for free
 * (locked decision 6). Cloud purge (DELETE /events/by-stream) is a separate
 * out-of-band operation owned by the sync layer, never an event.
 *
 * Legacy: the old 'runs' RecordStore is READ-ONLY from here on. On first use
 * per store, existing RunRecords explode into synthetic events with
 * deterministic uuids (runEvents.legacyRunEvents) — idempotent (append
 * dedupes by uuid) and convergent across devices. The old records are left
 * untouched (c4ffein purges them out-of-band later).
 */

import type { RecordStore } from '../LocalStore/recordStore';
import { getRecordStore } from '../LocalStore/db';
import { appendEvent, listAllEvents, makeEvent } from '../Events/store';
import {
  foldRun, legacyRunEvents,
} from './runEvents';
import type {
  EpochMetrics, FoldedRun, RunFinishedPayload, RunOutcome, RunStartedPayload,
  TrainingConfigSnapshot,
} from './runEvents';
import type { DomainEvent } from '../Events/domainEvent';

export type { EpochMetrics, FoldedRun, TrainingConfigSnapshot } from './runEvents';

/** The LEGACY record shape of the read-only 'runs' store (pre-event journal).
 *  Kept for the explosion and for anything still reading old exports. */
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
  /** Cloud-side delete flag (sync's localOnly contract). */
  localOnly?: boolean;
}

export interface RunHandle {
  uuid: string;
  epoch(m: EpochMetrics): Promise<void>;
  finish(outcome: RunOutcome, error?: string): Promise<void>;
}

// --- legacy explosion ---------------------------------------------------------

/**
 * Explode every legacy RunRecord into its deterministic synthetic events.
 * Safe to run any number of times: appendEvent dedupes by uuid, and the
 * uuids are content-addressed, so a re-run appends nothing. Records flagged
 * localOnly explode into localOnly events (they were detached from the
 * cloud; their events must never push either).
 */
export async function explodeLegacyRuns(store: RecordStore = getRecordStore()): Promise<void> {
  const legacy = await store.list<RunRecord>('runs');
  for (const record of legacy) {
    if (!record || typeof record.uuid !== 'string' || !record.uuid) continue;
    for (const event of await legacyRunEvents(record)) {
      await appendEvent(event, { store, localOnly: record.localOnly === true });
    }
  }
}

const explosions = new WeakMap<RecordStore, Promise<void>>();

/** The once-per-store gate every journal read/write goes through. */
export function ensureLegacyRunsExploded(store: RecordStore = getRecordStore()): Promise<void> {
  let pending = explosions.get(store);
  if (!pending) {
    pending = explodeLegacyRuns(store);
    // A failed explosion must not poison the store forever — retry next call.
    pending.catch(() => { explosions.delete(store); });
    explosions.set(store, pending);
  }
  return pending;
}

// --- the write side -------------------------------------------------------------

/**
 * Open a run: appends run.started immediately, so even a crash mid-training
 * leaves a journaled trace. Later events chain dependsOn to the previous one,
 * so the stream stays causally ordered even across a future device handoff.
 */
export async function startRun(
  init: { engineId: string; config: TrainingConfigSnapshot; graphJson: string },
  store: RecordStore = getRecordStore(),
): Promise<RunHandle> {
  await ensureLegacyRunsExploded(store);
  const startedAtMs = Date.now();
  const streamId = crypto.randomUUID();
  const started = makeEvent<RunStartedPayload>('run.started', {
    streamId,
    payload: { engineId: init.engineId, config: init.config, graphJson: init.graphJson },
  });
  await appendEvent(started, { store });
  let previousUuid = started.uuid;
  let finished = false;
  return {
    uuid: streamId,
    async epoch(m: EpochMetrics): Promise<void> {
      const event = makeEvent<EpochMetrics>('run.epoch', {
        streamId, payload: m, dependsOn: [previousUuid],
      });
      await appendEvent(event, { store });
      previousUuid = event.uuid;
    },
    async finish(outcome: RunOutcome, error?: string): Promise<void> {
      if (finished) return; // idempotent: cancel and error paths may both fire
      finished = true;
      const payload: RunFinishedPayload = { outcome, durationMs: Date.now() - startedAtMs };
      if (error !== undefined) payload.error = error;
      await appendEvent(makeEvent<RunFinishedPayload>('run.finished', {
        streamId, payload, dependsOn: [previousUuid],
      }), { store });
    },
  };
}

/** Hide a run from history — reversible, and it syncs like any other event.
 *  `localOnly` marks the event device-private (the purge-both path, where
 *  pushing it would recreate the just-purged cloud stream). */
export async function hideRun(
  streamId: string,
  store: RecordStore = getRecordStore(),
  { localOnly = false }: { localOnly?: boolean } = {},
): Promise<void> {
  await appendEvent(
    makeEvent<Record<string, never>>('run.hidden', { streamId, payload: {} }),
    { store, localOnly },
  );
}

export async function unhideRun(
  streamId: string,
  store: RecordStore = getRecordStore(),
): Promise<void> {
  await appendEvent(
    makeEvent<Record<string, never>>('run.unhidden', { streamId, payload: {} }),
    { store },
  );
}

// --- the read side (folds only) ---------------------------------------------------

function runStreams(events: DomainEvent[]): Map<string, DomainEvent[]> {
  const streams = new Map<string, DomainEvent[]>();
  for (const event of events) {
    if (typeof event.type !== 'string' || !event.type.startsWith('run.')) continue;
    if (typeof event.streamId !== 'string' || !event.streamId) continue;
    let stream = streams.get(event.streamId);
    if (!stream) { stream = []; streams.set(event.streamId, stream); }
    stream.push(event);
  }
  return streams;
}

/** Newest-first sort key: when the run started, or its last event failing that. */
function foldSortKey(fold: FoldedRun): string {
  return fold.startedAt ?? fold.lastEventAt ?? '';
}

/**
 * Every journaled run as a fold, newest first. Hidden runs are filtered out
 * unless asked for (the History tab's default view).
 */
export async function listRuns(
  store: RecordStore = getRecordStore(),
  { includeHidden = false }: { includeHidden?: boolean } = {},
): Promise<FoldedRun[]> {
  await ensureLegacyRunsExploded(store);
  const folds = [...runStreams(await listAllEvents(store)).values()].map(foldRun);
  const visible = includeHidden ? folds : folds.filter(fold => !fold.hidden);
  return visible.sort((a, b) => {
    const keyA = foldSortKey(a);
    const keyB = foldSortKey(b);
    return keyB < keyA ? -1 : keyB > keyA ? 1 : 0;
  });
}

/** One run's fold, or null when its stream has no events. */
export async function getRun(
  streamId: string,
  store: RecordStore = getRecordStore(),
): Promise<FoldedRun | null> {
  await ensureLegacyRunsExploded(store);
  const events = (await listAllEvents(store)).filter(event => event.streamId === streamId);
  return events.length ? foldRun(events) : null;
}
