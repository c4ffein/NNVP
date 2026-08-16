/**
 * Unit tests for the safetensors codec (src/lib/Training/safetensors.ts):
 * byte layout pinned against a header written by tinygrad's reference
 * `safe_save` (experiments/tinygrad-webgpu-export/out-inference/net.safetensors),
 * round trips, determinism, and every validation path a user-supplied file
 * can trip.
 */
import { logicTest } from '../harness/define';
import {
  SafetensorsError, decodeSafetensors, encodeSafetensors, shapeSize,
} from '../../src/lib/Training/safetensors';
import type { SafetensorEntry } from '../../src/lib/Training/safetensors';

// The 312-byte header tinygrad wrote for a 784→128→10 MLP, verbatim (two
// trailing spaces = the reference writer's 8-byte padding). Its data section
// is 407080 bytes; the test synthesizes zeros of that length so the fixture
// stays a string, not a 400 KB blob.
const TINYGRAD_HEADER = '{"layer_1.weight":{"dtype":"F32","shape":[128,784],"data_offsets":[0,401408]},'
  + '"layer_1.bias":{"dtype":"F32","shape":[128],"data_offsets":[401408,401920]},'
  + '"layer_2.weight":{"dtype":"F32","shape":[10,128],"data_offsets":[401920,407040]},'
  + '"layer_2.bias":{"dtype":"F32","shape":[10],"data_offsets":[407040,407080]}}  ';
const TINYGRAD_DATA_BYTES = 407080;

function withHeader(headerText: string, dataBytes: number): Uint8Array {
  const header = new TextEncoder().encode(headerText);
  const bytes = new Uint8Array(8 + header.length + dataBytes);
  new DataView(bytes.buffer).setUint32(0, header.length, true);
  bytes.set(header, 8);
  return bytes;
}

function tensor(name: string, shape: number[], fill?: (i: number) => number): SafetensorEntry {
  const data = new Float32Array(shapeSize(shape));
  if (fill) data.forEach((_, i) => { data[i] = fill(i); });
  return { name, dtype: 'F32', shape, data };
}

function headerTextOf(bytes: Uint8Array): string {
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  return new TextDecoder().decode(bytes.subarray(8, 8 + length));
}

function failure(fn: () => unknown): SafetensorsError {
  try {
    fn();
  } catch (error) {
    if (error instanceof SafetensorsError) return error;
    throw error;
  }
  throw new Error('expected a SafetensorsError');
}

logicTest('safetensors: decodes a header written by tinygrad\'s reference safe_save', ({ expect }) => {
  expect(TINYGRAD_HEADER.length).toBe(312);
  const file = decodeSafetensors(withHeader(TINYGRAD_HEADER, TINYGRAD_DATA_BYTES));
  expect(file.metadata).toEqual({});
  expect(file.entries.map(entry => [entry.name, entry.shape, entry.data.length])).toEqual([
    ['layer_1.weight', [128, 784], 128 * 784],
    ['layer_1.bias', [128], 128],
    ['layer_2.weight', [10, 128], 1280],
    ['layer_2.bias', [10], 10],
  ]);
});

logicTest('safetensors: encodes the same tensor set to a header byte-identical to the reference writer', ({ expect }) => {
  const bytes = encodeSafetensors([
    tensor('layer_1.weight', [128, 784]),
    tensor('layer_1.bias', [128]),
    tensor('layer_2.weight', [10, 128]),
    tensor('layer_2.bias', [10]),
  ]);
  // u64 LE size prefix, then the exact header (order kept, keys dtype/shape/
  // data_offsets, compact JSON, space padding to a multiple of 8).
  const view = new DataView(bytes.buffer);
  expect(view.getUint32(0, true)).toBe(312);
  expect(view.getUint32(4, true)).toBe(0);
  expect(headerTextOf(bytes)).toBe(TINYGRAD_HEADER);
  expect(bytes.length).toBe(8 + 312 + TINYGRAD_DATA_BYTES);
});

logicTest('safetensors: round-trips values, shapes, order and metadata exactly', ({ expect }) => {
  const entries = [
    tensor('b/kernel', [2, 3], i => i * 0.5 - 1),
    tensor('a/bias', [3], i => -i - 1),
    tensor('scalar', [], () => 42),
  ];
  const bytes = encodeSafetensors(entries, { 'nnvp.format': 'x/1', 'nnvp.workHash': 'abc' });
  const file = decodeSafetensors(bytes);
  expect(file.metadata).toEqual({ 'nnvp.format': 'x/1', 'nnvp.workHash': 'abc' });
  // Caller order is preserved (NOT sorted): the file is deterministic for the caller.
  expect(file.entries.map(entry => entry.name)).toEqual(['b/kernel', 'a/bias', 'scalar']);
  expect(file.entries.map(entry => entry.shape)).toEqual([[2, 3], [3], []]);
  expect(Array.from(file.entries[0]!.data)).toEqual([-1, -0.5, 0, 0.5, 1, 1.5]);
  expect(Array.from(file.entries[1]!.data)).toEqual([-1, -2, -3]);
  expect(Array.from(file.entries[2]!.data)).toEqual([42]);
  // Copies, never views over the input.
  bytes.fill(0);
  expect(file.entries[2]!.data[0]).toBe(42);
  // Little-endian floats on the wire, whatever the platform.
  const one = encodeSafetensors([tensor('t', [1], () => 1.5)]);
  const dataStart = 8 + new DataView(one.buffer).getUint32(0, true);
  expect(new DataView(one.buffer).getFloat32(dataStart, true)).toBe(1.5);
});

