// src/world/terrain/applyTerrainDevUniforms.ts
import { devSettings } from '../../core/GameState';
import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../WorldConfig';
import type { TerrainSplatMaterial } from './TerrainSplatMaterial';

/** Push dev panel terrain settings into terrain splat TSL uniforms. */
export function applyTerrainDevUniforms(terrainMaterial: TerrainSplatMaterial, force = false): void {
  const t = devSettings.terrain;
  if (!force && !t.dirty) return;
  t.dirty = false;
  const u = terrainMaterial.terrainUniforms;
  const dispScale = t.displacementEnabled ? t.displacementScale : 0;
  const pathInner = WORLD.JOURNEY.PATH_SURFACE.WIDTH * 0.5;

  u.uRepeat.value = t.textureRepeat;
  u.uDispScale.value = dispScale;
  u.uNormalStrength.value = t.normalStrength;
  u.uAoStrength.value = t.aoStrength;
  u.uSpecularStrength.value = t.specularStrength;
  u.uSlopeRockStart.value = t.slopeRockStart;
  u.uPathBlendInner.value = pathInner;
  u.uPathBlendOuter.value = pathInner + t.pathBlendSoft;
}

export function resetTerrainDevSettings(): void {
  const t = devSettings.terrain;
  t.textureRepeat = PHASE0.TERRAIN_TEXTURE_REPEAT;
  t.displacementScale = PHASE0.TERRAIN_DISPLACEMENT_SCALE;
  t.displacementEnabled = true;
  t.normalStrength = PHASE0.TERRAIN_NORMAL_STRENGTH;
  t.aoStrength = PHASE0.TERRAIN_AO_STRENGTH;
  t.specularStrength = PHASE0.TERRAIN_SPECULAR_STRENGTH;
  t.slopeRockStart = PHASE0.TERRAIN_SLOPE_ROCK_START;
  t.pathBlendSoft = WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT;
  t.dirty = true;
}
