// src/world/village/render/villageMaterials.ts — one prop node material per LOD band, shared by the whole vertex-coloured kit
import type { DirectionalLight, Material } from 'three';
import type { PropMaterialResolver } from '../../mapProps/mapPropInstancing';
import { createMapPropNodeMaterial } from '../../mapProps/material/mapPropMaterial';

export interface VillageMaterialPool {
  resolve: PropMaterialResolver;
  dispose: () => void;
}

/**
 * Every placeholder mesh shades identically (white base, vertex colours), so one material per LOD
 * band serves them all and the shader graph is built three times instead of once per key.
 */
export function createVillageMaterialPool(sun: DirectionalLight): VillageMaterialPool {
  const byBand = new Map<number, Material>();
  return {
    resolve: (source, lodBand) => {
      const base = Array.isArray(source) ? source[0]! : source;
      let material = byBand.get(lodBand);
      if (!material) {
        material = createMapPropNodeMaterial(sun, base, lodBand);
        byBand.set(lodBand, material);
      }
      return material;
    },
    dispose: () => {
      for (const material of byBand.values()) material.dispose();
      byBand.clear();
    },
  };
}
