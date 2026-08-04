/**
 * The model timeline (Phase F3): distinct workHashes from the run journal's
 * snapshots, ordered by first appearance, each step annotated with its
 * structural diff from the previous one. Pure over folds — no new events,
 * no new stores.
 */
import { logicTest } from '../harness/define';
import { buildModelTimeline } from '../../src/lib/Training/modelTimeline';
import type { FoldedRun } from '../../src/lib/Training/runEvents';
import type { KerasLayerJSON } from '../../src/types/model';

const kl = (name: string, parameterValues: Record<string, unknown> = {}): KerasLayerJSON => ({
  name, category: 'test', searchTerms: [], parameterDef: {}, parameterValues, customUserLayer: false,
} as unknown as KerasLayerJSON);

/** Input -> Dense(units) -> Output; the Dense's display name is annotation. */
function graph(units: number, denseName = 'Dense'): string {
  return JSON.stringify({
    formatVersion: 2,
    layers: [
      {
        class: 'Layer', id: 0, htmlID: 'layer-0', name: 'Input', x: 0, y: 0,
        inputLayers: [], outputLayers: [1], children: null, kerasLayer: kl('Input', { shape: [4] }), parentID: null,
      },
      {
        class: 'Layer', id: 1, htmlID: 'layer-1', name: denseName, x: 100, y: 0,
        inputLayers: [0], outputLayers: [2], children: null, kerasLayer: kl('Dense', { units }), parentID: null,
      },
      {
        class: 'Layer', id: 2, htmlID: 'layer-2', name: 'Output', x: 200, y: 0,
        inputLayers: [1], outputLayers: [], children: null, kerasLayer: kl('Output'), parentID: null,
      },
    ],
    edges: [
      { source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' },
      { source: 1, target: 2, id: 's1_t2', htmlID: 's1_t2' },
    ],
    inputs: [0],
    outputs: [1],
  });
}

function fold(uuid: string, startedAt: string, graphJson: string | null): FoldedRun {
  return {
    uuid, startedAt, engineId: 'tfjs', config: null, graphJson, hardware: null, parent: null,
    epochMetrics: [], outcome: 'completed', finishedAt: null, hidden: false,
    lastEventAt: startedAt, eventCount: 1,
  };
}

logicTest('modelTimeline: distinct architectures in first-seen order, diffs between steps', async ({ expect }) => {
  const steps = await buildModelTimeline([
    // Journal order is newest-first; the timeline must flip to oldest-first.
    fold('c', '2026-07-22T10:00:00.000Z', graph(128)),
    fold('b', '2026-07-21T10:00:00.000Z', graph(8, 'encoder')),
    fold('a', '2026-07-20T10:00:00.000Z', graph(8)),
  ]);
  expect(steps.length).toBe(2);
  expect(steps[0]!.summary).toBe('Input → Dense → Output');
  expect(steps[0]!.firstSeen).toBe('2026-07-20T10:00:00.000Z');
  expect(steps[0]!.runCount).toBe(2); // the rename is a doc variant, not a new step
  expect(steps[0]!.docVariants).toBe(2);
  expect(steps[0]!.diffFromPrevious).toBeNull();
  expect(steps[1]!.firstSeen).toBe('2026-07-22T10:00:00.000Z');
  expect(steps[1]!.diffFromPrevious!.some(
    line => line.includes('units') && line.includes('8') && line.includes('128'),
  )).toBe(true);
});

logicTest('modelTimeline: runs without a usable snapshot are left out', async ({ expect }) => {
  const steps = await buildModelTimeline([
    fold('a', '2026-07-20T10:00:00.000Z', graph(8)),
    fold('orphan', '2026-07-21T10:00:00.000Z', null),
    fold('corrupt', '2026-07-22T10:00:00.000Z', '{not json'),
  ]);
  expect(steps.length).toBe(1);
  expect(steps[0]!.runCount).toBe(1);
});

logicTest('modelTimeline: steps carry lastSeen — the latest iteration of the architecture', async ({ expect }) => {
  const steps = await buildModelTimeline([
    fold('a1', '2026-07-20T10:00:00.000Z', graph(8)),
    fold('a2', '2026-07-25T10:00:00.000Z', graph(8, 'encoder')), // same workHash, later
  ]);
  expect(steps.length).toBe(1);
  expect(steps[0]!.firstSeen).toBe('2026-07-20T10:00:00.000Z');
  expect(steps[0]!.lastSeen).toBe('2026-07-25T10:00:00.000Z');
});
