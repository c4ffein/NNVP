/**
 * weightsFile.ts — a trained model's weights as an nnvp weights file
 * (safetensors bytes, PLAN.md section I step (a)): export from a training
 * session, import back into a session built for the SAME network.
 *
 * Why not tfjs's own variable names: tfjs uniquifies them per page
 * (`dense_Dense1/kernel`, then `.../kernel_1` for the next model built), so a
 * name-keyed file would not survive a reload. Tensor names in the file are
 * therefore CANONICAL — `<nnvp layer id>/<weight name>` — derived through the
 * same codegen contract the Inspector relies on (one tf layer per real graph
 * node, in treatment order: lib/Inspector/probe.matchLayersToIds). Layer ids
 * are part of the workHash projection, so "same workHash" ⇒ "same canonical
 * names", which is what makes the identity check below sufficient.
 *
 * The verifier is shared by cloud restore (later) and file import: the file
 * must carry nnvp metadata whose workHash equals the target graph's, every
 * tensor must exist on the target with the same shape, and the write is
 * all-or-nothing. Typed errors, never a half-written model.
 *
 * tf is never imported: the model is read through a narrow structural
 * surface (bun-testable with real tfjs or fakes), writes go through the
 * session's own setWeights.
 */

import { matchLayersToIds, orderedRealLayerIds } from '../Inspector/probe';
import { modelIdentityOf } from './modelIdentity';
import { decodeSafetensors, encodeSafetensors, shapeSize } from './safetensors';
import type { SafetensorEntry } from './safetensors';
import type { NamedWeights, TrainingSession } from './engine';

/** Stamped into the file's `__metadata__`; bump when the naming or metadata contract changes. */
export const WEIGHTS_FILE_FORMAT = 'nnvp-weights/1';
export const WEIGHTS_FILE_EXTENSION = '.safetensors';

/** Metadata keys (string→string, per the safetensors spec). */
export const WEIGHTS_META = {
  format: 'nnvp.format',
  workHash: 'nnvp.workHash',
  summary: 'nnvp.summary',
} as const;

// --- The structural tf surface this module reads (never imports tfjs) ---

export interface WeightsVariable {
  /** The per-page-unique tf name — the key getWeights()/setWeights() use. */
  name: string;
  /** The name before tfjs uniquified it (`<layer name>/<weight name>`). */
  originalName: string;
  shape: number[];
}

export interface WeightsModelLayer {
  id: number;
  name: string;
  getClassName(): string;
  weights: WeightsVariable[];
}

export interface WeightsModel {
  layers: WeightsModelLayer[];
}

/** The slice of a TrainingSession this module needs. */
export type WeightsSession = Pick<TrainingSession, 'model' | 'graphJson' | 'getWeights' | 'setWeights'>;

export type WeightsFileErrorCode =
  | 'no-model' // the session has no tf model to read/write (worker/tinygrad engines)
  | 'graph' // the graph JSON is not a model, or the model/graph pairing fails
  | 'file' // not a readable safetensors file (cause: SafetensorsError)
  | 'format' // a safetensors file, but not an nnvp weights file
  | 'identity' // an nnvp weights file for a DIFFERENT network
  | 'names' // tensor set differs from the target model's
  | 'shape'; // a tensor exists on both sides with different shapes

export class WeightsFileError extends Error {
  readonly code: WeightsFileErrorCode;

  constructor(code: WeightsFileErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WeightsFileError';
    this.code = code;
  }
}

export interface CanonicalWeight {
  /** `<nnvp layer id>/<weight name>` — stable across sessions and reloads. */
  canonical: string;
  /** The tf variable name in THIS model (getWeights/setWeights key). */
  tfName: string;
  shape: number[];
}

// tfjs names sub-scopes of wrapper layers with per-page uids too
// (`forward_lstm_LSTM1`); strip the `_<Class><n>` tail from every intermediate
// segment so nested names stay stable. The final segment (kernel, bias, …)
// never carries one.
const TF_UID_TAIL = /_[A-Za-z]+\d+$/;

function canonicalSuffix(variable: WeightsVariable, layerName: string): string {
  const prefix = `${layerName}/`;
  const rest = variable.originalName.startsWith(prefix)
    ? variable.originalName.slice(prefix.length)
    : variable.originalName;
  const segments = rest.split('/');
  return segments
    .map((segment, i) => (i < segments.length - 1 ? segment.replace(TF_UID_TAIL, '') : segment))
    .join('/');
}

/**
 * The model's variables in generation order (layer by layer, each layer's
 * weights in its own order), paired with their canonical names. Throws
 * WeightsFileError('graph') when the model and graph don't pair up (the
 * Inspector's own message) and ('names') on a canonical collision — a
 * collision would silently mis-save, so it is refused instead.
 */
export function canonicalWeights(model: WeightsModel, graphJson: string): CanonicalWeight[] {
  let pairs: Array<{ id: string; layer: WeightsModelLayer }>;
  try {
    pairs = matchLayersToIds(model.layers, orderedRealLayerIds(graphJson))
      .map(pair => ({ id: String(pair.id), layer: pair.layer as WeightsModelLayer }));
  } catch (error) {
    throw new WeightsFileError('graph', `Weights: ${(error as Error).message}`, { cause: error });
  }
  const out: CanonicalWeight[] = [];
  const seen = new Set<string>();
  pairs.forEach(({ id, layer }) => {
    layer.weights.forEach((variable) => {
      const canonical = `${id}/${canonicalSuffix(variable, layer.name)}`;
      if (seen.has(canonical)) {
        throw new WeightsFileError('names', `Weights: two variables of layer ${id} both map to "${canonical}"`);
      }
      seen.add(canonical);
      out.push({ canonical, tfName: variable.name, shape: [...variable.shape] });
    });
  });
  return out;
}

