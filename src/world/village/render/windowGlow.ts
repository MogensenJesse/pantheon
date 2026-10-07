// src/world/village/render/windowGlow.ts — one glow instance per lit building, added and removed as lights change
import type { DirectionalLight } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import {
  BUILDING_TYPES,
  glowKey,
  hasWindowGlow,
  type VillageBuildingType,
} from '../model/assetKeys';
import type { Building } from '../model/types';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';
import { composeYawMatrix } from './matrixUtil';
import { createWindowGlowMaterial } from './windowGlowMaterial';

const GLOW_CAPACITY = 64;

export interface WindowGlow {
  readonly batches: readonly DynamicPropBatch[];
  /** Light or darken a building's windows. */
  setLit: (building: Building, lit: boolean) => void;
  dispose: () => void;
}

/**
 * @param floorYOf model floor offset of a building type's finished mesh (glow shares its pivot)
 */
export function createWindowGlow(
  sun: DirectionalLight,
  assets: Map<string, PropLodAsset>,
  floorYOf: (type: VillageBuildingType) => number,
): WindowGlow {
  const material = createWindowGlowMaterial();
  const batches = new Map<VillageBuildingType, DynamicPropBatch>();
  for (const type of BUILDING_TYPES) {
    const asset = assets.get(glowKey(type));
    if (!asset || !hasWindowGlow(type)) continue;
    batches.set(
      type,
      createDynamicPropBatch({
        sun,
        key: glowKey(type),
        asset,
        capacity: GLOW_CAPACITY,
        castsShadow: false,
        resolveMaterials: () => material,
      }),
    );
  }
  const lit = new Map<number, number>();

  return {
    batches: [...batches.values()],
    setLit: (building, on) => {
      const batch = batches.get(building.type);
      if (!batch) return;
      const handle = lit.get(building.id);
      if (on && handle === undefined) {
        const y = building.plinthTopY - floorYOf(building.type);
        const matrix = composeYawMatrix(building.x, y, building.z, building.rotY, 1);
        const added = batch.add(building.x, building.z, matrix);
        if (added) lit.set(building.id, added);
      } else if (!on && handle !== undefined) {
        batch.remove(handle);
        lit.delete(building.id);
      }
    },
    dispose: () => {
      for (const batch of batches.values()) {
        for (const mesh of batch.meshes) mesh.geometry.dispose();
      }
      material.dispose();
      batches.clear();
      lit.clear();
    },
  };
}
