// Feature-dimension inference shared by the PyTorch and tinygrad helpers.
//
// Walks the treatment list (already in topological order, so every node's sources
// are resolved before the node itself) and derives, where the graph makes it
// possible, each node's output dimensions in the Keras (channels-last) convention:
//   - `features`: the last-axis size (Dense in_features, recurrent input_size) which
//     is also the channel count consumed by Conv / BatchNorm on the next node;
//   - `shape`: the FULL output shape (without batch), kept only while every axis is
//     still known - it is what makes Flatten's in-features computable.
// Conv2D and 2-D pooling compute their spatial output shape (valid/same padding,
// strides) so a downstream Flatten's in-features is derivable — that is what lets
// the generators emit a correct Linear after a conv stack. The 1-D/3-D variants
// still only track the channel count.
//
// Anything not derivable is null; the generators fall back to their documented
// defaults with a loud TODO comment so the user cannot miss the guess.
//
// Numeric parameter values (units, filters, output_dim) are read straight off
// parameterValues, which the editor populates with numbers for int params —
// the `as number` casts encode that trust, exactly like the untyped code did.

import type { NnvpLayerId, ParameterValue } from '../../types/model';
import type { GeneratorGraph } from './KerasGenerator';

export interface InferredDims {
  shape: number[] | null;
  features: number | null;
}

// Keras int-or-pair parameters ((3,3) may be stored as 3): normalized to a pair.
function asPair(value: ParameterValue | undefined, fallback: [number, number] | null): [number, number] | null {
  if (typeof value === 'number') return [value, value];
  if (Array.isArray(value) && value.length === 2
      && value.every(d => typeof d === 'number')) {
    return [value[0] as number, value[1] as number];
  }
  return fallback;
}

// One spatial axis through a conv/pool window, Keras semantics.
function convOut(size: number, kernel: number, stride: number, same: boolean): number {
  return same ? Math.ceil(size / stride) : Math.floor((size - kernel) / stride) + 1;
}

export default function inferFeatureDims(
  graph: GeneratorGraph, list: NnvpLayerId[],
): Record<NnvpLayerId, InferredDims> {
  const dims: Record<NnvpLayerId, InferredDims> = {};
  // Dim record of an already-treated node, with nulls for anything unknown.
  const dimsOf = (node: NnvpLayerId | undefined): InferredDims => dims[node as NnvpLayerId] || { shape: null, features: null };
  list.forEach((node) => {
    const { name, parameterValues } = graph[node]!.keras_data!;
    const p: Record<string, ParameterValue> = parameterValues || {};
    const sources = graph[node]!.sources || [];
    const source = dimsOf(sources[0]);
    let shape: number[] | null = null;
    let features: number | null = null;
    switch (name) {
      case 'Input':
        // The user-declared shape is the one fully-known starting point.
        if (Array.isArray(p.shape) && p.shape.length > 0
            && p.shape.every(d => typeof d === 'number')) {
          shape = p.shape.slice();
          features = shape[shape.length - 1]!;
        }
        break;
      case 'Dense':
        // Dense maps the last axis to `units`, leaving the other axes untouched.
        if (p.units !== undefined) {
          features = p.units as number;
          if (source.shape) shape = [...source.shape.slice(0, -1), p.units as number];
        }
        break;
      case 'LSTM':
      case 'GRU':
      case 'SimpleRNN':
      case 'RNN':
        // Recurrent output features = units (with or without return_sequences);
        // the timestep axis is not tracked, so only `features` survives.
        if (p.units !== undefined) features = p.units as number;
        break;
      case 'Embedding':
        // Embedding appends an `output_dim`-sized axis to its (integer) input.
        if (p.output_dim !== undefined) {
          features = p.output_dim as number;
          if (source.shape) shape = [...source.shape, p.output_dim as number];
        }
        break;
      case 'Conv2D':
        // Channels become `filters`; the spatial axes follow Keras' formula
        // (channels-last), so the full shape survives when the input's did.
        if (p.filters !== undefined) {
          features = p.filters as number;
          if (source.shape && source.shape.length === 3) {
            const kernel = asPair(p.kernel_size, null);
            const stride = asPair(p.strides ?? undefined, [1, 1]);
            const same = p.padding === 'same';
            if (kernel && stride) {
              const h = convOut(source.shape[0]!, kernel[0], stride[0], same);
              const w = convOut(source.shape[1]!, kernel[1], stride[1], same);
              if (h > 0 && w > 0) shape = [h, w, features];
            }
          }
        }
        break;
      case 'Conv1D':
      case 'Conv3D':
        // Channels become `filters`; spatial axes change in ways we do not compute.
        if (p.filters !== undefined) features = p.filters as number;
        break;
      case 'MaxPooling2D':
      case 'AveragePooling2D': {
        // Channel count unchanged; spatial axes shrink by the window (Keras:
        // strides default to pool_size, padding defaults to valid).
        features = source.features;
        if (source.shape && source.shape.length === 3) {
          const pool = asPair(p.pool_size, [2, 2]);
          const stride = asPair(p.strides ?? undefined, pool);
          const same = p.padding === 'same';
          if (pool && stride) {
            const h = convOut(source.shape[0]!, pool[0], stride[0], same);
            const w = convOut(source.shape[1]!, pool[1], stride[1], same);
            if (h > 0 && w > 0) shape = [h, w, source.shape[2]!];
          }
        }
        break;
      }
      case 'MaxPooling1D':
      case 'MaxPooling3D':
      case 'AveragePooling1D':
      case 'AveragePooling3D':
        // Pooling keeps the channel count but shrinks spatial axes we do not compute.
        features = source.features;
        break;
      case 'BatchNormalization':
      case 'Dropout':
      case 'Activation':
      case 'ReLU':
      case 'LeakyReLU':
      case 'Sigmoid':
      case 'Tanh':
      case 'Softmax':
      case 'ELU':
      case 'SELU':
      case 'GELU':
      case 'Output':
        // Shape-preserving: everything passes through unchanged.
        shape = source.shape ? source.shape.slice() : null;
        features = source.features;
        break;
      case 'PositionalEmbedding':
      case 'TransformerBlock':
        // NNVP text layers (textLayers.ts): both are shape-preserving.
        shape = source.shape ? source.shape.slice() : null;
        features = source.features;
        break;
      case 'LastToken':
        // Drops the timestep axis, keeps the feature axis.
        features = source.features;
        if (source.shape && source.shape.length >= 2) {
          shape = [source.shape[source.shape.length - 1]!];
        }
        break;
      case 'Flatten':
        // Only computable when the full predecessor shape is known.
        if (source.shape) {
          features = source.shape.reduce((acc, d) => acc * d, 1);
          shape = [features];
        }
        break;
      case 'Concatenate': {
        // Keras Concatenate defaults to axis=-1: features add up when all are known.
        const sourceDims = sources.map(dimsOf);
        if (sourceDims.length > 0 && sourceDims.every(d => d.features !== null)) {
          features = sourceDims.reduce((acc, d) => acc + d.features!, 0);
        }
        break;
      }
      case 'Add': {
        // Element-wise merge: features pass through when every source agrees.
        const sourceDims = sources.map(dimsOf);
        if (sourceDims.length > 0 && sourceDims.every(d => d.features !== null
            && d.features === sourceDims[0]!.features)) {
          features = sourceDims[0]!.features;
        }
        break;
      }
      default:
        // Unknown/unsupported layer: its output dims cannot be trusted.
        break;
    }
    dims[node] = { shape, features };
  });
  return dims;
}
