/**
 * modelIdentity.ts — two-tier derived identity for a model snapshot (Phase F).
 *
 * The git tree-hash/commit-hash split applied to models:
 *
 *   workHash  — the COMPUTATION alone: leaf layer types + their parameter
 *               values, wiring (edges + input/output order), unroll counts.
 *               Two snapshots with equal workHash train identically. Layer
 *               names feed generated-code identifiers, so equal workHash
 *               means same semantics, NOT byte-identical emitted code.
 *   docHash   — workHash's inputs PLUS the annotation layer: layer names,
 *               comments (hashed only when present), and composite grouping.
 *               Equal workHash + differing docHash = the same network under
 *               different naming.
 *
 * Excluded from BOTH: positions, sizes, htmlIDs, formatVersion — anything
 * display-grade. Identity is derived, never stored (grouping agrees across
 * devices because the function is deterministic), and it is DOCUMENT-scoped:
 * layer ids are part of the projection, so the same architecture rebuilt from
 * scratch (fresh ids) hashes differently. Canonical graph labeling is parked.
 *
 * Everything here is pure and browser/bun-agnostic (crypto.subtle exists in
 * both); History/Compare/Timeline consume it, nothing here reads the board.
 */

import { deterministicUuid } from './runEvents';
import { DEFAULT_UNROLL_STEPS } from '../KerasInterface/unrollPlan';
import type { NnvpLayer, NnvpModel, ParameterValue } from '../../types/model';

export interface ModelIdentity {
  workHash: string;
  docHash: string;
  /** Human skim line, e.g. "Input → Dense×2 → Output". */
  summary: string;
}

/** Depth-first leaves (class 'Layer') — grouping is annotation, not shape. */
function leavesOf(layers: NnvpLayer[]): NnvpLayer[] {
  const leaves: NnvpLayer[] = [];
  const walk = (list: NnvpLayer[]) => list.forEach((entry) => {
    if (entry.class === 'Group') walk(entry.children ?? []);
    else leaves.push(entry);
  });
  walk(layers);
  return leaves;
}

/** parameterValues with deterministic key order (JSON.stringify is insertion-ordered). */
function sortedParams(values: Record<string, ParameterValue>): [string, ParameterValue][] {
  return Object.keys(values).sort().map(key => [key, values[key]!]);
}

/** The computation projection — everything workHash sees, nothing more. */
function workProjection(model: NnvpModel): unknown {
  const leaves = leavesOf(model.layers ?? [])
    .map(leaf => ({
      id: String(leaf.id),
      type: leaf.kerasLayer ? leaf.kerasLayer.name : null,
      params: leaf.kerasLayer ? sortedParams(leaf.kerasLayer.parameterValues) : [],
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = (model.edges ?? [])
    .map(edge => ({
      source: String(edge.source),
      target: String(edge.target),
      // Normalized so an explicit default equals the absent default — the
      // codegen semantics, not the stored bytes. (Only cycle-closing edges
      // ever read this; on the rest it is a harmless constant.)
      unroll: edge.unrollSteps === undefined ? DEFAULT_UNROLL_STEPS : edge.unrollSteps,
    }))
    .sort((a, b) => (a.source + '>' + a.target < b.source + '>' + b.target ? -1 : 1));
  return {
    leaves,
    edges,
    // Multi-input/-output ORDER matters to codegen, so these stay arrays.
    inputs: (model.inputs ?? []).map(String),
    outputs: (model.outputs ?? []).map(String),
  };
}

/** The annotation projection docHash adds: names, comments, grouping. */
function docProjection(model: NnvpModel): unknown {
  const annotations: unknown[] = [];
  const walk = (list: NnvpLayer[], parent: string | null) => list.forEach((entry) => {
    annotations.push({
      id: String(entry.id),
      name: entry.name,
      parent,
      group: entry.class === 'Group',
      // Hashed only when present, so growing the comment field never
      // retroactively shifted uncommented models' docHash.
      ...(entry.comment === undefined ? {} : { comment: entry.comment }),
    });
    if (entry.class === 'Group') walk(entry.children ?? [], String(entry.id));
  });
  walk(model.layers ?? [], null);
  annotations.sort((a, b) => {
    const idA = (a as { id: string }).id;
    const idB = (b as { id: string }).id;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
  return annotations;
}

/**
 * The summary string is a LINEARIZATION (leaf types in document order) — it
 * cannot show topology, so non-path graphs get honest markers instead:
 * ' ⋔' when any node branches/merges, ' ⟲' when the graph has feedback.
 */
function topologyMarkers(model: NnvpModel): string {
  const edges = (model.edges ?? []).map(edge => (
    { source: String(edge.source), target: String(edge.target) }));
  const degreeIn = new Map<string, number>();
  const degreeOut = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  edges.forEach(({ source, target }) => {
    degreeOut.set(source, (degreeOut.get(source) ?? 0) + 1);
    degreeIn.set(target, (degreeIn.get(target) ?? 0) + 1);
    if (!outgoing.has(source)) outgoing.set(source, []);
    outgoing.get(source)!.push(target);
  });
  const branching = [...degreeIn.values(), ...degreeOut.values()].some(count => count >= 2);
  // Cycle detection: iterative DFS, gray = on the current path.
  const state = new Map<string, 'gray' | 'black'>();
  let cyclic = false;
  for (const start of outgoing.keys()) {
    if (state.has(start)) continue; // eslint-disable-line no-continue
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, 'gray');
    while (stack.length && !cyclic) {
      const top = stack[stack.length - 1]!;
      const targets = outgoing.get(top.id) ?? [];
      if (top.next >= targets.length) {
        state.set(top.id, 'black');
        stack.pop();
      } else {
        const target = targets[top.next]!;
        top.next += 1;
        if (state.get(target) === 'gray') cyclic = true;
        else if (!state.has(target)) {
          state.set(target, 'gray');
          stack.push({ id: target, next: 0 });
        }
      }
    }
    if (cyclic) break;
  }
  return `${branching ? ' ⋔' : ''}${cyclic ? ' ⟲' : ''}`;
}

/** "Input → Dense×2 → Output": leaf types in document order, runs compressed.
 *  Non-path topologies carry markers (see topologyMarkers). */
export function archSummary(model: NnvpModel): string {
  const types = leavesOf(model.layers ?? [])
    .map(leaf => (leaf.kerasLayer ? leaf.kerasLayer.name : leaf.name));
  const parts: string[] = [];
  let run = 0;
  types.forEach((type, index) => {
    run += 1;
    if (type !== types[index + 1]) {
      parts.push(run > 1 ? `${type}×${run}` : type);
      run = 0;
    }
  });
  return parts.join(' → ') + topologyMarkers(model);
}

/** Parse leniently: identity must never throw on a hostile/corrupt snapshot. */
function parseModel(json: string | NnvpModel): NnvpModel | null {
  if (typeof json !== 'string') return json && typeof json === 'object' ? json : null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed as NnvpModel : null;
  } catch {
    return null;
  }
}

/**
 * Both hashes + the summary for one snapshot; null when the input is not a
 * model at all (an orphan fold's missing graphJson, a corrupt record).
 */
export async function modelIdentityOf(json: string | NnvpModel): Promise<ModelIdentity | null> {
  const model = parseModel(json);
  if (model === null) return null;
  const work = JSON.stringify(workProjection(model));
  const doc = JSON.stringify(docProjection(model));
  const [workHash, docHash] = await Promise.all([
    deterministicUuid(`nnvp:arch:${work}`),
    deterministicUuid(`nnvp:arch:${work}:doc:${doc}`),
  ]);
  return { workHash, docHash, summary: archSummary(model) };
}
