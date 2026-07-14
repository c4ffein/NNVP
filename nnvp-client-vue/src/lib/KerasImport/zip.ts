// Minimal ZIP reader for `.keras` archives (see kerasImport.ts). Parses the
// central directory and extracts single entries, supporting the only two
// compression methods Python's zipfile writer emits for these files:
// 0 (stored) and 8 (deflate). Deliberately NOT a general-purpose
// implementation: no ZIP64, no encryption, no multi-disk archives — none of
// which a .keras file uses. Sizes come from the central directory, so entries
// written with streaming data descriptors read fine too.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  name: string;
  /** Compression method: 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Offset of the entry's local file header from the start of the archive. */
  headerOffset: number;
}

/** Inflates a raw deflate stream. Injectable so tests can supply their own. */
export type Inflate = (compressed: Uint8Array) => Promise<Uint8Array>;

/** Default inflate: DecompressionStream, available in browsers and bun. */
export const inflateRaw: Inflate = async (compressed) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('zip: DecompressionStream is unavailable, cannot inflate this entry');
  }
  // .slice() also re-homes views over a SharedArrayBuffer, which Blob refuses.
  const stream = new Blob([compressed.slice()]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// The EOCD record is 22 bytes plus a trailing comment of up to 0xffff bytes;
// scan backwards for its signature like every other reader does.
function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('zip: end of central directory not found (not a ZIP file?)');
}

export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('zip: corrupted central directory');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      headerOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  inflate: Inflate = inflateRaw,
): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.headerOffset, true) !== LOCAL_SIGNATURE) {
    throw new Error(`zip: corrupted local header for "${entry.name}"`);
  }
  // Name/extra lengths can differ between the central and local headers.
  const nameLength = view.getUint16(entry.headerOffset + 26, true);
  const extraLength = view.getUint16(entry.headerOffset + 28, true);
  const start = entry.headerOffset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflate(compressed);
  throw new Error(`zip: unsupported compression method ${entry.method} for "${entry.name}"`);
}

/** Reads one named entry and decodes it as UTF-8 text. */
export async function readZipText(
  bytes: Uint8Array,
  name: string,
  inflate: Inflate = inflateRaw,
): Promise<string> {
  const entry = listZipEntries(bytes).find(candidate => candidate.name === name);
  if (entry === undefined) throw new Error(`zip: no "${name}" entry in the archive`);
  return new TextDecoder().decode(await readZipEntry(bytes, entry, inflate));
}
