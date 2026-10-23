// src/world/village/render/villageMaterials.ts — one prop node material per LOD band, shared by the whole vertex-coloured kit
import type { DirectionalLight, Material, Texture } from 'three';
import type { PropMaterialResolver } from '../../mapProps/mapPropInstancing';
import { createMapPropNodeMaterial } from '../../mapProps/material/mapPropMaterial';
import { kitLook } from './villageKitLook';

export interface VillageMaterialPool {
  resolve: PropMaterialResolver;
  dispose: () => void;
}

/**
 * One node material per source material and LOD band: the whole placeholder kit shares one source
 * (white base, vertex colours), and modelled assets share the village atlas material, so the shader
 * graphs are built a handful of times instead of once per key. Textured (modelled) materials get the
 * kit's colour grade (`VISUAL.village.KIT_LOOK`).
 */
export function createVillageMaterialPool(sun: DirectionalLight): VillageMaterialPool {
  const byKey = new Map<string, Material>();
  return {
    resolve: (source, lodBand) => {
      const base = Array.isArray(source) ? source[0]! : source;
      const key = `${base.uuid}:${lodBand}`;
      let material = byKey.get(key);
      if (!material) {
        const textured = (base as Material & { map?: Texture | null }).map;
        material = createMapPropNodeMaterial(sun, base, {
          lodBand,
          grade: textured ? kitLook : undefined,
          largeFaces: true,
        });
        byKey.set(key, material);
      }
      return material;
    },
    dispose: () => {
      for (const material of byKey.values()) material.dispose();
      byKey.clear();
    },
  };
}
