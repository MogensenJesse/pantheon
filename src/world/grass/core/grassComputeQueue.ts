// src/world/grass/grassComputeQueue.ts — per-frame GPU compaction queue + rebuild task serialization
import type { ComputeNode, WebGPURenderer } from 'three/webgpu';
import { flowersEnabled } from '../config/flowerConfig';

export interface VegetationComputeNodes {
  computeCompactReset: ComputeNode;
  computeUpdateCompact: ComputeNode;
}

export interface GrassComputeQueue {
  whenComputeReady: () => Promise<void>;
  requestCompute: () => void;
  drainPerFrameCompute: () => Promise<void>;
  enqueueGrassTask: (task: () => Promise<void>) => Promise<void>;
  enqueueBlockingGrassTask: (task: () => Promise<void>) => Promise<void>;
  setFieldReady: (ready: boolean) => void;
  isFieldReady: () => boolean;
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

  const resetCompactBuffers = async () => {
    const nodes = [
      ...getGrassNodes().map((n) => n.computeCompactReset),
      ...(flowersEnabled() && getFlowerNodes() ? [getFlowerNodes()!.computeCompactReset] : []),
    ];
    await Promise.all(nodes.map((node) => renderer.computeAsync(node)));
  };

  const runCompactPass = async () => {
    await resetCompactBuffers();
    const nodes = [
      ...getGrassNodes().map((n) => n.computeUpdateCompact),
      ...(flowersEnabled() && getFlowerNodes() ? [getFlowerNodes()!.computeUpdateCompact] : []),
    ];
    await Promise.all(nodes.map((node) => renderer.computeAsync(node)));
  };

  const requestCompute = () => {
    if (!fieldReady) return;
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
    grassTask = run.catch(() => {});
    return run;
  };

  const drainPerFrameCompute = async () => {
    await computeReady;
    pendingCompute = false;
  };

  const enqueueBlockingGrassTask = (task: () => Promise<void>): Promise<void> => {
    fieldReady = false;
    return enqueueGrassTask(async () => {
      await drainPerFrameCompute();
      await task();
    });
  };

  return {
    whenComputeReady: () => Promise.all([computeReady, grassTask]).then(() => {}),
    requestCompute,
    drainPerFrameCompute,
    enqueueGrassTask,
    enqueueBlockingGrassTask,
    setFieldReady: (ready) => {
      fieldReady = ready;
    },
    isFieldReady: () => fieldReady,
  };
}
