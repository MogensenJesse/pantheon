// src/world/village/render/windowGlow.ts — one glow instance per lit building, added and removed as lights change
import { type DirectionalLight, Matrix4, Quaternion, Vector3 } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import {
  BUILDING_TYPES,
  glowKey,
  hasWindowGlow,
  type VillageBuildingType,
} from '../assets/villageAssetKeys';
import type { Building } from '../sim/villageTypes';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';
import { createWindowGlowMaterial } from './windowGlowMaterial';

const GLOW_CAPACITY = 64;
const _matrix = new Matrix4();
const _quaternion = new Quaternion();
const _scale = new Vector3(1, 1, 1);
const Y_AXIS = new Vector3(0, 1, 0);

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
        _quaternion.setFromAxisAngle(Y_AXIS, building.rotY);
        const position = new Vector3(
          building.x,
          building.plinthTopY - floorYOf(building.type),
          building.z,
        );
        _matrix.compose(position, _quaternion, _scale);
        const added = batch.add(building.x, building.z, _matrix);
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
