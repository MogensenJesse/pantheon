// src/world/grass/core/grassComputeQueue.ts — per-frame GPU compaction queue + rebuild task serialization
import type { ComputeNode, WebGPURenderer } from 'three/webgpu';
import { flowersEnabled } from '../config/flowerConfig';

export interface VegetationComputeNodes {
  computeUpdateCompact: ComputeNode;
  /** Optional frustum tile-mark pass (grass rings); run before compact. */
  computeMarkTiles?: ComputeNode;
}

export interface GrassComputeRequest {
  /** Ring indices to omit from this compact pass (idle rings with zero draw). */
  skipRingIndices?: ReadonlySet<number>;
  skipFlower?: boolean;
}

export interface GrassComputeQueueHooks {
  /** Sync: freeze uniforms the GPU pass will consume (e.g. accumulated player delta). */
  onPassBegin?: () => void;
  /** Sync: after the pass finishes (success or fail). */
  onPassEnd?: () => void;
}

export interface GrassComputeQueue {
  whenComputeReady: () => Promise<void>;
  requestCompute: (request?: GrassComputeRequest) => void;
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
  hooks?: GrassComputeQueueHooks,
): GrassComputeQueue {
  let fieldReady = true;
  let computeInFlight = false;
  let pendingCompute = false;
  let pendingRequest: GrassComputeRequest | undefined;
  let grassTask: Promise<void> = Promise.resolve();
  let computeReady: Promise<void> = Promise.resolve();
  let disposed = false;

  const runCompactPass = async (request?: GrassComputeRequest) => {
    const skipRingIndices = request?.skipRingIndices;
    const skipFlower = request?.skipFlower ?? false;
    const flower = !skipFlower && flowersEnabled() ? getFlowerNodes() : null;
    const grassNodes = getGrassNodes()
      .map((node, ringIndex) => ({ node, ringIndex }))
      .filter(({ ringIndex }) => !skipRingIndices?.has(ringIndex))
      .map(({ node }) => node);

    hooks?.onPassBegin?.();
    try {
      // Mark all rings, then compact all — tile bits must be fresh before blade early-out,
      // but rings are independent so parallelize within each phase (cuts walk lag).
      const markJobs = grassNodes
        .map((node) => node.computeMarkTiles)
        .filter((mark): mark is ComputeNode => mark != null)
        .map((mark) => renderer.computeAsync(mark));
      if (markJobs.length > 0) await Promise.all(markJobs);

      const compactJobs = grassNodes.map((node) =>
        renderer.computeAsync(node.computeUpdateCompact),
      );
      if (flower) {
        compactJobs.push(renderer.computeAsync(flower.computeUpdateCompact));
      }
      await Promise.all(compactJobs);
    } finally {
      hooks?.onPassEnd?.();
    }
  };

  const requestCompute = (request?: GrassComputeRequest) => {
    if (disposed || !fieldReady) return;
    pendingRequest = request;
    pendingCompute = true;
    if (computeInFlight) return;
    computeInFlight = true;
    computeReady = (async () => {
      try {
        while (pendingCompute) {
          const requestForPass = pendingRequest;
          pendingRequest = undefined;
          pendingCompute = false;
          try {
            await runCompactPass(requestForPass);
          } catch (err) {
            console.error('[grass] compute failed:', err);
          }
        }
      } finally {
        computeInFlight = false;
        if (pendingCompute) requestCompute(pendingRequest);
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
    pendingRequest = undefined;
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
    pendingRequest = undefined;
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
