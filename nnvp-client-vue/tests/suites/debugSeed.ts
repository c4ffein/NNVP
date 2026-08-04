/**
 * The Debug seeder (Phase G follow-up): one deterministic month of intensive
 * use — checkpoints with recorded parents, branching, naming variants, runs
 * with realistic curves and outcomes — so the History/Models UX can be felt
 * at scale. Seeded events are localOnly (never sync), deviceId 'debug-seed'
 * (removable), and content-addressed (re-seeding appends nothing).
 */
import { appTest, logicTest } from '../harness/define';
import {
  DEBUG_SEED_DEVICE, generateMonthOfHistory, removeSeededHistory, seedMonthOfHistory,
} from '../../src/lib/Debug/monthOfUse';
import { buildEvolutionGraph } from '../../src/lib/Training/evolutionGraph';
import type { EvolutionInput } from '../../src/lib/Training/evolutionGraph';
import { modelIdentityOf } from '../../src/lib/Training/modelIdentity';
import { previewLayout } from '../../src/lib/Training/modelPreview';
import { listAllEvents } from '../../src/lib/Events/store';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import type { GraphCheckpointPayload } from '../../src/lib/Training/checkpoints';
import type { RunStartedPayload } from '../../src/lib/Training/runEvents';

const NOW = '2026-08-03T18:00:00.000Z';

logicTest('debugSeed: a month of history is big, deterministic and well-formed', async ({ expect }) => {
  const events = await generateMonthOfHistory({ now: NOW });
  // Scale: enough volume to stress the panels.
  expect(events.length).toBeGreaterThan(400);
  expect(events.every(event => event.deviceId === DEBUG_SEED_DEVICE)).toBe(true);
  // Deterministic: same inputs, byte-identical events (uuids included).
  const again = await generateMonthOfHistory({ now: NOW });
  expect(JSON.stringify(again)).toBe(JSON.stringify(events));
  // Every run stream is coherent: one started, ordered epochs, ≤1 finish.
  const streams = new Map<string, string[]>();
  events.forEach((event) => {
    if (!event.type.startsWith('run.') || !event.streamId) return;
    if (!streams.has(event.streamId)) streams.set(event.streamId, []);
    streams.get(event.streamId)!.push(event.type);
  });
  expect(streams.size).toBeGreaterThan(30);
  for (const types of streams.values()) {
    expect(types.filter(type => type === 'run.started').length).toBe(1);
    expect(types.filter(type => type === 'run.finished').length).toBeLessThanOrEqual(1);
  }
  // Some honest mess: not everything completed.
  const outcomes = events
    .filter(event => event.type === 'run.finished')
    .map(event => (event.payload as { outcome: string }).outcome);
  expect(outcomes).toContain('cancelled');
  expect(outcomes).toContain('error');
  expect(outcomes.length).toBeLessThan(streams.size); // some never finished
  expect(events.some(event => event.type === 'run.hidden')).toBe(true);
});

logicTest('debugSeed: checkpoints chain by recorded parent and the graph really branches', async ({ expect }) => {
  const events = await generateMonthOfHistory({ now: NOW });
  const checkpoints = events.filter(event => event.type === 'graph.checkpoint');
  expect(checkpoints.length).toBeGreaterThan(25);
  // Every snapshot is a valid model the identity module accepts.
  const first = checkpoints[0]!.payload as GraphCheckpointPayload;
  expect(await modelIdentityOf(first.graphJson)).not.toBeNull();
  // The evolution graph over the seed: many states, edges, and ≥2 lanes
  // (the week-3 fork) — the whole point of the exercise.
  const inputs: EvolutionInput[] = checkpoints.map(event => ({
    graphJson: (event.payload as GraphCheckpointPayload).graphJson,
    parent: (event.payload as GraphCheckpointPayload).parent,
    seenAt: event.wallTime,
    kind: 'checkpoint',
    ref: event.uuid,
  }));
  const graph = await buildEvolutionGraph(inputs);
  expect(graph.nodes.length).toBeGreaterThan(20);
  expect(graph.edges.length).toBeGreaterThan(15);
  expect(Math.max(...graph.nodes.map(node => node.lane))).toBeGreaterThan(0);
  // Runs carry the same lineage stamping checkpoints do.
  const started = events.find(event => event.type === 'run.started')!;
  expect('parent' in (started.payload as RunStartedPayload)).toBe(true);
});

logicTest('debugSeed: seeding is idempotent and removal deletes exactly the seed', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const first = await seedMonthOfHistory(store, { now: NOW });
  expect(first.appended).toBeGreaterThan(400);
  // Everything seeded is localOnly — the cloud must never see it.
  const stored = await listAllEvents(store);
  expect(stored.every(event => event.localOnly === true)).toBe(true);
  // Re-seeding appends nothing (content-addressed uuids + dedupe).
  const second = await seedMonthOfHistory(store, { now: NOW });
  expect(second.appended).toBe(0);
  const removed = await removeSeededHistory(store);
  expect(removed).toBe(first.appended);
  expect((await listAllEvents(store)).length).toBe(0);
});

appTest('debugSeed: the seeded month renders in History and the Models graph', async ({ history, models, records, expect }) => {
  // Seed through the store the drivers read (the panels do the real work).
  const events = await generateMonthOfHistory({ now: NOW });
  await records.seed('events', events.map(event => ({ ...event, localOnly: true })));
  await history.open();
  expect(await history.rowCount()).toBeGreaterThan(30);
  expect((await history.groupHeaders()).length).toBeGreaterThan(3);
  await history.close();
  await models.open();
  await models.showGraph();
  expect(await models.nodeCount()).toBeGreaterThan(20);
  await models.select(0);
  expect(await models.previewBoxCount()).toBeGreaterThan(2);
}, { timeoutMs: 30000 });

logicTest('debugSeed: the month includes non-linear architectures — merges, skips, a feedback cycle', async ({ expect }) => {
  const events = await generateMonthOfHistory({ now: NOW });
  const graphs = events
    .filter(event => event.type === 'graph.checkpoint')
    .map(event => JSON.parse((event.payload as GraphCheckpointPayload).graphJson) as {
      layers: { kerasLayer: { name: string } | null }[];
      edges: { unrollSteps?: number }[];
    });
  const hasLayer = (name: string) => graphs.some(
    graph => graph.layers.some(layer => layer.kerasLayer?.name === name),
  );
  expect(hasLayer('Add')).toBe(true); // the residual block
  expect(hasLayer('Concatenate')).toBe(true); // branch-merge AND the Elman
  // The char-RNN experiment: a cycle-closing edge carrying unrollSteps.
  expect(graphs.some(graph => graph.edges.some(edge => edge.unrollSteps !== undefined))).toBe(true);
  // Every non-linear snapshot still identifies and previews: more lines than
  // a chain would have (the skip/branch edges), no crashes.
  const branchy = graphs.find(graph => graph.layers.some(layer => layer.kerasLayer?.name === 'Add'))!;
  const layout = previewLayout(branchy as unknown as Parameters<typeof previewLayout>[0])!;
  expect(layout.lines.length).toBeGreaterThan(layout.boxes.length - 1);
});
