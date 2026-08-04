/**
 * The force simulation behind the Obsidian-style Map (Phase H): repulsion +
 * link springs + light gravity, deterministic (seeded golden-spiral
 * positions, no randomness) so layouts reproduce and tests can pin them.
 */
import { logicTest } from '../harness/define';
import { seedPositions, simulate, tick } from '../../src/lib/Training/forceLayout';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => (
  Math.hypot(a.x - b.x, a.y - b.y));

logicTest('forceLayout: deterministic — same inputs, same settled layout', ({ expect }) => {
  const run = () => {
    const nodes = seedPositions(['a', 'b', 'c', 'd']);
    simulate(nodes, [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }], 200);
    return nodes.map(node => [Math.round(node.x), Math.round(node.y)]);
  };
  expect(run()).toEqual(run());
});

logicTest('forceLayout: linked nodes end closer than unlinked ones, none collapse', ({ expect }) => {
  const nodes = seedPositions(['a', 'b', 'c', 'd', 'e']);
  simulate(nodes, [{ source: 'a', target: 'b' }], 300);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const linked = dist(byId.get('a')!, byId.get('b')!);
  const unlinked = Math.min(
    dist(byId.get('a')!, byId.get('d')!),
    dist(byId.get('a')!, byId.get('e')!),
  );
  expect(linked).toBeLessThan(unlinked);
  // Repulsion keeps everything apart — no two nodes on top of each other.
  for (const one of nodes) {
    for (const other of nodes) {
      if (one !== other) expect(dist(one, other)).toBeGreaterThan(20);
    }
  }
  // And nothing exploded into NaN or infinity.
  expect(nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
});

logicTest('forceLayout: the simulation settles — movement decays over ticks', ({ expect }) => {
  const nodes = seedPositions(['a', 'b', 'c', 'd', 'e', 'f']);
  const edges = [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'a', target: 'd' },
  ];
  const early = tick(nodes, edges);
  simulate(nodes, edges, 400);
  const late = tick(nodes, edges);
  expect(late).toBeLessThan(early / 4);
});

logicTest('forceLayout: fixed nodes stay put while the rest arrange around them', ({ expect }) => {
  const nodes = seedPositions(['a', 'b', 'c']);
  const pinned = nodes[0]!;
  pinned.fixed = true;
  const before = { x: pinned.x, y: pinned.y };
  simulate(nodes, [{ source: 'a', target: 'b' }], 200);
  expect(pinned.x).toBe(before.x);
  expect(pinned.y).toBe(before.y);
});
