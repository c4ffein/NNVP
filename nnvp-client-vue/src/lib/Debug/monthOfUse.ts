/**
 * monthOfUse.ts — one synthetic month of intensive use, as real events
 * (Phase G follow-up: the Debug menu's UX-at-scale probe).
 *
 * The scenario is a researcher iterating on image classifiers:
 *   week 1  dense MNIST baselines — units sweeps, a Dropout appears
 *   week 2  the jump to conv — filter sweeps, layers renamed/commented
 *   week 3  a FORK back to the dense line for Fashion MNIST (a real branch
 *           in the evolution graph) while conv work continues
 *   week 4  deeper conv + dropout sweeps, and the honest mess: cancelled
 *           runs, an OOM-style error, streams that never finished (browser
 *           closed mid-fit), a few hidden runs. Weekends are lighter.
 *
 * Three properties make this safe to point at a real store:
 *   - DETERMINISTIC: seeded PRNG + content-addressed uuids (deterministicUuid,
 *     the legacy-explosion trick) — same inputs, byte-identical events, so
 *     re-seeding appends nothing (appendEvent dedupes by uuid).
 *   - localOnly: seeded events NEVER sync — the cloud never sees them.
 *   - deviceId 'debug-seed': removal is an exact filter, not a guess. Real
 *     history is never destroyed; this is synthetic data, not user data.
 */

import { appendEvent, listAllEvents } from '../Events/store';
import { deterministicUuid } from '../Training/runEvents';
import { modelIdentityOf } from '../Training/modelIdentity';
import { getRecordStore } from '../LocalStore/db';
import type { RecordStore } from '../LocalStore/recordStore';
import type { DomainEvent } from '../Events/domainEvent';
import type { RunHardware, RunStartedPayload, TrainingConfigSnapshot } from '../Training/runEvents';
import type { KerasLayerJSON, NnvpLayer, NnvpModel } from '../../types/model';

export const DEBUG_SEED_DEVICE = 'debug-seed';

export interface SeedOptions {
  /** The moment the month ENDS (defaults to now); history spans 30 days back. */
  now?: string;
  seed?: number;
}

// --- deterministic randomness -------------------------------------------------

/** mulberry32 — tiny, deterministic, plenty for a scenario script. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0; // eslint-disable-line no-bitwise
  return () => {
    state = (state + 0x6d2b79f5) >>> 0; // eslint-disable-line no-bitwise
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1); // eslint-disable-line no-bitwise
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); // eslint-disable-line no-bitwise
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // eslint-disable-line no-bitwise
  };
}

// --- model specs → NnvpModel JSON --------------------------------------------

/** The mutable "what the researcher is editing" — materialized per snapshot. */
interface ModelSpec {
  /** 'chain' is sequential; the rest are the platform's non-linear shapes:
   *  'skip' = residual Add, 'concat' = two-branch merge, 'elman' = the
   *  feedback cycle (a cycle-closing edge carrying unrollSteps). */
  topology: 'chain' | 'skip' | 'concat' | 'elman';
  kind: 'dense' | 'conv';
  units: number[];
  filters: number[];
  dropout: number | null;
  /** The elman cycle's unroll count (only emitted on that topology). */
  unroll: number;
  /** Annotation-grade: the first hidden layer's display name + a comment. */
  headName: string | null;
  comment: string | null;
}

const kl = (name: string, parameterValues: Record<string, unknown>): KerasLayerJSON => ({
  name,
  category: 'debug',
  searchTerms: [],
  parameterDef: {},
  parameterValues,
  customUserLayer: false,
} as unknown as KerasLayerJSON);

