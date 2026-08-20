// src/dev/profiling/webgpuRendererAccess.ts — untyped Three.js WebGPU hooks used by the profiler
import type { WebGPURenderer } from 'three/webgpu';

export type TimestampQueryType = 'render' | 'compute';

export interface WebGPUBackendAccess {
  device?: GPUDevice;
  trackTimestamp?: boolean;
  hasTimestamp?: boolean;
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
}

export interface TimestampCapableRenderer {
  resolveTimestampsAsync?: (type: TimestampQueryType) => Promise<number | undefined>;
  hasFeature?: (name: string) => boolean;
  backend: WebGPUBackendAccess;
  info: WebGPURenderer['info'];
}

export function asTimestampRenderer(renderer: WebGPURenderer): TimestampCapableRenderer {
  return renderer as unknown as TimestampCapableRenderer;
}

export function getRendererBackend(renderer: WebGPURenderer): WebGPUBackendAccess {
  return asTimestampRenderer(renderer).backend ?? {};
}
