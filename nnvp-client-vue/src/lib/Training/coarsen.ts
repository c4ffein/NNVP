/**
 * coarsen.ts — spatial coarsening for the far Map view (Phase H1).
 *
 * The multilevel-graph idea (contract nearby nodes into supernodes as you
 * go up a level) applied to the SETTLED layout: from far enough away,
 * states closer than `radius` melt into one blob the view can label with a
 * count. Deterministic greedy centroid clustering — points join the
 * nearest existing cluster within radius (ids processed in sorted order),
 * with a merge pass so chains that drift together still fuse. Pure module;
 * the view picks the radius from its zoom factor.
 */

export interface CoarsePoint {
  id: string;
  x: number;
  y: number;
}

export interface Cluster {
  ids: string[];
  /** Member centroid. */
  x: number;
  y: number;
}

export function coarsen(points: CoarsePoint[], radius: number): Cluster[] {
  const clusters: Cluster[] = [];
  for (const point of [...points].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    let best: Cluster | null = null;
    let bestDistance = Infinity;
    for (const cluster of clusters) {
      const distance = Math.hypot(cluster.x - point.x, cluster.y - point.y);
      if (distance < radius && distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }
    if (best) {
      best.ids.push(point.id);
      best.x += (point.x - best.x) / best.ids.length;
      best.y += (point.y - best.y) / best.ids.length;
    } else {
      clusters.push({ ids: [point.id], x: point.x, y: point.y });
    }
  }
  // Merge pass: greedy insertion can leave two clusters whose centroids
  // drifted within radius of each other — fuse them (repeat to fixpoint).
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const a = clusters[i]!;
        const b = clusters[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) < radius) {
          const total = a.ids.length + b.ids.length;
          a.x = (a.x * a.ids.length + b.x * b.ids.length) / total;
          a.y = (a.y * a.ids.length + b.y * b.ids.length) / total;
          a.ids.push(...b.ids);
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return clusters;
}
