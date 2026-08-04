/**
 * Spatial coarsening for the far Map view (Phase H1): nearby settled nodes
 * contract into cluster blobs, multilevel-layout style. Deterministic
 * greedy centroid clustering — pure, no view code.
 */
import { logicTest } from '../harness/define';
import { coarsen } from '../../src/lib/Training/coarsen';

logicTest('coarsen: near points merge, far points stay apart, centroids sit between', ({ expect }) => {
  const clusters = coarsen([
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 30, y: 0 },
    { id: 'c', x: 500, y: 500 },
  ], 100);
  expect(clusters.length).toBe(2);
  const pair = clusters.find(cluster => cluster.ids.length === 2)!;
  expect(pair.ids.sort()).toEqual(['a', 'b']);
  expect(pair.x).toBeGreaterThan(0);
  expect(pair.x).toBeLessThan(30);
  expect(clusters.find(cluster => cluster.ids.length === 1)!.ids).toEqual(['c']);
});

logicTest('coarsen: deterministic regardless of input order', ({ expect }) => {
  const points = [
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 40, y: 10 }, { id: 'c', x: 90, y: 0 },
    { id: 'd', x: 400, y: 0 }, { id: 'e', x: 430, y: 20 },
  ];
  const forward = coarsen(points, 120);
  const reversed = coarsen([...points].reverse(), 120);
  const shape = (clusters: typeof forward) => clusters
    .map(cluster => cluster.ids.sort().join('+')).sort();
  expect(shape(forward)).toEqual(shape(reversed));
});

logicTest('coarsen: radius 0 keeps everything separate; huge radius merges all', ({ expect }) => {
  const points = [
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 50, y: 0 }, { id: 'c', x: 100, y: 0 },
  ];
  expect(coarsen(points, 0).length).toBe(3);
  const all = coarsen(points, 1e6);
  expect(all.length).toBe(1);
  expect(all[0]!.ids.length).toBe(3);
});
