// src/optimizer/workers/geometryWorker.ts — simplify / remesh / atlas off the main thread
import { atlasUnwrap } from '../pipeline/atlasUv';
import { flattenPrimitives } from '../pipeline/flattenPrimitives';
import { remeshAndRefine } from '../pipeline/remeshRebuild';
import { simplifyPrimitives, whenSimplifierReady } from '../pipeline/simplifyPreserveUv';
import type { WorkerIn, WorkerOut } from './messages';

function post(msg: WorkerOut): void {
  self.postMessage(msg);
}

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const job = event.data;
  try {
    if (job.type === 'simplify') {
      post({
        type: 'progress',
        generation: job.generation,
        phase: 'simplify',
        message: 'Simplifying (Preserve UVs)…',
      });
      await whenSimplifierReady();
      const result = simplifyPrimitives(job.primitives, job.targetTriangles, job.generation);
      post({ type: 'result', generation: job.generation, result });
      return;
    }
    post({
      type: 'progress',
      generation: job.generation,
      phase: 'remesh',
      message: 'Voxel remesh…',
    });
    const flat = flattenPrimitives(job.primitives);
    const remeshed = await remeshAndRefine(
      flat,
      job.targetTriangles,
      job.remeshFlags,
      job.generation,
    );
    const prim = remeshed.primitives[0];
    if (!prim) throw new Error('Remesh produced no geometry');
    post({
      type: 'progress',
      generation: job.generation,
      phase: 'atlas',
      message: 'Unwrapping UV atlas…',
    });
    const atlased = await atlasUnwrap(prim, job.textureSize, 2);
    remeshed.primitives = [atlased];
    remeshed.atlasWidth = atlased.atlasWidth;
    remeshed.atlasHeight = atlased.atlasHeight;
    remeshed.stats.vertices = atlased.positions.length / 3;
    remeshed.stats.triangles = atlased.indices.length / 3;
    post({ type: 'result', generation: job.generation, result: remeshed });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const error = /assertion failed/i.test(raw)
      ? `Meshoptimizer rejected this mesh (${raw}). The source was likely a non-triangle index list or a vertex/index mismatch.`
      : raw;
    post({
      type: 'error',
      generation: job.generation,
      error,
    });
  }
};