function modelOf(session: WeightsSession): WeightsModel {
  const { model } = session;
  if (!model || typeof model !== 'object' || !Array.isArray((model as WeightsModel).layers)) {
    throw new WeightsFileError('no-model', 'Weights: this training engine keeps no model on the main thread — export/import needs the tfjs engine.');
  }
  return model as WeightsModel;
}

async function identityOf(graphJson: string): Promise<{ workHash: string; summary: string }> {
  const identity = await modelIdentityOf(graphJson);
  if (identity === null) throw new WeightsFileError('graph', 'Weights: the graph JSON is not a model.');
  return identity;
}

/** `nnvp-weights-<workHash prefix>.safetensors` — content-named, so two exports of the same network share a filename. */
export function weightsFileName(workHash: string): string {
  return `nnvp-weights-${workHash.replace(/-/g, '').slice(0, 8)}${WEIGHTS_FILE_EXTENSION}`;
}

export interface ExportedWeights {
  bytes: Uint8Array;
  fileName: string;
  workHash: string;
  tensorCount: number;
}

/**
 * The session's current weights as nnvp weights-file bytes. Deterministic:
 * the same weights on the same network give the same bytes (no timestamps —
 * the bytes are what content addressing will hash).
 */
export async function exportWeights(session: WeightsSession, graphJson: string): Promise<ExportedWeights> {
  const model = modelOf(session);
  const identity = await identityOf(graphJson);
  const names = canonicalWeights(model, graphJson);
  const weights = await session.getWeights();
  const entries: SafetensorEntry[] = names.map(({ canonical, tfName, shape }) => {
    const data = weights[tfName];
    if (data === undefined) {
      throw new WeightsFileError('names', `Weights: the session did not return variable "${tfName}"`);
    }
    if (shapeSize(shape) !== data.length) {
      throw new WeightsFileError('shape', `Weights: variable "${tfName}" holds ${data.length} values for shape [${shape.join(', ')}]`);
    }
    return { name: canonical, dtype: 'F32', shape, data };
  });
  const bytes = encodeSafetensors(entries, {
    [WEIGHTS_META.format]: WEIGHTS_FILE_FORMAT,
    [WEIGHTS_META.workHash]: identity.workHash,
    [WEIGHTS_META.summary]: identity.summary,
  });
  return { bytes, fileName: weightsFileName(identity.workHash), workHash: identity.workHash, tensorCount: entries.length };
}

export interface WeightsFileInfo {
  workHash: string;
  summary: string;
  tensorCount: number;
}

/**
 * Read an nnvp weights file's identity without a target model — the first
 * two verifier steps (readable safetensors, nnvp metadata present).
 */
export function describeWeightsFile(bytes: Uint8Array | ArrayBuffer): WeightsFileInfo {
  let decoded;
  try {
    decoded = decodeSafetensors(bytes);
  } catch (error) {
    throw new WeightsFileError('file', `Weights: not a readable safetensors file (${(error as Error).message})`, { cause: error });
  }
  const { metadata } = decoded;
  if (metadata[WEIGHTS_META.format] !== WEIGHTS_FILE_FORMAT || typeof metadata[WEIGHTS_META.workHash] !== 'string') {
    throw new WeightsFileError('format', 'Weights: this safetensors file was not written by nnvp (no nnvp metadata) — it can\'t be matched to a network.');
  }
  return {
    workHash: metadata[WEIGHTS_META.workHash]!,
    summary: metadata[WEIGHTS_META.summary] ?? '',
    tensorCount: decoded.entries.length,
  };
}

/**
 * Verify a weights file against a session built for `graphJson` and, only if
 * EVERYTHING checks out, write all tensors into the session. Returns how many
 * were applied.
 */
export async function importWeights(
  session: WeightsSession,
  graphJson: string,
  bytes: Uint8Array | ArrayBuffer,
): Promise<{ applied: number; workHash: string }> {
  const model = modelOf(session);
  const info = describeWeightsFile(bytes);
  const identity = await identityOf(graphJson);
  if (info.workHash !== identity.workHash) {
    throw new WeightsFileError(
      'identity',
      `Weights: this file belongs to a different network (${info.summary || 'unknown'}), not to the current one (${identity.summary}).`,
    );
  }
  const decoded = decodeSafetensors(bytes); // already validated by describeWeightsFile
  const byCanonical = new Map(decoded.entries.map(entry => [entry.name, entry]));
  const targets = canonicalWeights(model, graphJson);
  const missing = targets.filter(target => !byCanonical.has(target.canonical)).map(target => target.canonical);
  const targetNames = new Set(targets.map(target => target.canonical));
  const extra = decoded.entries.filter(entry => !targetNames.has(entry.name)).map(entry => entry.name);
  if (missing.length > 0 || extra.length > 0) {
    const parts = [
      missing.length > 0 ? `missing ${missing.join(', ')}` : '',
      extra.length > 0 ? `unexpected ${extra.join(', ')}` : '',
    ].filter(Boolean);
    throw new WeightsFileError('names', `Weights: the file's tensors don't match the network (${parts.join('; ')}).`);
  }
  const named: NamedWeights = {};
  targets.forEach((target) => {
    const entry = byCanonical.get(target.canonical)!;
    const same = entry.shape.length === target.shape.length && entry.shape.every((dim, i) => dim === target.shape[i]);
    if (!same) {
      throw new WeightsFileError(
        'shape',
        `Weights: "${target.canonical}" is [${entry.shape.join(', ')}] in the file but [${target.shape.join(', ')}] in the network.`,
      );
    }
    named[target.tfName] = entry.data;
  });
  await session.setWeights(named);
  return { applied: targets.length, workHash: identity.workHash };
}
