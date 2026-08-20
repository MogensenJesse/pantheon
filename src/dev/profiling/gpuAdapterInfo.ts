// src/dev/profiling/gpuAdapterInfo.ts — GPUDevice / adapter.info snapshot for WebGPU
import type { WebGPURenderer } from 'three/webgpu';
import { asTimestampRenderer, getRendererBackend } from './webgpuRendererAccess';

export type GpuBackendKind = 'webgpu' | 'webgl' | 'unknown';

export interface GpuAdapterSnapshot {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  backend: GpuBackendKind;
  timestampQuery: boolean;
  timestampTracking: boolean;
  featureCount: number;
  features: string[];
  limits: Record<string, number>;
}

interface AdapterInfoLike {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

function readAdapterInfo(device: GPUDevice | undefined): AdapterInfoLike | undefined {
  if (!device) return undefined;
  return (device as GPUDevice & { adapterInfo?: AdapterInfoLike }).adapterInfo;
}

function backendKind(backend: ReturnType<typeof getRendererBackend>): GpuBackendKind {
  if (backend.isWebGLBackend === true) return 'webgl';
  if (backend.isWebGPUBackend === true) return 'webgpu';
  if (backend.device) return 'webgpu';
  return 'unknown';
}

function limitsToRecord(limits: GPUSupportedLimits | undefined): Record<string, number> {
  if (!limits) return {};
  const out: Record<string, number> = {};
  const record = limits as unknown as Record<string, number>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/** Read vendor / features / limits from the live WebGPU device. */
export function sampleGpuAdapter(renderer: WebGPURenderer): GpuAdapterSnapshot {
  const backend = getRendererBackend(renderer);
  const device = backend.device;
  const info = readAdapterInfo(device);
  const features: string[] = [];
  if (device?.features) {
    for (const name of device.features) features.push(name);
  }
  features.sort();
  const hasTsq = features.includes('timestamp-query');
  const tracking =
    backend.trackTimestamp === true ||
    asTimestampRenderer(renderer).hasFeature?.('timestamp-query') === true;
  return {
    vendor: info?.vendor || 'unknown',
    architecture: info?.architecture || 'unknown',
    device: info?.device || 'unknown',
    description: info?.description || 'unknown',
    backend: backendKind(backend),
    timestampQuery: hasTsq,
    timestampTracking: tracking && hasTsq,
    featureCount: features.length,
    features,
    limits: limitsToRecord(device?.limits),
  };
}

export function formatAdapterLabel(snap: GpuAdapterSnapshot): string {
  const parts = [snap.vendor, snap.architecture, snap.description].filter(
    (part) => part && part !== 'unknown',
  );
  return parts.length > 0 ? parts.join(' · ') : 'WebGPU adapter';
}
