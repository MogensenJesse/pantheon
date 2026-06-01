// src/world/terrain/applyTerrainDevUniforms.ts
import { devSettings } from '../../core/GameState';
import { VISUAL } from '../../config/visualTuning';
import type { TerrainSplatMaterial } from './TerrainSplatMaterial';

/** Push dev panel terrain settings into terrain splat TSL uniforms. */
export function applyTerrainDevUniforms(terrainMaterial: TerrainSplatMaterial, force = false): void {
  const t = devSettings.terrain;
  if (!force && !t.dirty) return;
  t.dirty = false;
  const u = terrainMaterial.terrainUniforms;
  const dispScale = t.displacementEnabled ? t.displacementScale : 0;

  u.uRepeat.value = t.textureRepeat;
  u.uDispScale.value = dispScale;
  u.uNormalStrength.value = t.normalStrength;
  u.uAoStrength.value = t.aoStrength;
  u.uSpecularStrength.value = t.specularStrength;
  u.uSlopeRockStart.value = t.slopeRockStart;
}

export function resetTerrainDevSettings(): void {
  const t = devSettings.terrain;
  const d = VISUAL.terrain;
  t.textureRepeat = d.textureRepeat;
  t.displacementScale = d.displacementScale;
  t.displacementEnabled = d.displacementEnabled;
  t.normalStrength = d.normalStrength;
  t.aoStrength = d.aoStrength;
  t.specularStrength = d.specularStrength;
  t.slopeRockStart = d.slopeRockStart;
  t.dirty = true;
}
