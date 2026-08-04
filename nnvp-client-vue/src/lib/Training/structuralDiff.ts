/**
 * structuralDiff.ts — what changed between two model snapshots (Phase F3).
 *
 * Same identity philosophy as modelIdentity: layers match by DOCUMENT id
 * (stable across edits of one evolving model), leaves only (grouping is
 * annotation), and the computation/annotation split is explicit — renames
 * and comment edits are reported in their own fields and NEVER make
 * `identical` false. Pure functions of NnvpModel JSON.
 */

import type { NnvpLayer, NnvpModel } from '../../types/model';

export interface LayerRef {
  id: string;
  /** The catalog layer type (kerasLayer.name); null for typeless leaves. */
  type: string | null;
  name: string;
}

export interface ParamChange {
  layerId: string;
  layerType: string | null;
  param: string;
  from: unknown;
  to: unknown;
}

export interface StructuralDiff {
  addedLayers: LayerRef[];
  removedLayers: LayerRef[];
  changedParams: ParamChange[];
  addedEdges: { source: string; target: string }[];
  removedEdges: { source: string; target: string }[];
  /** Annotation-grade, kept apart from the computation changes above. */
  renamedLayers: { id: string; from: string; to: string }[];
  commentChanges: { id: string; from: string | null; to: string | null }[];
  /** True when the COMPUTATION is untouched (annotations may still differ). */
  identical: boolean;
}

/** Depth-first leaves, keyed by String(id) — mirrors modelIdentity's walk. */
function leafMap(model: NnvpModel): Map<string, NnvpLayer> {
  const leaves = new Map<string, NnvpLayer>();
  const walk = (list: NnvpLayer[]) => list.forEach((entry) => {
    if (entry.class === 'Group') walk(entry.children ?? []);
    else leaves.set(String(entry.id), entry);
  });
  walk(model.layers ?? []);
  return leaves;
}

const refOf = (id: string, leaf: NnvpLayer): LayerRef => ({
  id, type: leaf.kerasLayer ? leaf.kerasLayer.name : null, name: leaf.name,
});

const edgeKey = (edge: { source: string; target: string }) => `${edge.source}>${edge.target}`;

export function structuralDiff(a: NnvpModel, b: NnvpModel): StructuralDiff {
  const before = leafMap(a);
  const after = leafMap(b);
  const diff: StructuralDiff = {
    addedLayers: [],
    removedLayers: [],
    changedParams: [],
    addedEdges: [],
    removedEdges: [],
    renamedLayers: [],
    commentChanges: [],
    identical: true,
  };

  for (const [id, leaf] of after) {
    if (!before.has(id)) diff.addedLayers.push(refOf(id, leaf));
  }
  for (const [id, leaf] of before) {
    if (!after.has(id)) diff.removedLayers.push(refOf(id, leaf));
  }

  for (const [id, was] of before) {
    const is = after.get(id);
    if (!is) continue; // eslint-disable-line no-continue
    if (was.name !== is.name) diff.renamedLayers.push({ id, from: was.name, to: is.name });
    const commentWas = was.comment ?? null;
    const commentIs = is.comment ?? null;
    if (commentWas !== commentIs) diff.commentChanges.push({ id, from: commentWas, to: commentIs });
    const type = is.kerasLayer ? is.kerasLayer.name : null;
    const paramsWas = was.kerasLayer?.parameterValues ?? {};
    const paramsIs = is.kerasLayer?.parameterValues ?? {};
    for (const param of new Set([...Object.keys(paramsWas), ...Object.keys(paramsIs)])) {
      const from = paramsWas[param];
      const to = paramsIs[param];
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        diff.changedParams.push({ layerId: id, layerType: type, param, from, to });
      }
    }
  }

  const edgesOf = (model: NnvpModel) => new Map((model.edges ?? []).map((edge) => {
    const normalized = { source: String(edge.source), target: String(edge.target) };
    return [edgeKey(normalized), normalized];
  }));
  const edgesBefore = edgesOf(a);
  const edgesAfter = edgesOf(b);
  for (const [key, edge] of edgesAfter) {
    if (!edgesBefore.has(key)) diff.addedEdges.push(edge);
  }
  for (const [key, edge] of edgesBefore) {
    if (!edgesAfter.has(key)) diff.removedEdges.push(edge);
  }

  diff.identical = diff.addedLayers.length === 0 && diff.removedLayers.length === 0
    && diff.changedParams.length === 0
    && diff.addedEdges.length === 0 && diff.removedEdges.length === 0;
  return diff;
}

const layerLabel = (ref: LayerRef) => ref.type ?? ref.name;

/** The diff as human skim lines — the timeline's step annotations. */
export function describeDiff(diff: StructuralDiff): string[] {
  const lines: string[] = [];
  diff.addedLayers.forEach(ref => lines.push(`+ ${layerLabel(ref)}`));
  diff.removedLayers.forEach(ref => lines.push(`− ${layerLabel(ref)}`));
  diff.changedParams.forEach(change => lines.push(
    `${change.layerType ?? change.layerId}: ${change.param} ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`,
  ));
  diff.addedEdges.forEach(edge => lines.push(`+ edge ${edge.source} → ${edge.target}`));
  diff.removedEdges.forEach(edge => lines.push(`− edge ${edge.source} → ${edge.target}`));
  diff.renamedLayers.forEach(rename => lines.push(`renamed ${rename.from} → ${rename.to}`));
  diff.commentChanges.forEach(change => lines.push(
    change.to === null ? `comment removed on ${change.id}` : `comment on ${change.id}: "${change.to}"`,
  ));
  return lines;
}
