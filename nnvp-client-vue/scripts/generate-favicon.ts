/**
 * generate-favicon.ts — renders public/favicon.ico (16/32/48 BMP entries)
 * from the same geometry as public/nnvp.svg, no dependencies (bun-first box:
 * no ImageMagick/librsvg). KEEP THE GEOMETRY IN SYNC WITH THE SVG.
 *
 * Usage: bun scripts/generate-favicon.ts [--png <path>]
 *   --png also writes a 128px PNG (debug/preview only, not shipped).
 */
import { deflateSync } from 'node:zlib';

// --- the logo, in the SVG's 32-unit space (mirror of public/nnvp.svg) ------
const TILE_RADIUS = 7;
const EDGE_HALF_WIDTH = 0.8; // stroke-width 1.6
const NODE_RADIUS = 3.4;
const BG: Rgba = [0x16, 0x16, 0x1d, 255];
const EDGE: Rgba = [0x8a, 0x8a, 0x96, 255];
const NODE_LEFT: Rgba = [0xf5, 0xf5, 0xf7, 255];
const NODE_ACCENT: Rgba = [0x55, 0x66, 0xee, 255]; // --accent (App.vue)
const SEGMENTS: [number, number, number, number][] = [
  [9.5, 23, 9.5, 9], [9.5, 9, 22.5, 23], [22.5, 23, 22.5, 9],
];
const NODES: { x: number; y: number; color: Rgba }[] = [
  { x: 9.5, y: 23, color: NODE_ACCENT }, { x: 9.5, y: 9, color: NODE_LEFT },
  { x: 22.5, y: 23, color: NODE_LEFT }, { x: 22.5, y: 9, color: NODE_ACCENT },
];

type Rgba = [number, number, number, number];

function insideRoundedTile(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x > 32 || y > 32) return false;
  const cx = Math.min(Math.max(x, TILE_RADIUS), 32 - TILE_RADIUS);
  const cy = Math.min(Math.max(y, TILE_RADIUS), 32 - TILE_RADIUS);
  return (x - cx) ** 2 + (y - cy) ** 2 <= TILE_RADIUS ** 2;
}

function distToSegment(px: number, py: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  const dx = x2 - x1; const dy = y2 - y1;
  const t = Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function sampleColor(x: number, y: number): Rgba {
  if (!insideRoundedTile(x, y)) return [0, 0, 0, 0];
  for (const node of NODES) {
    if ((x - node.x) ** 2 + (y - node.y) ** 2 <= NODE_RADIUS ** 2) return node.color;
  }
  for (const segment of SEGMENTS) {
    if (distToSegment(x, y, segment) <= EDGE_HALF_WIDTH) return EDGE;
  }
  return BG;
}

/** Supersampled straight-alpha RGBA raster (top-down rows). */
function render(size: number, ss = 4): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const step = 32 / (size * ss);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0; let g = 0; let b = 0; let a = 0; // premultiplied accumulation
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = sampleColor((px * ss + sx + 0.5) * step, (py * ss + sy + 0.5) * step);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a); out[i + 1] = Math.round(g / a); out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round(a / (ss * ss));
      }
    }
  }
  return out;
}

/** One 32bpp BGRA BMP-in-ICO image: BITMAPINFOHEADER + bottom-up pixels + AND mask. */
function bmpEntry(size: number, rgba: Uint8Array): Uint8Array {
  const andStride = Math.ceil(size / 32) * 4;
  const out = new Uint8Array(40 + size * size * 4 + andStride * size);
  const view = new DataView(out.buffer);
  view.setUint32(0, 40, true); // header size
  view.setInt32(4, size, true);
  view.setInt32(8, size * 2, true); // XOR + AND heights
  view.setUint16(12, 1, true); // planes
  view.setUint16(14, 32, true); // bpp
  view.setUint32(20, size * size * 4 + andStride * size, true); // image size
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4; // bottom-up
    for (let x = 0; x < size; x++) {
      const s = src + x * 4; const d = 40 + (y * size + x) * 4;
      out[d] = rgba[s + 2]!; out[d + 1] = rgba[s + 1]!; out[d + 2] = rgba[s]!; out[d + 3] = rgba[s + 3]!;
    }
  }
  return out; // AND mask left zeroed: alpha channel rules
}

function buildIco(sizes: number[]): Uint8Array {
  const entries = sizes.map(size => ({ size, data: bmpEntry(size, render(size)) }));
  const headerLength = 6 + 16 * entries.length;
  const total = headerLength + entries.reduce((n, e) => n + e.data.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, entries.length, true);
  let offset = headerLength;
  entries.forEach((entry, i) => {
    const dir = 6 + 16 * i;
    out[dir] = entry.size === 256 ? 0 : entry.size;
    out[dir + 1] = entry.size === 256 ? 0 : entry.size;
    view.setUint16(dir + 4, 1, true); // planes
    view.setUint16(dir + 6, 32, true); // bpp
    view.setUint32(dir + 8, entry.data.length, true);
    view.setUint32(dir + 12, offset, true);
    out.set(entry.data, offset);
    offset += entry.data.length;
  });
  return out;
}

// --- minimal PNG encoder (debug preview only) -------------------------------
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set([...type].map(c => c.charCodeAt(0)), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

function buildPng(size: number): Uint8Array {
  const rgba = render(size);
  const raw = new Uint8Array(size * (size * 4 + 1)); // filter byte 0 per row
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size); view.setUint32(4, size);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', new Uint8Array(deflateSync(raw))), pngChunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

const icoPath = new URL('../public/favicon.ico', import.meta.url).pathname;
await Bun.write(icoPath, buildIco([16, 32, 48]));
console.log(`wrote ${icoPath}`);
const pngFlag = process.argv.indexOf('--png');
if (pngFlag !== -1 && process.argv[pngFlag + 1]) {
  await Bun.write(process.argv[pngFlag + 1]!, buildPng(128));
  console.log(`wrote ${process.argv[pngFlag + 1]} (debug preview)`);
}
