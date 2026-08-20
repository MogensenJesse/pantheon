// src/rendering/glowMaterial.ts — live HDR scale + render order for glow meshes
import { uniform } from 'three/tsl';
import { VISUAL } from '../config/visualTuning';

/** Live HDR multiplier for glow mesh bloom contribution (dev-tunable). */
export const uHdrBloomScale = uniform(VISUAL.bloom.HDR_SCALE);

/** After {@link PantheonWaterMesh} (`renderOrder` 1) so transparent glow isn't painted over. */
export const GLOW_MESH_RENDER_ORDER = 2;

export function setHdrBloomScale(value: number): void {
  uHdrBloomScale.value = value;
}