/** Materialize a spec as format-v2 JSON with plausible board positions. */
function specToJson(spec: ModelSpec): string {
  const layers: NnvpLayer[] = [];
  const edges: { source: number; target: number; unrollSteps?: number }[] = [];
  const node = (type: string, params: Record<string, unknown>, x: number, y: number) => {
    const id = layers.length;
    layers.push({
      class: 'Layer',
      id,
      htmlID: `layer-${id}`,
      name: type,
      x,
      y,
      width: 90,
      height: 40,
      inputLayers: [],
      outputLayers: [],
      children: null,
      kerasLayer: kl(type, params),
      parentID: null,
    });
    return id;
  };
  const link = (source: number, target: number, unrollSteps?: number) => {
    edges.push({
      source, target, ...(unrollSteps === undefined ? {} : { unrollSteps }),
    });
    layers[source]!.outputLayers.push(target);
    layers[target]!.inputLayers.push(source);
  };
  const chain = (ids: number[]) => ids.slice(1).forEach((id, i) => link(ids[i]!, id));

  if (spec.topology === 'skip') {
    // Residual block: x = Conv(input); out = Add(x, Conv(x)).
    const filters = spec.filters[0] ?? 32;
    const input = node('Input', { shape: [28, 28] }, 60, 120);
    const convA = node('Conv2D', { filters, kernel_size: [3, 3], activation: 'relu' }, 210, 120);
    const convB = node('Conv2D', { filters, kernel_size: [3, 3], activation: 'relu' }, 360, 60);
    const add = node('Add', {}, 510, 120);
    const flatten = node('Flatten', {}, 660, 120);
    const head = node('Dense', { units: 10, activation: 'softmax' }, 810, 120);
    const output = node('Output', {}, 960, 120);
    chain([input, convA, convB, add, flatten, head, output]);
    link(convA, add); // the skip
  } else if (spec.topology === 'concat') {
    // Two parallel branches merged: Concatenate(Dense(a)(x), Dense(b)(x)).
    const [unitsA = 128, unitsB = 64] = spec.units;
    const input = node('Input', { shape: [28, 28] }, 60, 120);
    const flatten = node('Flatten', {}, 210, 120);
    const branchA = node('Dense', { units: unitsA, activation: 'relu' }, 380, 50);
    const branchB = node('Dense', { units: unitsB, activation: 'relu' }, 380, 190);
    const merge = node('Concatenate', {}, 550, 120);
    const head = node('Dense', { units: 10, activation: 'softmax' }, 700, 120);
    const output = node('Output', {}, 850, 120);
    chain([input, flatten]);
    link(flatten, branchA);
    link(flatten, branchB);
    link(branchA, merge);
    link(branchB, merge);
    chain([merge, head, output]);
  } else if (spec.topology === 'elman') {
    // The char-RNN experiment: hidden state fed back into the concat — a
    // cycle-closing edge carrying unrollSteps (Python unrolls, others refuse).
    const hidden = spec.units[0] ?? 128;
    const input = node('Input', { shape: [96] }, 60, 120);
    const merge = node('Concatenate', {}, 220, 120);
    const state = node('Dense', { units: hidden, activation: 'tanh' }, 380, 120);
    const head = node('Dense', { units: 96, activation: 'softmax' }, 540, 120);
    const output = node('Output', {}, 700, 120);
    chain([input, merge, state, head, output]);
    link(state, merge, spec.unroll); // the feedback — drawing cycles is legal
  } else {
    const ids: number[] = [node('Input', { shape: [28, 28] }, 60, 80)];
    const grid = (index: number) => [60 + index * 150, 80 + (index % 2) * 60] as const;
    const at = () => grid(layers.length);
    if (spec.kind === 'conv') {
      spec.filters.forEach((filters) => {
        ids.push(node('Conv2D', { filters, kernel_size: [3, 3], activation: 'relu' }, ...at()));
        ids.push(node('MaxPooling2D', { pool_size: [2, 2] }, ...at()));
      });
    }
    ids.push(node('Flatten', {}, ...at()));
    spec.units.forEach(units => ids.push(node('Dense', { units, activation: 'relu' }, ...at())));
    if (spec.dropout !== null) ids.push(node('Dropout', { rate: spec.dropout }, ...at()));
    ids.push(node('Dense', { units: 10, activation: 'softmax' }, ...at()));
    ids.push(node('Output', {}, ...at()));
    chain(ids);
  }
  // Annotations land on the first hidden layer — docHash variants without
  // workHash changes.
  const annotated = layers[1]!;
  if (spec.headName !== null) annotated.name = spec.headName;
  if (spec.comment !== null) annotated.comment = spec.comment;
  return JSON.stringify({
    formatVersion: 2,
    layers,
    edges: edges.map(edge => ({
      ...edge, id: `s${edge.source}_t${edge.target}`, htmlID: `s${edge.source}_t${edge.target}`,
    })),
    inputs: [0],
    // NNVP quirk: outputs = the layers FEEDING the Output node.
    outputs: [layers.length - 2],
  } satisfies NnvpModel);
}

