// Ambient declarations for the tinygrad runtime modules.
//
// WebGPU: TypeScript's DOM lib (5.x) ships no WebGPU types and the project
// takes no new dependencies (@webgpu/types would be one). The base surface
// lives in src/lib/Viz3D/webgpu.d.ts; the interfaces below MERGE into it with
// only what runtime.ts / weightIO.ts / check_runner.ts additionally touch —
// grow as needed, never speculatively.

interface GPU {
  requestAdapter(options: { forceFallbackAdapter?: boolean }): Promise<GPUAdapter | null>;
}

interface GPUDevice {
  createBuffer(descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }): GPUBuffer;
}

interface GPUBuffer {
  readonly size: number;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

interface GPUCommandEncoder {
  copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number,
  ): void;
}

// Viz3D's webgpu.d.ts already declares `var GPUBufferUsage` with only the
// flags the renderer uses; var declarations cannot merge, so the full flag
// map this runtime needs is exposed as a named type to cast through
// (see weightIO.ts).
interface GPUBufferUsageFlagMap {
  readonly MAP_READ: number;
  readonly MAP_WRITE: number;
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly UNIFORM: number;
  readonly STORAGE: number;
}

declare var GPUMapMode: {
  readonly READ: number;
  readonly WRITE: number;
};

declare var GPUShaderStage: {
  readonly VERTEX: number;
  readonly FRAGMENT: number;
  readonly COMPUTE: number;
};

// worker.ts's vite-only `?raw` Python imports (no vite/client types in the
// project — same choice as BoardInterface.ts's local ImportMetaWithEnv).
declare module '*.py?raw' {
  const source: string;
  export default source;
}
