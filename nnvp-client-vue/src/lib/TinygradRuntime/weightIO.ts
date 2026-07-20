/**
 * Weight I/O against the emitted runner's GPU buffers (step.weightBufs, from
 * driver.patch_runner_for_weight_readback): staging-buffer copies in both
 * directions, exactly the sequences the pyodide-tinygrad experiment verified
 * byte-exact under its fake device (check_runner.ts) and in-browser.
 *
 * The weight buffers carry COPY_SRC + COPY_DST; training continues from
 * whatever a write leaves in them (that IS the read→write→train round-trip).
 */

// Viz3D's ambient GPUBufferUsage declares only the flags its renderer uses
// and var declarations cannot merge — shadow it with the full flag map this
// module reads (./ambient.d.ts). Type-level only: `declare` emits no code, so
// the global is still resolved lazily at call time, exactly as before.
declare const GPUBufferUsage: GPUBufferUsageFlagMap;

/** Read one weight buffer back as a Float32Array. */
export async function readWeightBuf(device: GPUDevice, buf: GPUBuffer): Promise<Float32Array> {
  const staging = device.createBuffer({
    size: buf.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(buf, 0, staging, 0, buf.size);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return data;
}

/** Write values into one weight buffer. */
export async function writeWeightBuf(
  device: GPUDevice, buf: GPUBuffer, values: ArrayLike<number>,
): Promise<void> {
  const staging = device.createBuffer({
    size: buf.size,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
    mappedAtCreation: true,
  });
  new Float32Array(staging.getMappedRange()).set(values);
  staging.unmap();
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(staging, 0, buf, 0, buf.size);
  device.queue.submit([encoder.finish()]);
  staging.destroy();
}

/** Snapshot EVERY state buffer (params, momentum, lr) by safetensors name. */
export async function snapshotWeightBufs(
  device: GPUDevice, weightBufs: Record<string, GPUBuffer>,
): Promise<Record<string, Float32Array>> {
  const out: Record<string, Float32Array> = {};
  for (const name of Object.keys(weightBufs)) {
    out[name] = await readWeightBuf(device, weightBufs[name]!); // eslint-disable-line no-await-in-loop
  }
  return out;
}

/**
 * Copy current TRAINING weights into an eval runner's buffers, GPU-to-GPU
 * (no CPU roundtrip). Buffer names differ: the training runner keys by the
 * optimizer state names (opt.params.N), the eval runner by the model names
 * (model.layer_X.weight) — `aliases` (meta.aliases: aliasName -> model name)
 * bridges them; identical names copy directly.
 */
export function syncWeightBufs(
  device: GPUDevice,
  trainBufs: Record<string, GPUBuffer>,
  evalBufs: Record<string, GPUBuffer>,
  aliases: Record<string, string> = {},
): void {
  const sourceFor = (evalName: string): GPUBuffer | null => {
    if (trainBufs[evalName]) return trainBufs[evalName]!;
    for (const [aliasName, canonical] of Object.entries(aliases)) {
      if (canonical === evalName && trainBufs[aliasName]) return trainBufs[aliasName]!;
      if (aliasName === evalName && trainBufs[canonical]) return trainBufs[canonical]!;
    }
    return null;
  };
  const encoder = device.createCommandEncoder();
  const missing: string[] = [];
  for (const name of Object.keys(evalBufs)) {
    const source = sourceFor(name);
    if (!source) { missing.push(name); continue; }
    encoder.copyBufferToBuffer(source, 0, evalBufs[name]!, 0, evalBufs[name]!.size);
  }
  device.queue.submit([encoder.finish()]);
  if (missing.length) {
    throw new Error(`eval weight sync: no training buffer found for ${missing.join(', ')}`);
  }
}
