/**
 * safetensors.ts — a minimal, dependency-free codec for the safetensors
 * container (https://github.com/huggingface/safetensors), the byte format
 * nnvp uses for weights (PLAN.md section I): the same bytes serve the cloud
 * upload and the anonymous "Download weights" file, and Keras / PyTorch /
 * tinygrad all read it natively.
 *
 * Layout: an 8-byte little-endian u64 header size N, an N-byte JSON header
 * (space-padded to a multiple of 8, exactly like the reference writers),
 * then the raw little-endian tensor bytes. Header entries are
 * `{dtype, shape, data_offsets: [begin, end]}` (offsets relative to the data
 * section) plus an optional `__metadata__` string→string map.
 *
 * Deliberately narrow: F32 only (every nnvp engine hands out Float32Array),
 * caller-provided tensor order preserved (so an nnvp file is byte-stable and
 * deterministic for the same weights), and every read validated — a file is
 * user-supplied input. Pure: no DOM, no tf; bun-testable.
 */

export type SafetensorsDtype = 'F32';

export interface SafetensorEntry {
  name: string;
  dtype: SafetensorsDtype;
  shape: number[];
  data: Float32Array;
}

export interface SafetensorsFile {
  entries: SafetensorEntry[];
  metadata: Record<string, string>;
}

export type SafetensorsErrorCode =
  | 'truncated' // fewer bytes than the header announces
  | 'header' // the header is not the JSON object the spec describes
  | 'dtype' // a dtype this codec does not support
  | 'shape' // shape/offsets disagree, or offsets fall outside the data
  | 'name'; // a duplicate or empty tensor name

export class SafetensorsError extends Error {
  readonly code: SafetensorsErrorCode;

  constructor(code: SafetensorsErrorCode, message: string) {
    super(message);
    this.name = 'SafetensorsError';
    this.code = code;
  }
}

const HEADER_SIZE_BYTES = 8;
const HEADER_ALIGNMENT = 8;
const F32_BYTES = 4;
const METADATA_KEY = '__metadata__';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Element count of a shape ([] is a scalar: 1). */
export function shapeSize(shape: number[]): number {
  return shape.reduce((total, dim) => total * dim, 1);
}

function assertShape(shape: unknown, name: string): asserts shape is number[] {
  if (!Array.isArray(shape) || shape.some(dim => !Number.isInteger(dim) || (dim as number) < 0)) {
    throw new SafetensorsError('shape', `safetensors: tensor "${name}" has an invalid shape`);
  }
}

/** Little-endian on the wire; typed arrays follow the platform, so check once. */
const PLATFORM_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function writeF32(target: Uint8Array, offset: number, values: Float32Array): void {
  if (PLATFORM_LITTLE_ENDIAN) {
    target.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength), offset);
    return;
  }
  const view = new DataView(target.buffer, target.byteOffset + offset, values.byteLength);
  values.forEach((value, i) => view.setFloat32(i * F32_BYTES, value, true));
}

function readF32(source: Uint8Array, begin: number, count: number): Float32Array {
  // Always copy: the caller's buffer may be transferred, reused, or unaligned.
  const out = new Float32Array(count);
  if (PLATFORM_LITTLE_ENDIAN) {
    new Uint8Array(out.buffer).set(source.subarray(begin, begin + count * F32_BYTES));
    return out;
  }
  const view = new DataView(source.buffer, source.byteOffset + begin, count * F32_BYTES);
  for (let i = 0; i < count; i += 1) out[i] = view.getFloat32(i * F32_BYTES, true);
  return out;
}

/**
 * Serialize tensors (in the given order) plus optional metadata. Throws
 * SafetensorsError on a shape that disagrees with its data, or on
 * duplicate/empty names.
 */
