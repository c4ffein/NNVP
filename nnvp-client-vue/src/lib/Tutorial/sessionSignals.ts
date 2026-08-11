// sessionSignals.ts — "what happened in this tab, this session" for tutorials.
//
// Course steps need to observe training ("a run finished on MNIST") and
// checkpointing, but tutorial predicates are synchronous, polled, and must
// never throw — while the event log is async IndexedDB. The bridge: the event
// store emits every newly appended DomainEvent on the app bus synchronously
// (lib/Events/store.ts), so this module keeps a tiny in-memory cache of run
// and checkpoint facts, installed at the boot seam (installAppServices) so the
// bun test world runs the identical wiring.
//
// Scope is deliberately per-session: events already on disk before this page
// load never re-emit (append dedupe), and events minted by OTHER instances
// (cloud sync pulls, legacy-record explosions — which also flow through
// appendEvent) are ignored by instanceId. "Done this session" is exactly the
// semantics a guided course wants.
//
// Vue-free, DOM-free; readers are sync and never throw.

import { bus } from '../Events/bus';
import { identity } from '../Events/identity';

/** The slice of Emitter this module needs — injectable for tests. */
export interface SignalsEmitterLike {
  on(type: `${string}.*`, handler: (payload: unknown, type: string) => void): () => void;
}

type SessionRunOutcome = 'completed' | 'cancelled' | 'error';

interface RunFacts {
  dataset: string | null;
  /** config.phase2Dataset — present only when fine-tuning was enabled. */
  phase2Dataset: string | null;
  engineId: string | null;
  /** Layer type names parsed (guarded) from run.started's graphJson. */
  layerNames: Set<string>;
  /** run.epoch events seen on this stream this session. */
  epochsSeen: number;
  outcome: SessionRunOutcome | null;
}

/** Extra constraints a run must satisfy to count for a step. */
export interface RunMatch {
  /** Require this layer type in the run's graph (e.g. 'TransformerBlock'). */
  withLayer?: string;
  /** Require fine-tuning onto this dataset to have been configured. */
  phase2Dataset?: string;
  /** Minimum run.epoch events seen (default 1 for runFinishedOn). */
  minEpochs?: number;
}

// Module-singleton state — one session, one cache.
const runFacts = new Map<string, RunFacts>();
let checkpointCount = 0;

function factsFor(streamId: string): RunFacts {
  let facts = runFacts.get(streamId);
  if (!facts) {
    // Orphan-tolerant: a run.epoch whose run.started we never saw still counts.
    facts = {
      dataset: null,
      phase2Dataset: null,
      engineId: null,
      layerNames: new Set(),
      epochsSeen: 0,
      outcome: null,
    };
    runFacts.set(streamId, facts);
  }
  return facts;
}

/** Parse the layer type names out of a run.started graphJson — guarded. */
function parseLayerNames(graphJson: unknown): Set<string> {
  const names = new Set<string>();
  if (typeof graphJson !== 'string') return names;
  try {
    const model = JSON.parse(graphJson) as { layers?: unknown };
    if (Array.isArray(model.layers)) {
      for (const layer of model.layers) {
        const name = (layer as { kerasLayer?: { name?: unknown } } | null)?.kerasLayer?.name;
        if (typeof name === 'string') names.add(name);
      }
    }
  } catch {
    // Unparseable graphJson: the run simply has no layer facts.
  }
  return names;
}

function handleEvent(raw: unknown, type: string, ownInstanceId: string): void {
  try {
    if (!raw || typeof raw !== 'object') return;
    const event = raw as {
      instanceId?: unknown;
      streamId?: unknown;
      payload?: unknown;
    };
    if (event.instanceId !== ownInstanceId) return; // sync pulls, legacy explosions
    if (type === 'graph.checkpoint') {
      checkpointCount += 1;
      return;
    }
    if (typeof event.streamId !== 'string') return;
    const payload = (event.payload && typeof event.payload === 'object'
      ? event.payload : {}) as Record<string, unknown>;
    if (type === 'run.started') {
      const facts = factsFor(event.streamId);
      const config = (payload.config && typeof payload.config === 'object'
        ? payload.config : {}) as Record<string, unknown>;
      facts.dataset = typeof config.dataset === 'string' ? config.dataset : null;
      facts.phase2Dataset = typeof config.phase2Dataset === 'string' ? config.phase2Dataset : null;
      facts.engineId = typeof payload.engineId === 'string' ? payload.engineId : null;
      facts.layerNames = parseLayerNames(payload.graphJson);
    } else if (type === 'run.epoch') {
      factsFor(event.streamId).epochsSeen += 1;
    } else if (type === 'run.finished') {
      const { outcome } = payload;
      if (outcome === 'completed' || outcome === 'cancelled' || outcome === 'error') {
        factsFor(event.streamId).outcome = outcome;
      }
    }
  } catch {
    // A signal cache must never break an event append.
  }
}

/** Drop all cached facts (fresh install, tests). */
export function resetSessionSignals(): void {
  runFacts.clear();
  checkpointCount = 0;
}

/**
 * Subscribe the cache to 'run.*' and 'graph.*'. Resets state on install (a
 * fresh page load — or bun-world boot — is a fresh session). Returns the
 * uninstaller, which unsubscribes only.
 */
export function installSessionSignals({
  events = bus as SignalsEmitterLike,
  ownInstanceId = identity.instanceId,
}: {
  events?: SignalsEmitterLike;
  ownInstanceId?: string;
} = {}): () => void {
  resetSessionSignals();
  const offRun = events.on('run.*', (payload, type) => handleEvent(payload, type, ownInstanceId));
  const offGraph = events.on('graph.*', (payload, type) => handleEvent(payload, type, ownInstanceId));
  return () => {
    offRun();
    offGraph();
  };
}

// --- readers (the predicate surface: sync, never throw) ----------------------

function matchingRuns(dataset: string, match?: RunMatch): RunFacts[] {
  const out: RunFacts[] = [];
  for (const facts of runFacts.values()) {
    if (facts.dataset !== dataset) continue;
    if (match && match.withLayer && !facts.layerNames.has(match.withLayer)) continue;
    if (match && match.phase2Dataset && facts.phase2Dataset !== match.phase2Dataset) continue;
    out.push(facts);
  }
  return out;
}

/** A run on `dataset` (satisfying `match`) started this session. */
export function runStartedOn(dataset: string, match?: RunMatch): boolean {
  return matchingRuns(dataset, match).length > 0;
}

/** Max run.epoch events seen across matching runs this session (0 if none). */
export function epochsSeenOn(dataset: string, match?: RunMatch): number {
  return matchingRuns(dataset, match)
    .reduce((max, facts) => Math.max(max, facts.epochsSeen), 0);
}

/**
 * A matching run reached its end this session: outcome 'completed' OR
 * 'cancelled' (stopping early after watching the loss fall is a fine way to
 * finish a lesson), with at least `minEpochs` (default 1) epoch events —
 * 'error' never completes a step.
 */
export function runFinishedOn(dataset: string, match?: RunMatch): boolean {
  const minEpochs = match && typeof match.minEpochs === 'number' ? match.minEpochs : 1;
  return matchingRuns(dataset, match).some(facts => (
    (facts.outcome === 'completed' || facts.outcome === 'cancelled')
    && facts.epochsSeen >= minEpochs
  ));
}

/** graph.checkpoint events appended by this instance this session. */
export function checkpointsThisSession(): number {
  return checkpointCount;
}
