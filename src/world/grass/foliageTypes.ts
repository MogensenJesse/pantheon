// src/world/grass/foliageTypes.ts — shared foliage pack / biome scatter types

export type FoliagePackKey = 'grass_medium_01' | 'grass_medium_02' | 'moss_01';

export type FoliageScatterBiomeKey = 'shore' | 'forest' | 'hills' | 'mountain';

export interface FoliageBiomeRule {
  countShare: number;
  spacingMul: number;
  packs: Partial<Record<FoliagePackKey, number>>;
}

export type FoliageBiomeRules = Record<FoliageScatterBiomeKey, FoliageBiomeRule>;

export interface FoliageVariantEntry {
  key: string;
  packKey: FoliagePackKey;
  meshName: string;
  class: 'cover' | 'accent';
  weight: number;
}

export interface FoliagePackDef {
  registryKey: string;
  gltfPath: string;
  alphaPath?: string;
  preferredMeshForTextures: string;
  variants: readonly FoliageVariantEntry[];
}

export interface FoliagePlacement {
  x: number;
  z: number;
  h: number;
  yRotation: number;
  scale: number;
  instanceIndex: number;
  biomeKey: FoliageScatterBiomeKey;
  packKey: FoliagePackKey;
  meshName: string;
  variantKey: string;
}
