// Phase D2: turn a cyclic GeneratorGraph into an imperative emission plan.
//
// PLAN decision 9 semantics: a cycle edge means FEEDBACK — the loop is
// unrolled k steps with SHARED weights. This module does every graph-shaped
// decision once, target-agnostically, so each imperative emitter (Python
// today, PyTorch/tinygrad when they land) only walks the returned steps:
//
//   1. For every cycle (orderGraph's SCCs) pick the feedback edge(s) to cut:
//      the edges carrying `unrollSteps`, or — when none is marked (a loop
//      drawn on the board has no UI for k yet) — every in-loop edge landing
//      on the loop's single entry layer.
//   2. Check the cut actually breaks the loop and that the feedback tensor's
//      width is inferable from each cut edge's source layer (that width
//      shapes the zeros tensor the first unrolled step consumes).
//   3. Order the loop body (acyclic once cut) and the condensation of the
//      whole graph (loops collapsed to super-nodes), rooted at the model
//      inputs like the functional path.
//
// Any shape this cannot express honestly (nested/interlocking loops,
// ambiguous entries, feedback into an Input, detached loops, un-inferable
// widths) throws the same typed CyclicGraphError the non-imperative targets
// use — never garbage code. Pure module: no Vue, no DOM.

import { orderGraph, CyclicGraphError } from './orderGraph';
import type { OrderableGraph } from './orderGraph';
import { assertSafeCount } from './codegenSafety';
import type { GeneratorGraph } from './KerasGenerator';
import type { NnvpEdge, NnvpLayerId } from '../../types/model';

export const DEFAULT_UNROLL_STEPS = 3;
export const MAX_UNROLL_STEPS = 99;

/** A cut (feedback) edge: `target` reads `source`'s PREVIOUS-iteration value. */
export interface FeedbackCut {
  source: string;
  target: string;
  /** Feature width of the feedback tensor (from the source layer), for the
   *  zeros init of the first step. */
  width: number;
}

export interface UnrollLoopStep {
  kind: 'loop';
  /** Unroll count (the cycle edge's unrollSteps, default 3, sanitized). */
  k: number;
  /** Loop members in intra-loop emission order (feedback edges cut). */
  members: string[];
  cuts: FeedbackCut[];
}

export interface UnrollNodeStep {
  kind: 'node';
  id: string;
}

export type UnrollStep = UnrollNodeStep | UnrollLoopStep;

interface PlanInput {
  graph: GeneratorGraph;
  inputs: NnvpLayerId[];
  cycles: NnvpLayerId[][];
  excluded: NnvpLayerId[];
  /** The model's edge list (json.edges) — where unrollSteps lives. */
  edges: NnvpEdge[] | undefined;
  /** User-legible activity ("Python code generation") for errors. */
  activity: string;
  /** Renders one node id as a user-legible label for errors. */
  label: (id: NnvpLayerId) => string;
}

// Layers whose output feature width is knowable from their parameters alone —
// the only ones that may source a feedback edge (their width shapes the
// zeros tensor). Recurrent layers qualify only with return_sequences off.
const WIDTH_PARAM: Record<string, string> = {
  Dense: 'units', SimpleRNN: 'units', LSTM: 'units', GRU: 'units',
};
const MAX_FEEDBACK_WIDTH = 1_000_000;

function feedbackWidth(graph: GeneratorGraph, id: string): number | null {
  const data = graph[id]?.keras_data;
  if (!data) return null;
  const param = WIDTH_PARAM[data.name];
  if (param === undefined) return null;
  if (data.name !== 'Dense' && data.parameterValues?.return_sequences === true) return null;
  const width = data.parameterValues?.[param];
  if (typeof width !== 'number' || !Number.isInteger(width)
    || width < 1 || width > MAX_FEEDBACK_WIDTH) return null;
  return width;
}

/** Symmetrized adjacency over the generator graph (an edge declared on either
 *  side counts — same policy as orderGraph). String keys throughout. */
function symmetrize(graph: GeneratorGraph): Map<string, { sources: Set<string>; targets: Set<string> }> {
  const nodes = new Map<string, { sources: Set<string>; targets: Set<string> }>();
  Object.keys(graph).forEach(key => nodes.set(key, { sources: new Set(), targets: new Set() }));
  Object.entries(graph).forEach(([key, node]) => {
    node.targets.forEach((target) => {
      const other = nodes.get(String(target));
      if (other) {
        nodes.get(key)!.targets.add(String(target));
        other.sources.add(key);
      }
    });
    node.sources.forEach((source) => {
      const other = nodes.get(String(source));
      if (other) {
        nodes.get(key)!.sources.add(String(source));
        other.targets.add(key);
      }
    });
  });
  return nodes;
}

/**
 * @returns the imperative emission steps, in order; throws CyclicGraphError
 *   for loop shapes that cannot be unrolled honestly.
 */
