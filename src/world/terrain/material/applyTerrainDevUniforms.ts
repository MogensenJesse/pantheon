// src/world/terrain/material/applyTerrainDevUniforms.ts

import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import {
  cloneBiomeTuneMap,
  cloneSnowTune,
  cloneTerrainChiselTune,
  cloneTerrainStylizeTune,
  TERRAIN_ATLAS_BIOME_KEYS,
  type TerrainAtlasBiomeKey,
} from '../config/terrainBiomeTuning';
import {
  applyChiselTuneUniforms,
  applySnowTuneUniforms,
  applyStylizeTuneUniforms,
} from './biomeSplatUniforms';
import type { TerrainSplatMaterial } from './createTerrainSplatMaterial';

function applyBiomeParams(terrainMaterial: TerrainSplatMaterial): void {
  const u = terrainMaterial.terrainUniforms;
  const biomes = devSettings.terrain.biomes;

  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    const tune = biomes[key];
    u.repeat[key].value = tune.tileRepeat;
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
    applyBiomeParams(material);
    applySnowTuneUniforms(material.terrainUniforms, t.snow);
    applyStylizeTuneUniforms(material.terrainUniforms, t.stylize);
    applyChiselTuneUniforms(material.terrainUniforms, t.chisel);
  }
}

export function resetTerrainDevSettings(): void {
  const t = devSettings.terrain;
  const d = VISUAL.terrain;
  t.biomes = cloneBiomeTuneMap(d.biomes);
  t.snow = cloneSnowTune(d.snow);
  t.stylize = cloneTerrainStylizeTune(d.stylize);
  t.chisel = cloneTerrainChiselTune(d.chisel);
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
