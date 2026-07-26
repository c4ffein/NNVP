// The ONE shared topological ordering for NNVP graphs (Phase D).
//
// Both consumers order the same way and diverge only in policy:
//   - codegen (KerasGenerator): excluded nodes => CyclicGraphError from every
//     generate* entry point — silent truncation of cyclic graphs is dead;
//   - .keras import (kerasImport.layoutModel): any cycle => the import is
//     refused with its historical user-facing error.
//
// `order` reproduces the exact semantics of the legacy createTreatmentList
// for acyclic graphs (byte-equal, pinned by tests): starting from the roots,
// a node is appended once ALL its sources are already appended, then its
// targets are visited in declared order; a node reachable through several
// paths (diamond) is appended exactly once.
//
// Pure module: no Vue, no DOM — runs identically under bun.

import type { NnvpLayer, NnvpLayerId, NnvpModel } from '../../types/model';

/** The structural surface orderGraph needs from a graph node (KerasGenerator's
 *  GeneratorGraph satisfies it as-is). */
export interface OrderableNode {
  sources: NnvpLayerId[];
  targets: NnvpLayerId[];
}

export type OrderableGraph = Record<NnvpLayerId, OrderableNode>;

export interface OrderGraphResult {
  /** Treatment order — every node whose whole source chain resolves. */
  order: NnvpLayerId[];
  /**
   * Nodes codegen may NOT silently drop: cycle members plus every node
   * starved by a cycle (transitively fed by one, so never orderable). Nodes
   * merely unreachable from the roots (stray half-wired subgraphs, no cycle
   * involved) are NOT excluded — they keep the shipped silent-omission
   * behavior.
   */
  excluded: NnvpLayerId[];
  /** The actual cycle groups: SCCs of size > 1, plus self-loop singletons. */
  cycles: NnvpLayerId[][];
}

/**
 * The typed refusal for cyclic graphs (PLAN decision 9): cyclic models route
 * to imperative code generation. Since Phase D2 the Python (Keras) target
 * emits them as a subclassing model; every consumer that (still) cannot
 * handle a cycle throws this instead of truncating. The message is
 * user-facing (menu downloads, training errors, assistant).
 */
export class CyclicGraphError extends Error {
  readonly excluded: NnvpLayerId[];
  readonly cycles: NnvpLayerId[][];

  /**
   * @param activity user-legible activity name ("Python code generation", ...)
   * @param excluded ids of the blocked nodes (cycle members + starved)
   * @param cycles the cycle groups
   * @param label renders one node id as a user-legible label
   * @param detail optional extra sentence — used by the imperative planner
   *   when a specific loop SHAPE is the blocker, not the target
   */
  constructor(
    activity: string,
    excluded: NnvpLayerId[],
    cycles: NnvpLayerId[][],
    label: (id: NnvpLayerId) => string,
    detail?: string,
  ) {
    super(
      `This graph contains a cycle, and ${activity} is not yet supported for `
      + 'models with feedback loops. '
      + (detail === undefined ? '' : `${detail} `)
      + 'Feedback loops are currently supported by Python (Keras subclassing) '
      + `generation only. Layers blocked by the cycle: ${excluded.map(label).join(', ')}.`,
    );
    this.name = 'CyclicGraphError';
    this.excluded = excluded;
    this.cycles = cycles;
  }
}

// --- Normalization -----------------------------------------------------------

interface NormalizedNode {
  /** The id value callers know this node by (kept as-is: number or string). */
  id: NnvpLayerId;
  /** Source/target keys, symmetrized (an edge declared on either side counts). */
  sources: string[];
  targets: string[];
  /** Original declared arrays — used to preserve legacy traversal VALUES. */
  declaredTargets: NnvpLayerId[];
}

const isModel = (input: NnvpModel | OrderableGraph): input is NnvpModel => (
  Array.isArray((input as NnvpModel).layers)
);

/** Flatten an NnvpModel's layer tree into leaf entries. */
function collectLeaves(layers: NnvpLayer[], out: NnvpLayer[]): void {
  layers.forEach((layer) => {
    if (layer.children === null || layer.children === undefined) out.push(layer);
    else collectLeaves(layer.children, out);
  });
}

