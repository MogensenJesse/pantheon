// src/world/terrain/applyTerrainDevUniforms.ts
import type { ShaderMaterial } from 'three';
import { devSettings } from '../../core/GameState';
import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../WorldConfig';

/** Push dev panel terrain settings into terrain splat shader uniforms. */
export function applyTerrainDevUniforms(terrainMaterial: ShaderMaterial): void {
  const t = devSettings.terrain;
  const dispScale = t.displacementEnabled ? t.displacementScale : 0;
  const pathInner = WORLD.JOURNEY.PATH_SURFACE.WIDTH * 0.5;

  terrainMaterial.uniforms['uRepeat'].value = t.textureRepeat;
  terrainMaterial.uniforms['uDispScale'].value = dispScale;
  terrainMaterial.uniforms['uNormalStrength'].value = t.normalStrength;
  terrainMaterial.uniforms['uAoStrength'].value = t.aoStrength;
  terrainMaterial.uniforms['uSpecularStrength'].value = t.specularStrength;
  terrainMaterial.uniforms['uSlopeRockStart'].value = t.slopeRockStart;
  terrainMaterial.uniforms['uPathBlendInner'].value = pathInner;
  terrainMaterial.uniforms['uPathBlendOuter'].value = pathInner + t.pathBlendSoft;
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
}
