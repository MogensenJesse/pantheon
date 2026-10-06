// src/rendering/sunShadow/fragmentTextureBudget.ts — granted fragment-stage texture limit

/** WebGPU default `maxSampledTexturesPerShaderStage`. */
const DEFAULT_LIMIT = 16;
let budget = DEFAULT_LIMIT;

/** Set once after renderer init from the adapter-granted `maxSampledTexturesPerShaderStage`. */
export function setFragmentTextureBudget(limit: number | undefined): void {
  budget = Math.max(DEFAULT_LIMIT, limit ?? 0);
}

/**
 * Terrain already sits at the 16-texture default; it only takes the world visibility texture when
 * the device granted more, otherwise its pipeline fails and the mesh disappears.
 */
export function worldCascadeFitsTextureHeavyMaterial(): boolean {
  return budget > DEFAULT_LIMIT;
}