function normalize(input: NnvpModel | OrderableGraph): Map<string, NormalizedNode> {
  const nodes = new Map<string, NormalizedNode>();
  const register = (id: NnvpLayerId, sources: NnvpLayerId[], targets: NnvpLayerId[]): void => {
    nodes.set(String(id), {
      id,
      sources: sources.map(String),
      targets: targets.map(String),
      declaredTargets: targets,
    });
  };
  if (isModel(input)) {
    const leaves: NnvpLayer[] = [];
    collectLeaves(input.layers || [], leaves);
    leaves.forEach(leaf => register(leaf.id, leaf.inputLayers || [], leaf.outputLayers || []));
  } else {
    Object.entries(input).forEach(([id, node]) => register(id, node.sources, node.targets));
  }
  // Symmetrize: wiring declared on only one side (a target without the mirror
  // source, or vice versa) still IS an edge — legacy files could be sloppy.
  // References to unknown ids are dropped (legacy behavior would crash on
  // them mid-traversal; nothing meaningful to order there).
  nodes.forEach((node, key) => {
    node.targets.forEach((target) => {
      const other = nodes.get(target);
      if (other && !other.sources.includes(key)) other.sources.push(key);
    });
    node.sources.forEach((source) => {
      const other = nodes.get(source);
      if (other && !other.targets.includes(key)) {
        other.targets.push(key);
        other.declaredTargets.push(node.id);
      }
    });
  });
  nodes.forEach((node) => {
    node.sources = node.sources.filter(source => nodes.has(source));
    const known: NnvpLayerId[] = [];
    node.targets = node.targets.filter((target, i) => {
      const keep = nodes.has(target);
      if (keep) known.push(node.declaredTargets[i]!);
      return keep;
    });
    node.declaredTargets = known;
  });
  return nodes;
}

// --- Cycle detection (iterative Tarjan SCC) -----------------------------------

function findCycles(nodes: Map<string, NormalizedNode>): { cycles: NnvpLayerId[][]; members: Set<string> } {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: NnvpLayerId[][] = [];
  const members = new Set<string>();
  let counter = 0;

  const strongConnect = (root: string): void => {
    // Iterative Tarjan: frame = [node, next-target-index].
    const frames: Array<[string, number]> = [[root, 0]];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const [key, targetIndex] = frame;
      if (targetIndex === 0) {
        index.set(key, counter);
        low.set(key, counter);
        counter += 1;
        stack.push(key);
        onStack.add(key);
      }
      const targets = nodes.get(key)!.targets;
      if (targetIndex < targets.length) {
        frame[1] += 1;
        const next = targets[targetIndex]!;
        if (!index.has(next)) {
          frames.push([next, 0]);
        } else if (onStack.has(next)) {
          low.set(key, Math.min(low.get(key)!, index.get(next)!));
        }
        continue;
      }
      // All targets explored: close the frame.
      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1]![0];
        low.set(parent, Math.min(low.get(parent)!, low.get(key)!));
      }
      if (low.get(key) === index.get(key)) {
        const group: string[] = [];
        for (;;) {
          const popped = stack.pop()!;
          onStack.delete(popped);
          group.push(popped);
          if (popped === key) break;
        }
        const selfLoop = group.length === 1 && nodes.get(group[0]!)!.targets.includes(group[0]!);
        if (group.length > 1 || selfLoop) {
          group.forEach(member => members.add(member));
          cycles.push(group.map(member => nodes.get(member)!.id));
        }
      }
    }
  };

  nodes.forEach((_, key) => {
    if (!index.has(key)) strongConnect(key);
  });
  return { cycles, members };
}

// --- The entry point -----------------------------------------------------------

/**
 * @param input an NnvpModel (roots default to `input.inputs`) or a bare
 *   `{sources, targets}` graph (roots default to its zero-source nodes)
 * @param roots explicit root ids (overrides the defaults)
 */
export function orderGraph(
  input: NnvpModel | OrderableGraph,
  roots?: NnvpLayerId[],
): OrderGraphResult {
  const nodes = normalize(input);
  const rootIds: NnvpLayerId[] = roots
    ?? (isModel(input)
      ? (input.inputs || [])
      : [...nodes.values()].filter(node => node.sources.length === 0).map(node => node.id));

  // Legacy createTreatmentList semantics, over the symmetrized wiring. The
  // VALUES pushed are the ids as reached (root value / declared target value)
  // so the order stays byte-equal with what the legacy traversal produced.
  const order: NnvpLayerId[] = [];
  const treated = new Set<string>();
  const visit = (id: NnvpLayerId): void => {
    const key = String(id);
    const node = nodes.get(key);
    if (node === undefined || treated.has(key)) return;
    if (node.sources.some(source => !treated.has(source))) return;
    order.push(id);
    treated.add(key);
    node.declaredTargets.forEach(visit);
  };
  rootIds.forEach(visit);

  const { cycles, members } = findCycles(nodes);

  // Excluded = cycle members + everything downstream of one (starved). BFS
  // over targets from the members; nodes the cycle starves can never be in
  // `order`, so no overlap is possible.
  const tainted = new Set<string>(members);
  const queue = [...members];
  while (queue.length > 0) {
    const key = queue.pop()!;
    nodes.get(key)!.targets.forEach((target) => {
      if (!tainted.has(target)) {
        tainted.add(target);
        queue.push(target);
      }
    });
  }
  const excluded: NnvpLayerId[] = [];
  nodes.forEach((node, key) => {
    if (tainted.has(key) && !treated.has(key)) excluded.push(node.id);
  });

  return { order, excluded, cycles };
}
