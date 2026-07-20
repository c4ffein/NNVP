// Smoke-test the emitted (patched) runner under bun with a fake WebGPU
// device — no browser, no GPU. Byte-accurate where it matters: buffers have
// real backing memory, copyBufferToBuffer moves bytes and ENFORCES the
// COPY_SRC/COPY_DST/MAP_* usage flags like a real device would, so both
// halves of the weight patch are genuinely exercised: readback (COPY_SRC)
// and write-in (COPY_DST) — drop either flag from createWeightBuf and this
// fails the same way the browser would.
// Compute passes are no-ops: kernels don't run, outputs stay zero — this
// validates the runner's plumbing and the weightBufs mapping, not the math.
//
// Usage:  PYTHONPATH=<wheel> python3 run_local.py <prefix>
//         bun check_runner.ts <prefix>

// bun provides the Bun global at runtime; typed here to stay dependency-free
// (no bun-types), same policy as ../ambient.d.ts.
declare const Bun: { file(path: string): { arrayBuffer(): Promise<ArrayBuffer> } };

// Top-level await needs module (not script) semantics — bun treats every file
// as a module already, so this only tells TypeScript.
export {};

const prefix = process.argv[2];
if (!prefix) throw new Error('usage: bun check_runner.ts <prefix> (from run_local.py <prefix>)');

// The casts bridge to the ambient GPU* namespace-object types (fresh literals
// carry no `prototype`); the runtime values are exactly the originals.
const USAGE = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
globalThis.GPUBufferUsage = USAGE as unknown as typeof GPUBufferUsage;
globalThis.GPUMapMode = { READ: 1, WRITE: 2 } as unknown as typeof GPUMapMode;
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 } as unknown as typeof GPUShaderStage;

interface FakeBufferDescriptor { size: number; usage: number; mappedAtCreation?: boolean }

class FakeBuffer {
  size: number;
  usage: number;
  backing: Uint8Array;
  mapped: boolean;

  constructor({ size, usage, mappedAtCreation }: FakeBufferDescriptor) {
    this.size = size;
    this.usage = usage;
    this.backing = new Uint8Array(size);
    this.mapped = !!mappedAtCreation;
  }
  async mapAsync(mode: number) {
    const needed = mode === GPUMapMode.READ ? USAGE.MAP_READ : USAGE.MAP_WRITE;
    if (!(this.usage & needed)) throw new Error(`mapAsync(${mode}) on buffer without MAP_${mode === 1 ? 'READ' : 'WRITE'} usage`);
    this.mapped = true;
  }
  getMappedRange() {
    if (!this.mapped) throw new Error('getMappedRange on unmapped buffer');
    return this.backing.buffer;
  }
  unmap() { this.mapped = false; }
  destroy() {}
}

const fakeDevice = {
  createBuffer: (desc: FakeBufferDescriptor) => new FakeBuffer(desc),
  createBindGroupLayout: () => ({}),
  createPipelineLayout: () => ({}),
  createShaderModule: () => ({}),
  createComputePipelineAsync: async () => ({}),
  createBindGroup: () => ({}),
  createCommandEncoder: () => ({
    beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
    // Executed immediately instead of on queue.submit — equivalent here,
    // since the runner always submits before reading anything back.
    copyBufferToBuffer(src: FakeBuffer, srcOffset: number, dst: FakeBuffer, dstOffset: number, size: number) {
      if (!(src.usage & USAGE.COPY_SRC)) throw new Error('copy source lacks COPY_SRC usage');
      if (!(dst.usage & USAGE.COPY_DST)) throw new Error('copy destination lacks COPY_DST usage');
      dst.backing.set(src.backing.subarray(srcOffset, srcOffset + size), dstOffset);
    },
    finish: () => ({}),
  }),
  queue: {
    submit(_commandBuffers: unknown[]) {},
    // The optimized runner uploads inputs this way (patch_runner_optimize_io).
    writeBuffer(buf: FakeBuffer, offset: number, data: ArrayBufferView | ArrayBuffer) {
      if (!(buf.usage & USAGE.COPY_DST)) throw new Error('writeBuffer target lacks COPY_DST usage');
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
      buf.backing.set(bytes, offset);
    },
  },
};

