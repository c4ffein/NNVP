/**
 * modelPreview.ts — a read-only mini rendering of a model snapshot (Phase
 * G3). The snapshot already stores every node's absolute position, so this
 * is no layout engine: boxes where the layers were, straight lines between
 * connected layer centers, one padded viewBox. Pure NnvpModel JSON in,
 * plain geometry out — the SVG itself is the caller's ten lines of template.
 * (Also the machinery History group thumbnails can reuse.)
 */

import type { NnvpLayer, NnvpModel } from '../../types/model';

export interface PreviewBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface PreviewLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * Present on BACKWARD edges (feedback — target left of source): the
   * quadratic control point of the arc that keeps the cycle visible instead
   * of hiding collinear under the forward chain.
   */
  bend?: { x: number; y: number };
}

export interface PreviewLayout {
  viewBox: { x: number; y: number; width: number; height: number };
  boxes: PreviewBox[];
  lines: PreviewLine[];
}

const DEFAULT_SIZE = { width: 90, height: 40 };
const PADDING = 16;

/** Geometry for one snapshot; null when there is nothing drawable. */
export function previewLayout(json: string | NnvpModel): PreviewLayout | null {
  let model: NnvpModel;
  try {
    model = typeof json === 'string' ? JSON.parse(json) as NnvpModel : json;
  } catch {
    return null;
  }
  if (!model || typeof model !== 'object') return null;

  const leaves: NnvpLayer[] = [];
  const walk = (list: NnvpLayer[]) => list.forEach((entry) => {
    if (entry.class === 'Group') walk(entry.children ?? []);
    else leaves.push(entry);
  });
  walk(Array.isArray(model.layers) ? model.layers : []);
  if (leaves.length === 0) return null;

  const boxes = new Map<string, PreviewBox>();
  leaves.forEach((leaf) => {
    boxes.set(String(leaf.id), {
      x: leaf.x,
      y: leaf.y,
      width: leaf.width ?? DEFAULT_SIZE.width,
      height: leaf.height ?? DEFAULT_SIZE.height,
      label: leaf.name,
    });
  });

  const lines: PreviewLine[] = [];
  (model.edges ?? []).forEach((edge) => {
    const from = boxes.get(String(edge.source));
    const to = boxes.get(String(edge.target));
    if (!from || !to) return;
    const line: PreviewLine = {
      x1: from.x + from.width / 2,
      y1: from.y + from.height / 2,
      x2: to.x + to.width / 2,
      y2: to.y + to.height / 2,
    };
    // Feedback edges run right-to-left; straight they'd overlap the forward
    // chain exactly (the elman case) — arc them below the row instead.
    if (line.x2 < line.x1) {
      line.bend = {
        x: (line.x1 + line.x2) / 2,
        y: Math.max(line.y1, line.y2) + 50,
      };
    }
    lines.push(line);
  });

  const all = [...boxes.values()];
  // A quadratic's apex sits at (y1 + 2·cy + y2) / 4 — count arcs into the box.
  const arcApexes = lines
    .filter(line => line.bend)
    .map(line => (line.y1 + 2 * line.bend!.y + line.y2) / 4);
  const minX = Math.min(...all.map(box => box.x)) - PADDING;
  const minY = Math.min(...all.map(box => box.y)) - PADDING;
  const maxX = Math.max(...all.map(box => box.x + box.width)) + PADDING;
  const maxY = Math.max(...all.map(box => box.y + box.height), ...arcApexes) + PADDING;
  return {
    viewBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    boxes: all,
    lines,
  };
}
