// src/world/village/render/warmup.ts — show one instance of every mesh so a pipeline compile covers it
import type { InstancedMesh } from 'three';

interface Saved {
  visible: boolean;
  count: number;
  culled: boolean;
}

export interface InstancedWarmup {
  /** Make every mesh draw one instance (frustum culling off); pair with `end`. */
  begin: () => void;
  /** Put every mesh back as `begin` found it. */
  end: () => void;
}

export function createInstancedWarmup(meshes: readonly InstancedMesh[]): InstancedWarmup {
  const saved = new Map<InstancedMesh, Saved>();
  return {
    begin: () => {
      for (const mesh of meshes) {
        saved.set(mesh, { visible: mesh.visible, count: mesh.count, culled: mesh.frustumCulled });
        mesh.visible = true;
        mesh.count = 1;
        mesh.frustumCulled = false;
      }
    },
    end: () => {
      for (const [mesh, state] of saved) {
        mesh.visible = state.visible;
        mesh.count = state.count;
        mesh.frustumCulled = state.culled;
      }
      saved.clear();
    },
  };
}