// Same readback/write sequences main.js uses in the real browser.
async function writeback(device: typeof fakeDevice, buf: FakeBuffer, values: Float32Array) {
  const staging = device.createBuffer({
    size: buf.size, usage: USAGE.COPY_SRC | USAGE.MAP_WRITE, mappedAtCreation: true,
  });
  new Float32Array(staging.getMappedRange()).set(values);
  staging.unmap();
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(staging, 0, buf, 0, buf.size);
  device.queue.submit([encoder.finish()]);
  staging.destroy();
}

async function readback(device: typeof fakeDevice, buf: FakeBuffer): Promise<Float32Array> {
  const staging = device.createBuffer({ size: buf.size, usage: USAGE.COPY_DST | USAGE.MAP_READ });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(buf, 0, staging, 0, buf.size);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return data;
}

function parseSafetensors(bytes: Uint8Array): Record<string, Float32Array> {
  const headerLength = Number(new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(0, true));
  const header = JSON.parse(
    new TextDecoder('utf8').decode(bytes.subarray(8, 8 + headerLength)),
  ) as Record<string, { data_offsets: [number, number] }>;
  const tensors: Record<string, Float32Array> = {};
  for (const [name, info] of Object.entries(header)) {
    if (name === '__metadata__') continue; // eslint-disable-line no-continue
    const [start, end] = info.data_offsets;
    tensors[name] = new Float32Array(bytes.subarray(8 + headerLength + start, 8 + headerLength + end).slice().buffer);
  }
  return tensors;
}

const weights = new Uint8Array(await Bun.file(`${prefix}.safetensors`).arrayBuffer());
const expected = parseSafetensors(weights);

const runnerPath = prefix.startsWith('/') ? `${prefix}.js` : `${process.cwd()}/${prefix}.js`;
const mod = await import(runnerPath);
const step = await mod.default.setupNet(fakeDevice, weights);

if (typeof step !== 'function') throw new Error('setupNet did not return the step function');
if (!step.weightBufs) throw new Error('step.weightBufs missing — readback patch did not apply');
for (let i = 0; i < 4; i += 1) {
  if (!step.weightBufs[`opt.params.${i}`]) throw new Error(`weightBufs missing opt.params.${i}`);
}
console.log(`weightBufs exposes: ${Object.keys(step.weightBufs).join(', ')}`);

// The mapping must point each name at a buffer holding THAT tensor's bytes.
for (const name of Object.keys(step.weightBufs)) {
  const got = await readback(fakeDevice, step.weightBufs[name]); // eslint-disable-line no-await-in-loop
  const want = expected[name];
  if (!want) throw new Error(`weightBufs has ${name} but the safetensors does not`);
  if (got.length !== want.length) throw new Error(`${name}: ${got.length} values, expected ${want.length}`);
  for (let i = 0; i < got.length; i += 1) {
    if (got[i] !== want[i]) throw new Error(`${name}[${i}] = ${got[i]}, expected ${want[i]}`);
  }
}
console.log('weight readback returns the exact safetensors bytes for every entry');

// Write path (the COPY_DST half of the patch): new bytes must round-trip
// through a weight buffer — this is what loading/editing weights relies on.
const target = 'opt.params.0';
const replacement = new Float32Array(expected[target]!.length);
for (let i = 0; i < replacement.length; i += 1) replacement[i] = (i % 7) - 3;
await writeback(fakeDevice, step.weightBufs[target], replacement);
const rewritten = await readback(fakeDevice, step.weightBufs[target]);
for (let i = 0; i < rewritten.length; i += 1) {
  if (rewritten[i] !== replacement[i]) throw new Error(`write round-trip mismatch at ${target}[${i}]`);
}
await writeback(fakeDevice, step.weightBufs[target], expected[target]!); // restore
console.log('weight write round-trips new bytes through a weight buffer');

// One full step() call: input writers, compute passes (no-op), output readback.
const batchSize = 32;
const x = new Float32Array(batchSize * 28 * 28).fill(0.5);
const y = new Int32Array(batchSize);
const outputs = await step(x, y);
if (outputs.length !== 1 || !(outputs[0] instanceof Float32Array)) {
  throw new Error(`step() returned ${outputs.length} outputs, expected [Float32Array]`);
}
console.log(`step() ran the full command flow, returned ${outputs[0].length} loss value(s)`);
console.log('OK — patched runner works against the fake WebGPU device');
