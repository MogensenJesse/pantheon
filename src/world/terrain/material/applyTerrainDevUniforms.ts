// src/world/terrain/material/applyTerrainDevUniforms.ts

import type { Color } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import {
  cloneBiomeTuneMap,
  cloneSnowTune,
  cloneSolidColorMap,
  TERRAIN_ATLAS_BIOME_KEYS,
  type TerrainAtlasBiomeKey,
} from '../config/terrainBiomeTuning';
import { applySnowTuneUniforms } from './biomeSplatUniforms';
import type { TerrainSplatMaterial } from './createTerrainSplatMaterial';

function applyBiomeParams(
  terrainMaterial: TerrainSplatMaterial,
  displacementEnabled: boolean,
): void {
  const u = terrainMaterial.terrainUniforms;
  const biomes = devSettings.terrain.biomes;
  const colors = devSettings.terrain.solidColors;

  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    const tune = biomes[key];
    u.repeat[key].value = tune.tileRepeat;
    u.detailDisp[key].value = displacementEnabled ? tune.detailDisplacement : 0;
    u.normal[key].value = tune.normalStrength;
    u.roughness[key].value = tune.roughness;
    (u.solidColor[key].value as Color).set(colors[key]);
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
    applySnowTuneUniforms(material.terrainUniforms, t.snow);
  }
}

export function resetTerrainDevSettings(): void {
  const t = devSettings.terrain;
  const d = VISUAL.terrain;
  t.biomes = cloneBiomeTuneMap(d.biomes);
  t.solidColors = cloneSolidColorMap(d.solidColors);
  t.snow = cloneSnowTune(d.snow);
  t.displacementEnabled = d.displacementEnabled;
  t.showLodBounds = false;
  t.dirty = true;
}

export function readSolidColor(biome: TerrainAtlasBiomeKey): string {
  return devSettings.terrain.solidColors[biome];
}

export function writeSolidColor(biome: TerrainAtlasBiomeKey, value: string): void {
  devSettings.terrain.solidColors[biome] = value;
  devSettings.terrain.dirty = true;
}