export function encodeSafetensors(
  entries: SafetensorEntry[],
  metadata: Record<string, string> = {},
): Uint8Array {
  const header: Record<string, unknown> = {};
  if (Object.keys(metadata).length > 0) {
    const stringOnly: Record<string, string> = {};
    Object.keys(metadata).forEach((key) => {
      if (typeof metadata[key] !== 'string') {
        throw new SafetensorsError('header', `safetensors: metadata "${key}" must be a string`);
      }
      stringOnly[key] = metadata[key]!;
    });
    header[METADATA_KEY] = stringOnly;
  }
  let offset = 0;
  const seen = new Set<string>();
  entries.forEach((entry) => {
    if (!entry.name || entry.name === METADATA_KEY) {
      throw new SafetensorsError('name', `safetensors: invalid tensor name "${entry.name}"`);
    }
    if (seen.has(entry.name)) {
      throw new SafetensorsError('name', `safetensors: duplicate tensor name "${entry.name}"`);
    }
    seen.add(entry.name);
    if (entry.dtype !== 'F32') {
      throw new SafetensorsError('dtype', `safetensors: unsupported dtype "${String(entry.dtype)}"`);
    }
    assertShape(entry.shape, entry.name);
    if (shapeSize(entry.shape) !== entry.data.length) {
      throw new SafetensorsError(
        'shape',
        `safetensors: tensor "${entry.name}" shape [${entry.shape.join(', ')}] does not hold ${entry.data.length} values`,
      );
    }
    const byteLength = entry.data.length * F32_BYTES;
    // Key order (dtype, shape, data_offsets) matches the reference writers,
    // so an identical tensor set yields byte-identical headers.
    header[entry.name] = { dtype: entry.dtype, shape: entry.shape, data_offsets: [offset, offset + byteLength] };
    offset += byteLength;
  });
  const headerJson = textEncoder.encode(JSON.stringify(header));
  const padding = (HEADER_ALIGNMENT - (headerJson.length % HEADER_ALIGNMENT)) % HEADER_ALIGNMENT;
  const headerLength = headerJson.length + padding;
  const bytes = new Uint8Array(HEADER_SIZE_BYTES + headerLength + offset);
  const view = new DataView(bytes.buffer);
  // u64 LE header size; the high word is always 0 for anything a browser holds.
  view.setUint32(0, headerLength, true);
  view.setUint32(4, 0, true);
  bytes.set(headerJson, HEADER_SIZE_BYTES);
  bytes.fill(0x20, HEADER_SIZE_BYTES + headerJson.length, HEADER_SIZE_BYTES + headerLength);
  let cursor = HEADER_SIZE_BYTES + headerLength;
  entries.forEach((entry) => {
    writeF32(bytes, cursor, entry.data);
    cursor += entry.data.length * F32_BYTES;
  });
  return bytes;
}

function asBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/**
 * Parse a safetensors buffer. Every structural claim the header makes is
 * checked against the bytes before any tensor is materialized; the returned
 * Float32Arrays are copies (never views over the input). Entries come back
 * in header order.
 */
export function decodeSafetensors(input: Uint8Array | ArrayBuffer): SafetensorsFile {
  const bytes = asBytes(input);
  if (bytes.length < HEADER_SIZE_BYTES) {
    throw new SafetensorsError('truncated', 'safetensors: file shorter than its 8-byte header size');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const low = view.getUint32(0, true);
  const high = view.getUint32(4, true);
  if (high !== 0 || HEADER_SIZE_BYTES + low > bytes.length) {
    throw new SafetensorsError('truncated', 'safetensors: header size exceeds the file');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes.subarray(HEADER_SIZE_BYTES, HEADER_SIZE_BYTES + low)));
  } catch (error) {
    throw new SafetensorsError('header', `safetensors: header is not valid JSON (${String(error)})`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SafetensorsError('header', 'safetensors: header is not a JSON object');
  }
  const header = parsed as Record<string, unknown>;
  const dataBegin = HEADER_SIZE_BYTES + low;
  const dataLength = bytes.length - dataBegin;

  const metadata: Record<string, string> = {};
  if (header[METADATA_KEY] !== undefined) {
    const raw = header[METADATA_KEY];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new SafetensorsError('header', 'safetensors: __metadata__ is not an object');
    }
    Object.keys(raw as Record<string, unknown>).forEach((key) => {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value !== 'string') {
        throw new SafetensorsError('header', `safetensors: __metadata__ "${key}" is not a string`);
      }
      metadata[key] = value;
    });
  }

  const entries: SafetensorEntry[] = [];
  Object.keys(header).forEach((name) => {
    if (name === METADATA_KEY) return;
    if (name.length === 0) throw new SafetensorsError('name', 'safetensors: empty tensor name');
    const info = header[name];
    if (typeof info !== 'object' || info === null || Array.isArray(info)) {
      throw new SafetensorsError('header', `safetensors: tensor "${name}" entry is not an object`);
    }
    const { dtype, shape, data_offsets: offsets } = info as Record<string, unknown>;
    if (dtype !== 'F32') {
      throw new SafetensorsError('dtype', `safetensors: tensor "${name}" has unsupported dtype "${String(dtype)}" (only F32 is read)`);
    }
    assertShape(shape, name);
    if (
      !Array.isArray(offsets) || offsets.length !== 2
      || !Number.isInteger(offsets[0]) || !Number.isInteger(offsets[1])
    ) {
      throw new SafetensorsError('shape', `safetensors: tensor "${name}" has invalid data_offsets`);
    }
    const [begin, end] = offsets as [number, number];
    if (begin < 0 || end < begin || end > dataLength) {
      throw new SafetensorsError('shape', `safetensors: tensor "${name}" data_offsets [${begin}, ${end}] fall outside the file`);
    }
    const count = shapeSize(shape);
    if (end - begin !== count * F32_BYTES) {
      throw new SafetensorsError('shape', `safetensors: tensor "${name}" shape [${shape.join(', ')}] does not match its ${end - begin} bytes`);
    }
    entries.push({ name, dtype: 'F32', shape: [...shape], data: readF32(bytes, dataBegin + begin, count) });
  });
  return { entries, metadata };
}