// --- the scenario -------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export async function generateMonthOfHistory(options: SeedOptions = {}): Promise<DomainEvent[]> {
  const now = options.now ?? new Date().toISOString();
  const rng = makeRng(options.seed ?? 0xc4ffe1);
  const endMs = Date.parse(now);
  const startMs = endMs - 30 * DAY_MS;

  const events: DomainEvent[] = [];
  let eventCounter = 0;
  const seqByInstance = new Map<string, number>();
  const emit = async (
    type: string,
    instanceId: string,
    wallTime: string,
    payload: unknown,
    { streamId = null, dependsOn = [] }: { streamId?: string | null; dependsOn?: string[] } = {},
  ): Promise<DomainEvent> => {
    eventCounter += 1;
    const seq = (seqByInstance.get(instanceId) ?? 0) + 1;
    seqByInstance.set(instanceId, seq);
    const event: DomainEvent = {
      uuid: await deterministicUuid(`${DEBUG_SEED_DEVICE}:${eventCounter}:${type}`),
      type,
      streamId,
      deviceId: DEBUG_SEED_DEVICE,
      instanceId,
      seq,
      dependsOn,
      wallTime,
      payload,
    };
    events.push(event);
    return event;
  };

  /** Every state ever checkpointed — fork targets carry their docHash. */
  const states: { spec: ModelSpec; docHash: string; week: number }[] = [];
  let current: ModelSpec = {
    topology: 'chain', kind: 'dense', units: [64], filters: [], dropout: null,
    unroll: 3, headName: null, comment: null,
  };
  let parentDocHash: string | null = null;
  let runCounter = 0;

  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)]!;
  const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

  const checkpoint = async (instanceId: string, atMs: number, week: number) => {
    const graphJson = specToJson(current);
    const identity = (await modelIdentityOf(graphJson))!;
    if (identity.docHash === parentDocHash) return; // unchanged — like the verb
    await emit('graph.checkpoint', instanceId, new Date(atMs).toISOString(), {
      graphJson, parent: parentDocHash,
    });
    parentDocHash = identity.docHash;
    states.push({ spec: { ...current }, docHash: identity.docHash, week });
  };

  const trainingRun = async (instanceId: string, atMs: number, dataset: string) => {
    runCounter += 1;
    const streamId = await deterministicUuid(`${DEBUG_SEED_DEVICE}:run:${runCounter}`);
    const epochsPlanned = between(4, 18);
    const config: TrainingConfigSnapshot = {
      dataset,
      optimizer: pick(['rmsprop', 'adam', 'sgd']),
      optimizerParams: { learningRate: pick([0.01, 0.005, 0.001]) },
      epochs: epochsPlanned,
      loss: 'categoricalCrossentropy',
    };
    const hardware: RunHardware = rng() < 0.7
      ? { cores: 8, gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' }
      : { cores: 4 };
    const started = await emit('run.started', instanceId, new Date(atMs).toISOString(), {
      engineId: rng() < 0.25 ? 'tfjs-worker' : 'tfjs',
      config,
      graphJson: specToJson(current),
      hardware,
      parent: parentDocHash,
    } satisfies RunStartedPayload, { streamId });

    // Outcome mix: mostly completed; some cancelled early; a rare error; a
    // few streams simply never finish (the browser-closed case). Two scripted
    // beats guarantee the rare cases exist whatever the rng draws.
    const roll = rng();
    const outcome = runCounter === 17 ? 'error'
      : runCounter === 29 ? null
        : roll < 0.72 ? 'completed' : roll < 0.86 ? 'cancelled' : roll < 0.93 ? 'error' : null;
    const epochsRun = outcome === 'completed' ? epochsPlanned
      : outcome === null ? between(1, epochsPlanned)
        : between(0, Math.max(0, epochsPlanned - 2));
    // Saturating-exponential accuracy with a little noise; conv nets do better.
    const ceiling = current.kind === 'conv' ? 0.985 : 0.94;
    const tau = between(3, 6);
    let previousUuid = started.uuid;
    for (let epoch = 0; epoch < epochsRun; epoch += 1) {
      const progress = 1 - Math.exp(-(epoch + 1) / tau);
      const noise = (rng() - 0.5) * 0.02;
      const acc = Math.min(0.999, 0.35 + (ceiling - 0.35) * progress + noise);
      const epochEvent = await emit('run.epoch', instanceId,
        new Date(atMs + (epoch + 1) * 9000).toISOString(), {
          epoch,
          acc: Number(acc.toFixed(4)),
          valAcc: Number(Math.max(0.1, acc - 0.015 - rng() * 0.03).toFixed(4)),
          loss: Number((2.3 * Math.exp(-(epoch + 1) / tau) + 0.06 + rng() * 0.05).toFixed(4)),
          valLoss: Number((2.3 * Math.exp(-(epoch + 1) / tau) + 0.11 + rng() * 0.08).toFixed(4)),
        }, { streamId, dependsOn: [previousUuid] });
      previousUuid = epochEvent.uuid;
    }
    if (outcome !== null) {
      await emit('run.finished', instanceId,
        new Date(atMs + (epochsRun + 1) * 9000).toISOString(), {
          outcome,
          durationMs: (epochsRun + 1) * 9000,
          ...(outcome === 'error'
            ? { error: 'WebGL: CONTEXT_LOST_WEBGL — GPU memory exhausted' } : {}),
        }, { streamId, dependsOn: [previousUuid] });
    }
    // A few embarrassing experiments get hidden afterwards.
    if (outcome === 'completed' && rng() < 0.08) {
      await emit('run.hidden', instanceId,
        new Date(atMs + (epochsRun + 2) * 9000).toISOString(), {}, { streamId });
    }
  };

  for (let day = 0; day < 30; day += 1) {
    const week = Math.floor(day / 7);
    const dayStart = startMs + day * DAY_MS;
    const weekend = day % 7 >= 5;
    const sessions = weekend ? between(0, 1) : between(1, 3);
    const instanceId = `${DEBUG_SEED_DEVICE}-day-${day}`;
    for (let session = 0; session < sessions; session += 1) {
      const atMs = dayStart + (9 + session * 4 + rng() * 2) * 60 * 60 * 1000;
      // What happened this session, week-flavored (see the file comment).
      const action = rng();
      if (week === 0) {
        if (action < 0.5) current.units = [pick([32, 64, 96, 128, 192])];
        else if (action < 0.8) current.dropout = pick([null, 0.2, 0.3, 0.5]);
        else current.units = [pick([128, 256]), pick([32, 64])];
      } else if (week === 1) {
        if (current.kind === 'dense') {
          current = {
            ...current, kind: 'conv', topology: 'chain', units: [64], filters: [16],
            headName: null, comment: null,
          };
        } else if (action < 0.4) {
          current.filters = current.filters.map(() => pick([16, 32, 64]));
        } else if (action < 0.6) {
          current.headName = pick(['features', 'conv_stem', 'encoder']);
          current.comment = pick([null, 'the feature extractor', 'tune me later']);
        } else if (action < 0.8) {
          // The residual experiment: in and out of the skip topology.
          current = { ...current, topology: current.topology === 'skip' ? 'chain' : 'skip' };
        } else if (current.filters.length < 2) current.filters.push(32);
      } else if (week === 2 && action < 0.3 && states.some(state => state.spec.kind === 'dense')) {
        // The fork: back to a week-1 dense state, retargeted at Fashion MNIST.
        const base = pick(states.filter(state => state.spec.kind === 'dense'));
        current = { ...base.spec, units: [...base.spec.units], filters: [...base.spec.filters] };
        parentDocHash = base.docHash;
        current.units = [pick([128, 256])];
        current.comment = 'fashion-mnist branch';
      } else if (day === 15 && session === 0) {
        // A scripted beat (rng is texture, the story is guaranteed): the
        // two-branch merge experiment — wide + narrow, concatenated.
        current = { ...current, topology: 'concat', units: [pick([128, 256]), pick([32, 64])] };
      } else if (day === 22 && session === 0) {
        // Scripted beat: the char-RNN idea — the feedback cycle, unrolled k.
        current = {
          ...current, topology: 'elman', units: [pick([96, 128, 192])],
          unroll: pick([3, 4, 6]), comment: 'char-rnn experiment',
        };
      } else if (action < 0.45) {
        current.filters = current.filters.length
          ? [...current.filters.slice(0, -1), pick([32, 64, 128])] : [];
        current.units = [pick([64, 128, 256])];
      } else if (action < 0.7) {
        current.dropout = pick([null, 0.25, 0.4, 0.5]);
      } else if (current.kind === 'conv' && current.filters.length < 3 && action < 0.85) {
        current.filters.push(pick([64, 128]));
      } else {
        current.headName = pick(['features', 'backbone', 'stem', null]);
      }
      await checkpoint(instanceId, atMs, week);
      const dataset = week >= 2 && current.comment === 'fashion-mnist branch'
        ? 'Fashion MNIST' : pick(['MNIST', 'MNIST', 'Fashion MNIST']);
      const runs = between(0, 2);
      for (let run = 0; run < runs; run += 1) {
        await trainingRun(instanceId, atMs + (run + 1) * 30 * 60 * 1000, dataset);
      }
    }
  }
  return events;
}

// --- store plumbing -----------------------------------------------------------

/** Append the month (localOnly). Idempotent — appended counts NEW events only. */
export async function seedMonthOfHistory(
  store: RecordStore = getRecordStore(),
  options: SeedOptions = {},
): Promise<{ appended: number; total: number }> {
  const events = await generateMonthOfHistory(options);
  let appended = 0;
  for (const event of events) {
    if (await appendEvent(event, { store, localOnly: true })) appended += 1;
  }
  return { appended, total: events.length };
}

/** Delete exactly the seeded events (synthetic data — not user history). */
export async function removeSeededHistory(store: RecordStore = getRecordStore()): Promise<number> {
  let removed = 0;
  for (const event of await listAllEvents(store)) {
    if (event.deviceId === DEBUG_SEED_DEVICE) {
      await store.delete('events', event.uuid);
      removed += 1;
    }
  }
  return removed;
}
