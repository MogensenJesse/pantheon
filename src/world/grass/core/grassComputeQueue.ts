// src/world/grass/core/grassComputeQueue.ts — per-frame GPU compaction queue + rebuild task serialization
import type { ComputeNode, WebGPURenderer } from 'three/webgpu';
import { flowersEnabled } from '../config/flowerConfig';

export interface VegetationComputeNodes {
  computeCompactReset: ComputeNode;
  computeUpdateCompact: ComputeNode;
}

export interface GrassComputeQueue {
  whenComputeReady: () => Promise<void>;
  requestCompute: () => void;
  /** Request compaction and wait for the GPU pass (DEV stats, rebuild boundaries). */
  flushCompute: () => Promise<void>;
  drainPerFrameCompute: () => Promise<void>;
  enqueueGrassTask: (task: () => Promise<void>) => Promise<void>;
  enqueueBlockingGrassTask: (task: () => Promise<void>) => Promise<void>;
  setFieldReady: (ready: boolean) => void;
  isFieldReady: () => boolean;
  dispose: () => Promise<void>;
}

export function createGrassComputeQueue(
  renderer: WebGPURenderer,
  getGrassNodes: () => VegetationComputeNodes[],
  getFlowerNodes: () => VegetationComputeNodes | null,
): GrassComputeQueue {
  let fieldReady = true;
  let computeInFlight = false;
  let pendingCompute = false;
  let grassTask: Promise<void> = Promise.resolve();
  let computeReady: Promise<void> = Promise.resolve();
  let disposed = false;

  const resetCompactBuffers = async (flower: VegetationComputeNodes | null) => {
    const nodes = [
      ...getGrassNodes().map((n) => n.computeCompactReset),
      ...(flower ? [flower.computeCompactReset] : []),
    ];
    await Promise.all(nodes.map((node) => renderer.computeAsync(node)));
  };

  const runCompactPass = async () => {
    const flower = flowersEnabled() ? getFlowerNodes() : null;
    await resetCompactBuffers(flower);
    const nodes = [
      ...getGrassNodes().map((n) => n.computeUpdateCompact),
      ...(flower ? [flower.computeUpdateCompact] : []),
    ];
    await Promise.all(nodes.map((node) => renderer.computeAsync(node)));
  };

  const requestCompute = () => {
    if (disposed || !fieldReady) return;
    pendingCompute = true;
    if (computeInFlight) return;
    computeInFlight = true;
    computeReady = (async () => {
      try {
        while (pendingCompute) {
          pendingCompute = false;
          try {
            await runCompactPass();
          } catch (err) {
            console.error('[grass] compute failed:', err);
          }
        }
      } finally {
        computeInFlight = false;
        if (pendingCompute) requestCompute();
      }
    })();
  };

  const enqueueGrassTask = (task: () => Promise<void>): Promise<void> => {
    const run = grassTask.then(task, task);
    grassTask = run.catch((err) => {
      console.error('[grass] task failed:', err);
    });
    return run;
  };

  const drainPerFrameCompute = async () => {
    await computeReady;
    pendingCompute = false;
  };

  const enqueueBlockingGrassTask = (task: () => Promise<void>): Promise<void> => {
    if (disposed) return Promise.resolve();
    fieldReady = false;
    return enqueueGrassTask(async () => {
      await drainPerFrameCompute();
      await task();
    });
  };

  const whenComputeReady = () => Promise.all([computeReady, grassTask]).then(() => {});

  const flushCompute = async () => {
    if (disposed) return;
    requestCompute();
    await whenComputeReady();
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    fieldReady = false;
    pendingCompute = false;
    await whenComputeReady();
  };

  return {
    whenComputeReady,
    requestCompute,
    flushCompute,
    drainPerFrameCompute,
    enqueueGrassTask,
    enqueueBlockingGrassTask,
    setFieldReady: (ready) => {
      if (!disposed) fieldReady = ready;
    },
    isFieldReady: () => fieldReady && !disposed,
    dispose,
  };
}