logicTest('safetensors: encoding is deterministic and the header stays 8-byte aligned with metadata', ({ expect }) => {
  const make = () => encodeSafetensors([tensor('w', [3], i => i)], { 'nnvp.summary': 'Input → Dense → Output' });
  const first = make();
  expect(Array.from(make())).toEqual(Array.from(first));
  const headerLength = new DataView(first.buffer).getUint32(0, true);
  expect(headerLength % 8).toBe(0);
  // Metadata comes first in the header, as the reference writer emits it.
  expect(headerTextOf(first).startsWith('{"__metadata__":{"nnvp.summary":')).toBe(true);
  // A buffer view with a non-zero byteOffset decodes the same.
  const padded = new Uint8Array(first.length + 3);
  padded.set(first, 3);
  const file = decodeSafetensors(padded.subarray(3));
  expect(Array.from(file.entries[0]!.data)).toEqual([0, 1, 2]);
  expect(decodeSafetensors(first.buffer as ArrayBuffer).entries[0]!.name).toBe('w');
});

logicTest('safetensors: encode refuses shape/data disagreement, duplicate or reserved names, unsupported dtypes', ({ expect }) => {
  expect(failure(() => encodeSafetensors([{ name: 'w', dtype: 'F32', shape: [2, 2], data: new Float32Array(3) }])).code).toBe('shape');
  expect(failure(() => encodeSafetensors([tensor('w', [1]), tensor('w', [1])])).code).toBe('name');
  expect(failure(() => encodeSafetensors([tensor('__metadata__', [1])])).code).toBe('name');
  expect(failure(() => encodeSafetensors([tensor('', [1])])).code).toBe('name');
  expect(failure(() => encodeSafetensors([{ ...tensor('w', [1]), dtype: 'F16' as 'F32' }])).code).toBe('dtype');
  expect(failure(() => encodeSafetensors([{ name: 'w', dtype: 'F32', shape: [-1], data: new Float32Array(1) }])).code).toBe('shape');
  expect(failure(() => encodeSafetensors([], { k: 1 as unknown as string })).code).toBe('header');
});

logicTest('safetensors: decode validates every claim the header makes against the bytes', ({ expect }) => {
  const good = encodeSafetensors([tensor('w', [2], i => i + 1)]);
  // Truncations.
  expect(failure(() => decodeSafetensors(new Uint8Array(4))).code).toBe('truncated');
  expect(failure(() => decodeSafetensors(good.subarray(0, 12))).code).toBe('truncated');
  const highWord = new Uint8Array(good);
  highWord[7] = 1; // header size > 2^32
  expect(failure(() => decodeSafetensors(highWord)).code).toBe('truncated');
  // Header shapes.
  expect(failure(() => decodeSafetensors(withHeader('not json', 0))).code).toBe('header');
  expect(failure(() => decodeSafetensors(withHeader('[1,2]   ', 0))).code).toBe('header');
  expect(failure(() => decodeSafetensors(withHeader('{"w":3}  ', 0))).code).toBe('header');
  expect(failure(() => decodeSafetensors(withHeader('{"__metadata__":[]}     ', 0))).code).toBe('header');
  expect(failure(() => decodeSafetensors(withHeader('{"__metadata__":{"k":1}}', 0))).code).toBe('header');
  // Tensor claims.
  const entry = (info: string, dataBytes: number) => withHeader(`{"w":${info}}`.padEnd(64), dataBytes);
  expect(failure(() => decodeSafetensors(entry('{"dtype":"F16","shape":[1],"data_offsets":[0,2]}', 2))).code).toBe('dtype');
  expect(failure(() => decodeSafetensors(entry('{"dtype":"F32","shape":[1.5],"data_offsets":[0,4]}', 4))).code).toBe('shape');
  expect(failure(() => decodeSafetensors(entry('{"dtype":"F32","shape":[1],"data_offsets":[0]}', 4))).code).toBe('shape');
  expect(failure(() => decodeSafetensors(entry('{"dtype":"F32","shape":[1],"data_offsets":[0,8]}', 4))).code).toBe('shape'); // past the end
  expect(failure(() => decodeSafetensors(entry('{"dtype":"F32","shape":[2],"data_offsets":[0,4]}', 4))).code).toBe('shape'); // shape ≠ bytes
  expect(failure(() => decodeSafetensors(entry('{"dtype":"F32","shape":[1],"data_offsets":[4,0]}', 4))).code).toBe('shape'); // end < begin
  // Unclaimed trailing bytes are tolerated (offsets are validated, not required to tile the data).
  const trailing = new Uint8Array(good.length + 4);
  trailing.set(good);
  expect(Array.from(decodeSafetensors(trailing).entries[0]!.data)).toEqual([1, 2]);
});
