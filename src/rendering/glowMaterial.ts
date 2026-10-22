// src/rendering/glowMaterial.ts — live HDR scale + render order for glow meshes
import { AdditiveBlending, DoubleSide } from 'three';
import { uniform } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../config/visualTuning';

/** Live HDR multiplier for glow mesh bloom contribution (dev-tunable). */
export const uHdrBloomScale = uniform(VISUAL.bloom.HDR_SCALE);

/** After {@link PantheonWaterMesh} (`renderOrder` 1) so transparent glow isn't painted over. */
export const GLOW_MESH_RENDER_ORDER = 2;

export function setHdrBloomScale(value: number): void {
  uHdrBloomScale.value = value;
}

/** A see-through additive material for a glowing ribbon: no depth write, no fog, seen from both sides. */
export function createAdditiveGlowMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  material.fog = false;
  return material;
}
