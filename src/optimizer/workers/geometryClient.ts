// src/optimizer/workers/geometryClient.ts — cancel stale geometry jobs via generation id
import type { GeometryJobResult, PrimitivePayload, RemeshFlag } from '../pipeline/types';
import type { WorkerIn, WorkerOut } from './messages';

export type GeometryClient = {
  simplify: (primitives: PrimitivePayload[], targetTriangles: number) => Promise<GeometryJobResult>;
  rebuild: (
    primitives: PrimitivePayload[],
    targetTriangles: number,
    remeshFlags: RemeshFlag[],
    textureSize: number,
  ) => Promise<GeometryJobResult>;
  cancel: () => void;
  dispose: () => void;
};

export function createGeometryClient(
  onProgress?: (phase: string, message: string) => void,
): GeometryClient {
  const worker = new Worker(new URL('./geometryWorker.ts', import.meta.url), { type: 'module' });
  let generation = 0;
  let pending: {
    generation: number;
    resolve: (value: GeometryJobResult) => void;
    reject: (err: Error) => void;
  } | null = null;

  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const msg = event.data;
    if (msg.generation !== generation) return;
    if (msg.type === 'progress') {
      onProgress?.(msg.phase, msg.message);
      return;
    }
    if (!pending || pending.generation !== msg.generation) return;
    const { resolve, reject } = pending;
    pending = null;
    if (msg.type === 'error') reject(new Error(msg.error));
    else resolve(msg.result);
  };

  worker.onerror = (event) => {
    pending?.reject(new Error(event.message || 'Geometry worker failed'));
    pending = null;
  };

  const run = (
    payload:
      | { type: 'simplify'; primitives: PrimitivePayload[]; targetTriangles: number }
      | {
          type: 'rebuild';
          primitives: PrimitivePayload[];
          targetTriangles: number;
          remeshFlags: RemeshFlag[];
          textureSize: number;
        },
  ): Promise<GeometryJobResult> => {
    generation += 1;
    const gen = generation;
    pending?.reject(new Error('cancelled'));
    return new Promise((resolve, reject) => {
      pending = { generation: gen, resolve, reject };
      worker.postMessage({ ...payload, generation: gen } as WorkerIn);
    });
  };

  return {
    simplify: (primitives, targetTriangles) =>
      run({ type: 'simplify', primitives, targetTriangles }),
    rebuild: (primitives, targetTriangles, remeshFlags, textureSize) =>
      run({ type: 'rebuild', primitives, targetTriangles, remeshFlags, textureSize }),
    cancel: () => {
      generation += 1;
      pending?.reject(new Error('cancelled'));
      pending = null;
    },
    dispose: () => {
      generation += 1;
      pending?.reject(new Error('cancelled'));
      pending = null;
      worker.terminate();
    },
  };
}
