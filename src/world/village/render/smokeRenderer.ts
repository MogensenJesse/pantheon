// src/world/village/render/smokeRenderer.ts — chimney smoke: shader-animated puffs, strength set per chimney
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, PlaneGeometry } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { hash01 } from '../sim/geometry';
import { createSmokeMaterial } from './smokeMaterial';

export interface SmokeRenderer {
  readonly mesh: InstancedMesh;
  addChimney: (id: number, x: number, y: number, z: number) => void;
  /** 0 (cold) .. 1 (cooking). */
  setStrength: (id: number, strength: number) => void;
  dispose: () => void;
}

function dynamicAttribute(count: number): InstancedBufferAttribute {
  const attr = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
  attr.setUsage(DynamicDrawUsage);
  return attr;
}

export function createSmokeRenderer(): SmokeRenderer {
  const SMOKE = VISUAL.village.SMOKE;
  const puffs = SMOKE.PUFFS_PER_CHIMNEY;
  const capacity = VISUAL.village.CAPACITY.CHIMNEYS * puffs;
  const emit = dynamicAttribute(capacity); // chimney top x, y, z + seed
  const state = dynamicAttribute(capacity); // strength, puff slot 0..1

  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('iEmit', emit);
  geometry.setAttribute('iState', state);
  const material = createSmokeMaterial();
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'villageSmoke';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  const slotOf = new Map<number, number>();

  return {
    mesh,
    addChimney: (id, x, y, z) => {
      if (slotOf.has(id) || slotOf.size * puffs + puffs > capacity) return;
      const slot = slotOf.size;
      slotOf.set(id, slot);
      const seed = hash01(id + 3);
      for (let k = 0; k < puffs; k++) {
        const i = slot * puffs + k;
        emit.setXYZW(i, x, y, z, seed);
        state.setXYZW(i, VISUAL.village.SMOKE_SCHEDULE.IDLE, k / puffs, 0, 0);
      }
      mesh.count = slotOf.size * puffs;
      emit.needsUpdate = true;
      state.needsUpdate = true;
    },
    setStrength: (id, strength) => {
      const slot = slotOf.get(id);
      if (slot === undefined) return;
      for (let k = 0; k < puffs; k++) state.setX(slot * puffs + k, strength);
      state.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      slotOf.clear();
    },
  };
}
