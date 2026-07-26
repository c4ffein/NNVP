// Full output-shape propagation for the 3D view, walking the generator's
// topological list. Unlike the codegen dim inference (which deliberately
// refuses spatial arithmetic so generated code never bakes in a wrong
// number), the VIEW can compute conv/pooling output sizes exactly — the
// Keras formulas are deterministic once kernel/stride/padding are known.
// Anything with unknown params or an unsupported layer stays null and
// cascades null downstream: the scene then shows a marker, never a guess.

import type { NnvpLayerId, ParameterValue } from '../../types/model';
import type { GeneratorGraph } from '../KerasInterface/KerasGenerator';

const SHAPE_PRESERVING = new Set([
  'BatchNormalization', 'Dropout', 'Activation', 'ReLU', 'LeakyReLU',
  'Sigmoid', 'Tanh', 'Softmax', 'ELU', 'SELU', 'GELU', 'Output',
  // Normalizations and the NNVP text layers (textLayers.ts) preserve shape.
  'LayerNormalization', 'UnitNormalization', 'RMSNormalization',
  'PositionalEmbedding', 'TransformerBlock',
]);

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

/** An int-or-tuple parameter, normalized to `rank` ints (Keras broadcast). */
function asTuple(value: ParameterValue | undefined, rank: number): number[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (value.length !== rank) return null;
    const dims = value.map(asPositiveInt);
    return dims.some(dim => dim === null) ? null : (dims as number[]);
  }
  const single = asPositiveInt(value);
  return single === null ? null : Array.from({ length: rank }, () => single);
}

/** One spatial axis through a conv/pool window — the exact Keras arithmetic. */
function convDim(
  input: number, kernel: number, stride: number, dilation: number, samePadding: boolean,
): number | null {
  const out = samePadding
    ? Math.ceil(input / stride)
    : Math.floor((input - dilation * (kernel - 1) - 1) / stride) + 1;
  return out >= 1 ? out : null;
}

function windowShape(
  source: number[], p: Record<string, ParameterValue>,
  opts: { rank: number; kernelParam: string; kernelDefault: number | null;
    stridesDefaultToKernel: boolean; channels: number | null; },
): number[] | null {
  const {
    rank, kernelParam, kernelDefault, stridesDefaultToKernel,
  } = opts;
  if (source.length !== rank + 1) return null; // spatial axes + channels-last
  const kernel = asTuple(p[kernelParam], rank)
    ?? (kernelDefault === null ? null : Array.from({ length: rank }, () => kernelDefault));
  if (!kernel) return null;
  const strides = asTuple(p.strides, rank) ?? (stridesDefaultToKernel ? kernel : kernel.map(() => 1));
  const dilation = asTuple(p.dilation_rate, rank) ?? kernel.map(() => 1);
  const samePadding = p.padding === 'same';
  const spatial: number[] = [];
  for (let axis = 0; axis < rank; axis += 1) {
    const out = convDim(source[axis]!, kernel[axis]!, strides[axis]!, dilation[axis]!, samePadding);
    if (out === null) return null;
    spatial.push(out);
  }
  const channels = opts.channels ?? source[rank]!;
  return [...spatial, channels];
}

/**
 * node id -> full output shape (channels-last, no batch axis), or null when
 * not exactly derivable. `list` comes from KerasGenerator (topological, so
 * every node's sources are resolved first).
 */
export default function walkShapes(
  graph: GeneratorGraph, list: NnvpLayerId[],
): Record<NnvpLayerId, number[] | null> {
  const shapes: Record<NnvpLayerId, number[] | null> = {};
  const shapeOf = (node: NnvpLayerId | undefined): number[] | null => (
    node === undefined ? null : shapes[node] ?? null);
  list.forEach((node) => {
    const { name, parameterValues } = graph[node]!.keras_data!;
    const p: Record<string, ParameterValue> = parameterValues || {};
    const sources = graph[node]!.sources || [];
    const source = shapeOf(sources[0]);
    let shape: number[] | null = null;
    if (name === 'Input') {
      if (Array.isArray(p.shape) && p.shape.length > 0) {
        const dims = p.shape.map(asPositiveInt);
        if (!dims.some(dim => dim === null)) shape = dims as number[];
      }
    } else if (name === 'Dense') {
      const units = asPositiveInt(p.units);
      if (units !== null && source) shape = [...source.slice(0, -1), units];
    } else if (SHAPE_PRESERVING.has(name)) {
      shape = source ? source.slice() : null;
    } else if (name === 'Embedding') {
      // Appends an output_dim axis: [T] -> [T, D].
      const outputDim = asPositiveInt(p.output_dim);
      if (source && outputDim !== null) shape = [...source, outputDim];
    } else if (name === 'LSTM' || name === 'GRU' || name === 'SimpleRNN') {
      // units on the feature axis; the timestep axis survives only with
      // return_sequences (Keras semantics).
      const units = asPositiveInt(p.units);
      if (units !== null && source && source.length >= 1) {
        shape = p.return_sequences === true ? [source[0]!, units] : [units];
      }
    } else if (name === 'LastToken') {
      // NNVP text layer: [T, D] -> [D].
      if (source && source.length >= 2) shape = [source[source.length - 1]!];
    } else if (name === 'Flatten') {
      if (source) shape = [source.reduce((acc, dim) => acc * dim, 1)];
    } else if (name === 'Conv1D' || name === 'Conv2D' || name === 'Conv3D') {
      const filters = asPositiveInt(p.filters);
      if (source && filters !== null) {
        shape = windowShape(source, p, {
          rank: Number(name[4]),
          kernelParam: 'kernel_size',
          kernelDefault: null, // kernel_size is required — no default
          stridesDefaultToKernel: false,
          channels: filters,
        });
      }
    } else if (/^(Max|Average)Pooling[123]D$/.test(name)) {
      if (source) {
        shape = windowShape(source, p, {
          rank: Number(name[name.length - 2]),
          kernelParam: 'pool_size',
          kernelDefault: 2,
          stridesDefaultToKernel: true, // Keras: strides default to pool_size
          channels: null, // pooling keeps the channel count
        });
      }
    } else if (/^Global(Max|Average)Pooling[123]D$/.test(name)) {
      if (source && source.length >= 2) shape = [source[source.length - 1]!];
    } else if (name === 'UpSampling1D' || name === 'UpSampling2D' || name === 'UpSampling3D') {
      const rank = Number(name[10]);
      const size = asTuple(p.size, rank) ?? Array.from({ length: rank }, () => 2);
      if (source && source.length === rank + 1) {
        shape = [...source.slice(0, rank).map((dim, axis) => dim * size[axis]!), source[rank]!];
      }
    } else if (name === 'Concatenate') {
      const all = sources.map(shapeOf);
      const first = all[0];
      if (first && all.every(candidate => candidate !== null
          && candidate.length === first.length
          && candidate.slice(0, -1).every((dim, axis) => dim === first[axis]))) {
        shape = [
          ...first.slice(0, -1),
          all.reduce((acc, candidate) => acc + candidate![candidate!.length - 1]!, 0),
        ];
      }
    } else if (['Add', 'Subtract', 'Multiply', 'Average', 'Maximum', 'Minimum'].includes(name)) {
      const all = sources.map(shapeOf);
      const first = all[0];
      if (first && all.every(candidate => candidate !== null
          && JSON.stringify(candidate) === JSON.stringify(first))) {
        shape = first.slice();
      }
    }
    shapes[node] = shape;
  });
  return shapes;
}