export function planUnroll(input: PlanInput): UnrollStep[] {
  const { graph, inputs, cycles, excluded, edges, activity, label } = input;
  const refuse = (detail: string): never => {
    throw new CyclicGraphError(activity, excluded, cycles, label, detail);
  };

  const adjacency = symmetrize(graph);
  const loopOfNode = new Map<string, number>();
  cycles.forEach((group, index) => {
    group.forEach(member => loopOfNode.set(String(member), index));
  });

  // --- 1+2: per loop, pick and validate the feedback cut ---------------------------
  const loops: UnrollLoopStep[] = cycles.map((group) => {
    const members = new Set(group.map(String));
    const marked = (edges ?? []).filter(edge => members.has(String(edge.source))
      && members.has(String(edge.target)) && edge.unrollSteps !== undefined);
    let k = DEFAULT_UNROLL_STEPS;
    let cutPairs: Array<{ source: string; target: string }>;
    if (marked.length > 0) {
      k = Math.max(...marked.map(edge => assertSafeCount(edge.unrollSteps, 'unrollSteps', MAX_UNROLL_STEPS)));
      cutPairs = marked.map(edge => ({ source: String(edge.source), target: String(edge.target) }));
    } else {
      // No marked edge (loops drawn on the board carry no unrollSteps yet):
      // cut every in-loop edge landing on the loop's single entry layer.
      const inputIds = new Set(inputs.map(String));
      const entries = [...members].filter((member) => {
        const external = [...adjacency.get(member)!.sources].some(source => !members.has(source));
        return external || inputIds.has(member);
      });
      if (entries.length !== 1) {
        refuse('NNVP could not identify this loop\'s feedback edge: mark it '
          + '(unrollSteps) or give the loop a single entry layer.');
      }
      const entry = entries[0]!;
      cutPairs = [...members]
        .filter(member => adjacency.get(member)!.targets.has(entry))
        .map(member => ({ source: member, target: entry }));
    }
    const cuts: FeedbackCut[] = cutPairs.map(({ source, target }) => {
      if (graph[target]?.keras_data?.name === 'Input') {
        refuse(`The feedback edge ${label(source)} -> ${label(target)} targets an `
          + 'Input layer, which cannot consume feedback.');
      }
      const width = feedbackWidth(graph, source);
      if (width === null) {
        refuse(`The feedback tensor's size could not be inferred from the loop `
          + `source layer ${label(source)} (supported loop sources: Dense and `
          + 'SimpleRNN/LSTM/GRU without return_sequences).');
      }
      return { source, target, width: width! };
    });

    // Order the loop body with the feedback edges cut; if anything is left
    // unordered the cut did not break the loop (nested/interlocking cycles).
    const isCut = (source: string, target: string): boolean =>
      cuts.some(cut => cut.source === source && cut.target === target);
    const subgraph: OrderableGraph = {};
    members.forEach((member) => {
      subgraph[member] = {
        sources: [...adjacency.get(member)!.sources]
          .filter(source => members.has(source) && !isCut(source, member)),
        targets: [...adjacency.get(member)!.targets]
          .filter(target => members.has(target) && !isCut(member, target)),
      };
    });
    const ordered = orderGraph(subgraph);
    if (ordered.order.length !== members.size) {
      refuse('Cutting this loop\'s feedback edge(s) does not make its body '
        + 'acyclic (nested or interlocking loops are not supported yet).');
    }
    return {
      kind: 'loop', k, members: ordered.order.map(String), cuts,
    } satisfies UnrollLoopStep;
  });

  // --- 3: condensation order (loops collapsed), rooted at the model inputs ---------
  const condOf = (key: string): string => (
    loopOfNode.has(key) ? `#loop${loopOfNode.get(key)}` : key
  );
  const condensation: OrderableGraph = {};
  const condNode = (id: string) => {
    if (condensation[id] === undefined) condensation[id] = { sources: [], targets: [] };
    return condensation[id]!;
  };
  Object.keys(graph).forEach((key) => {
    const id = condOf(key);
    const node = condNode(id);
    adjacency.get(key)!.targets.forEach((target) => {
      const targetId = condOf(target);
      if (targetId === id) return;
      if (!node.targets.includes(targetId)) node.targets.push(targetId);
      const other = condNode(targetId);
      if (!other.sources.includes(id)) other.sources.push(id);
    });
  });
  const roots: string[] = [];
  inputs.forEach((rootId) => {
    const id = condOf(String(rootId));
    if (condensation[id] !== undefined && !roots.includes(id)) roots.push(id);
  });
  const condOrder = orderGraph(condensation, roots).order.map(String);

  // --- Expand and verify coverage ---------------------------------------------------
  const steps: UnrollStep[] = condOrder.map((id) => {
    if (id.startsWith('#loop')) return loops[Number(id.slice(5))]!;
    return { kind: 'node', id } satisfies UnrollNodeStep;
  });
  const emitted = new Set<string>();
  steps.forEach((step) => {
    if (step.kind === 'node') emitted.add(step.id);
    else step.members.forEach(member => emitted.add(member));
  });
  // Every node the cycle blocked from the functional path must now be
  // emitted; a leftover means an unreachable (detached) loop or a shape the
  // plan cannot express — refuse rather than truncate.
  excluded.forEach((id) => {
    if (!emitted.has(String(id))) {
      refuse(`Layer ${label(id)} is blocked by a loop this plan cannot reach `
        + 'from the model inputs.');
    }
  });
  return steps;
}
