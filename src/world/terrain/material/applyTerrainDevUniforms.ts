// src/world/terrain/material/applyTerrainDevUniforms.ts

import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import {
  cloneBiomeTuneMap,
  TERRAIN_ATLAS_BIOME_KEYS,
  type TerrainAtlasBiomeKey,
} from '../config/terrainBiomeTuning';
import type { TerrainSplatMaterial } from './createBiomeSplatMaterial';

function applyBiomeParams(
  terrainMaterial: TerrainSplatMaterial,
  displacementEnabled: boolean,
): void {
  const u = terrainMaterial.terrainUniforms;
  const biomes = devSettings.terrain.biomes;

  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    const tune = biomes[key];
    u.repeat[key].value = tune.tileRepeat;
    u.detailDisp[key].value = displacementEnabled ? tune.detailDisplacement : 0;
    u.normal[key].value = tune.normalStrength;
    u.roughness[key].value = tune.roughness;
  }
}

/** Push dev panel terrain settings into terrain splat TSL uniforms. */
export function applyTerrainDevUniforms(
  terrainMaterial: TerrainSplatMaterial | TerrainSplatMaterial[],
  force = false,
): void {
  const materials = Array.isArray(terrainMaterial) ? terrainMaterial : [terrainMaterial];
  const t = devSettings.terrain;
  if (!force && !t.dirty) return;
  t.dirty = false;

  for (const material of materials) {
    applyBiomeParams(material, t.displacementEnabled);

    const u = material.terrainUniforms;
    u.uSnowHeightStart.value = t.snow.heightStart;
    u.uSnowHeightEnd.value = t.snow.heightEnd;
    u.uSnowMountainWeight.value = t.snow.mountainWeight;
  }
}

export function resetTerrainDevSettings(): void {
  const t = devSettings.terrain;
  const d = VISUAL.terrain;
  t.biomes = cloneBiomeTuneMap(d.biomes);
  t.snow = { ...d.snow };
  t.displacementEnabled = d.displacementEnabled;
  t.showLodBounds = false;
  t.dirty = true;
}

/** Read a single biome tune field from dev settings (dev panel bindings). */
export function readBiomeTune(
  biome: TerrainAtlasBiomeKey,
  field: keyof (typeof devSettings.terrain.biomes)[TerrainAtlasBiomeKey],
): number {
  return devSettings.terrain.biomes[biome][field];
}

/** Write a single biome tune field and mark uniforms dirty. */
export function writeBiomeTune(
  biome: TerrainAtlasBiomeKey,
  field: keyof (typeof devSettings.terrain.biomes)[TerrainAtlasBiomeKey],
  value: number,
): void {
  devSettings.terrain.biomes[biome][field] = value;
  devSettings.terrain.dirty = true;
}
