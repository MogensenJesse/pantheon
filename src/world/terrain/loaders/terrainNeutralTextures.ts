// src/world/terrain/loaders/terrainNeutralTextures.ts — shared optional neutral maps (not load-failure fallbacks)
import { DataTexture } from 'three';
import { configureDataTexture } from './terrainTextureConfigure';

let neutralDisplacement: DataTexture | null = null;
let defaultSpec: DataTexture | null = null;

/** Black R8-style displacement — no height offset when a biome has no disp map. */
export function getNeutralDisplacementTexture(): DataTexture {
  if (!neutralDisplacement) {
    neutralDisplacement = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    configureDataTexture(neutralDisplacement);
  }
  return neutralDisplacement;
}

/** White specular when glTF omits KHR_materials_specular. */
export function getDefaultSpecTexture(): DataTexture {
  if (!defaultSpec) {
    defaultSpec = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    configureDataTexture(defaultSpec);
  }
  return defaultSpec;
}

/** Process-lifetime neutrals — must not be disposed after atlas pack. */
export function isTerrainSharedNeutralTexture(tex: { uuid: string }): boolean {
  return (
    tex.uuid === getNeutralDisplacementTexture().uuid || tex.uuid === getDefaultSpecTexture().uuid
  );
}
