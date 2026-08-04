/**
 * The evolution graph (Phase G3): model states (docHash identity) from runs
 * and checkpoints, edges from RECORDED parentage only, commit-graph lanes.
 * Pure — the Models window is a thin binding over this.
 */
import { logicTest } from '../harness/define';
import { buildEvolutionGraph } from '../../src/lib/Training/evolutionGraph';
import type { EvolutionInput } from '../../src/lib/Training/evolutionGraph';
import { modelIdentityOf } from '../../src/lib/Training/modelIdentity';
import type { KerasLayerJSON } from '../../src/types/model';

const kl = (name: string, parameterValues: Record<string, unknown> = {}): KerasLayerJSON => ({
  name, category: 'test', searchTerms: [], parameterDef: {}, parameterValues, customUserLayer: false,
} as unknown as KerasLayerJSON);

function graph(units: number): string {
  return JSON.stringify({
    formatVersion: 2,
    layers: [
      {
        class: 'Layer', id: 0, htmlID: 'layer-0', name: 'Input', x: 0, y: 0,
        inputLayers: [], outputLayers: [1], children: null, kerasLayer: kl('Input', { shape: [4] }), parentID: null,
      },
      {
        class: 'Layer', id: 1, htmlID: 'layer-1', name: 'Dense', x: 100, y: 0,
        inputLayers: [0], outputLayers: [], children: null, kerasLayer: kl('Dense', { units }), parentID: null,
      },
    ],
    edges: [{ source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' }],
    inputs: [0],
    outputs: [1],
  });
}

const docHashOf = async (json: string) => (await modelIdentityOf(json))!.docHash;

const input = (
  graphJson: string, parent: string | null, seenAt: string,
  kind: 'run' | 'checkpoint' = 'checkpoint',
): EvolutionInput => ({
  graphJson, parent, seenAt, kind, ref: `${kind}-${seenAt}`,
});

logicTest('evolutionGraph: a recorded chain lays out as one lane, chronological rows', async ({ expect }) => {
  const a = graph(8);
  const b = graph(16);
  const c = graph(32);
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(b, await docHashOf(a), '2026-08-01T11:00:00.000Z'),
    input(c, await docHashOf(b), '2026-08-01T12:00:00.000Z'),
  ]);
  expect(built.nodes.length).toBe(3);
  expect(built.edges.length).toBe(2);
  expect(built.nodes.map(n => n.row)).toEqual([0, 1, 2]);
  expect(built.nodes.every(n => n.lane === 0)).toBe(true);
});

logicTest('evolutionGraph: a fork branches into a second lane', async ({ expect }) => {
  const a = graph(8);
  const rootHash = await docHashOf(a);
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(graph(16), rootHash, '2026-08-01T11:00:00.000Z'),
    input(graph(32), rootHash, '2026-08-01T12:00:00.000Z'),
  ]);
  expect(built.nodes.length).toBe(3);
  expect(built.edges.map(e => e.from)).toEqual([rootHash, rootHash]);
  const lanes = built.nodes.map(n => n.lane).sort();
  expect(lanes).toEqual([0, 0, 1]); // first child continues, the fork branches
});

logicTest('evolutionGraph: duplicate states merge; runs and checkpoints both count', async ({ expect }) => {
  const a = graph(8);
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(a, null, '2026-08-01T11:00:00.000Z', 'run'),
  ]);
  expect(built.nodes.length).toBe(1);
  expect(built.nodes[0]!.checkpointCount).toBe(1);
  expect(built.nodes[0]!.runCount).toBe(1);
  expect(built.nodes[0]!.firstSeen).toBe('2026-08-01T10:00:00.000Z');
});

logicTest('evolutionGraph: an unknown recorded parent degrades to a root, never throws', async ({ expect }) => {
  const built = await buildEvolutionGraph([
    input(graph(8), 'never-seen-doc-hash', '2026-08-01T10:00:00.000Z'),
    input('{not json', null, '2026-08-01T11:00:00.000Z'), // unusable snapshot: dropped
  ]);
  expect(built.nodes.length).toBe(1);
  expect(built.edges.length).toBe(0);
  expect(built.nodes[0]!.lane).toBe(0);
});

logicTest('evolutionGraph: same-summary children label themselves by their diff from the parent', async ({ expect }) => {
  const a = graph(8);
  const b = graph(128); // same layer types — the summary alone cannot tell them apart
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(b, await docHashOf(a), '2026-08-01T11:00:00.000Z'),
  ]);
  expect(built.nodes[0]!.label).toBe(built.nodes[0]!.summary); // roots keep the summary
  const child = built.nodes[1]!;
  expect(child.label).toContain('units');
  expect(child.label).toContain('128'); // "what changed", not a repeated summary
});

logicTest('evolutionGraph: nodes carry lastSeen across re-arrivals of the same state', async ({ expect }) => {
  const a = graph(8);
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(a, null, '2026-08-05T10:00:00.000Z', 'run'),
  ]);
  expect(built.nodes[0]!.firstSeen).toBe('2026-08-01T10:00:00.000Z');
  expect(built.nodes[0]!.lastSeen).toBe('2026-08-05T10:00:00.000Z');
});

logicTest('evolutionGraph: a new root reuses a lane whose lineage has ended (compaction)', async ({ expect }) => {
  const a = graph(8);
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(graph(16), await docHashOf(a), '2026-08-01T11:00:00.000Z'),
    // A brand-new lineage AFTER the first one went quiet: it belongs at the
    // far left, not drifting right into a fresh lane.
    input(graph(32), null, '2026-08-02T10:00:00.000Z'),
  ]);
  expect(built.nodes.map(n => n.lane)).toEqual([0, 0, 0]);
});

logicTest('evolutionGraph: compaction never routes a fork rail through a live lane', async ({ expect }) => {
  const a = graph(8);
  const rootHash = await docHashOf(a);
  const built = await buildEvolutionGraph([
    input(a, null, '2026-08-01T10:00:00.000Z'),
    input(graph(16), rootHash, '2026-08-01T11:00:00.000Z'), // continues lane 0
    input(graph(32), rootHash, '2026-08-01T12:00:00.000Z'), // fork: lane 0 is
    // occupied between the parent's row and this row — must NOT reuse it.
  ]);
  expect(built.nodes.map(n => n.lane).sort()).toEqual([0, 0, 1]);
});
