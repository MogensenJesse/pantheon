// src/world/grass/core/grassComputeQueue.ts — sync GPU compaction + rebuild task serialization
import type { ComputeNode, WebGPURenderer } from 'three/webgpu';
import { flowersEnabled } from '../config/flowerConfig';

export interface VegetationComputeNodes {
  computeUpdateCompact: ComputeNode;
  /** Optional frustum tile-mark pass (grass rings); run before compact. */
  computeMarkTiles?: ComputeNode;
}

export interface GrassComputeRequest {
  /** Ring indices to omit from this compact pass (Perf LOD hides). */
  skipRingIndices?: ReadonlySet<number>;
  skipFlower?: boolean;
}

export interface GrassComputeQueue {
  whenComputeReady: () => Promise<void>;
  /** Submit mark + compact now (CPU-sync encode). No-op while a rebuild holds the field. */
  runCompactPass: (request?: GrassComputeRequest) => void;
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
  let grassTask: Promise<void> = Promise.resolve();
  let disposed = false;
  /** Stable arrays so Three.js WeakMap compute-group keys do not churn. */
  const markNodes: ComputeNode[] = [];
  const compactNodes: ComputeNode[] = [];

  const runCompactPass = (request?: GrassComputeRequest) => {
    if (disposed || !fieldReady) return;

    const skipRingIndices = request?.skipRingIndices;
    const skipFlower = request?.skipFlower ?? false;
    const flower = !skipFlower && flowersEnabled() ? getFlowerNodes() : null;

    markNodes.length = 0;
    compactNodes.length = 0;
    for (const [ringIndex, node] of getGrassNodes().entries()) {
      if (skipRingIndices?.has(ringIndex)) continue;
      if (node.computeMarkTiles) markNodes.push(node.computeMarkTiles);
      compactNodes.push(node.computeUpdateCompact);
    }
    if (flower) compactNodes.push(flower.computeUpdateCompact);
    if (markNodes.length === 0 && compactNodes.length === 0) return;

    try {
      // Two submits: tile marks must be visible to compact. Same-pass dispatches
      // have no guaranteed storage barrier across WebGPU backends.
      if (markNodes.length > 0) renderer.compute(markNodes);
      if (compactNodes.length > 0) renderer.compute(compactNodes);
    } catch (err) {
      console.error('[grass] compute failed:', err);
    }
  };

  const enqueueGrassTask = (task: () => Promise<void>): Promise<void> => {
    const run = grassTask.then(task, task);
    grassTask = run.catch((err) => {
      console.error('[grass] task failed:', err);
    });
    return run;
  };

  const enqueueBlockingGrassTask = (task: () => Promise<void>): Promise<void> => {
    if (disposed) return Promise.resolve();
    fieldReady = false;
    return enqueueGrassTask(task);
  };

  const whenComputeReady = () => grassTask.then(() => {});

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    fieldReady = false;
    await whenComputeReady();
  };

  return {
    whenComputeReady,
    runCompactPass,
    enqueueBlockingGrassTask,
    setFieldReady: (ready) => {
      if (!disposed) fieldReady = ready;
    },
    isFieldReady: () => fieldReady && !disposed,
    dispose,
  };
}
