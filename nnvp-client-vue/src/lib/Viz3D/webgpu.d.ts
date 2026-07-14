// Minimal ambient WebGPU declarations. TypeScript's DOM lib (5.x) does not
// ship WebGPU types and the project takes no new dependencies (@webgpu/types
// would be one), so ONLY the surface renderer.ts actually touches is declared
// here — grow it as needed, never speculatively.

type GPUTextureFormat = string;

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {
  readonly queue: GPUQueue;
  createBuffer(descriptor: { label?: string; size: number; usage: number }): GPUBuffer;
  createShaderModule(descriptor: { label?: string; code: string }): GPUShaderModule;
  createRenderPipeline(descriptor: object): GPURenderPipeline;
  createBindGroup(descriptor: {
    label?: string;
    layout: GPUBindGroupLayout;
    entries: { binding: number; resource: { buffer: GPUBuffer } }[];
  }): GPUBindGroup;
  createTexture(descriptor: {
    label?: string;
    size: { width: number; height: number };
    format: GPUTextureFormat;
    usage: number;
  }): GPUTexture;
  createCommandEncoder(): GPUCommandEncoder;
  destroy(): void;
}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBufferView): void;
  submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUBuffer {
  destroy(): void;
}

interface GPUShaderModule {
  readonly label?: string;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUBindGroupLayout {
  readonly label?: string;
}

interface GPUBindGroup {
  readonly label?: string;
}

interface GPUTexture {
  createView(): GPUTextureView;
  destroy(): void;
}

interface GPUTextureView {
  readonly label?: string;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: object): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

interface GPUCommandBuffer {
  readonly label?: string;
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer): void;
  draw(vertexCount: number, instanceCount?: number): void;
  end(): void;
}

interface GPUCanvasContext {
  configure(configuration: {
    device: GPUDevice;
    format: GPUTextureFormat;
    alphaMode?: string;
  }): void;
  getCurrentTexture(): GPUTexture;
}

declare var GPUBufferUsage: {
  readonly VERTEX: number;
  readonly UNIFORM: number;
  readonly STORAGE: number;
  readonly COPY_DST: number;
};

declare var GPUTextureUsage: {
  readonly RENDER_ATTACHMENT: number;
};

interface Navigator {
  readonly gpu?: GPU;
}
