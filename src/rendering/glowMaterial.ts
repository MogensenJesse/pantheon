// src/rendering/glowMaterial.ts — HDR color for scene-output bloom + visible shell
import { type Blending, type Side } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { color, float } from 'three/tsl';
import { PHASE0 } from '../config/phase0';

/** HDR multiplier so scene-output bloom picks up glow meshes. */
export const HDR_BLOOM_SCALE: number = PHASE0.BLOOM.HDR_SCALE;

export type GlowNodeMaterial = MeshBasicNodeMaterial & {
  colorNode: unknown;
};

export interface GlowMaterialOptions {
  colorHex: number;
  emissiveHex: number;
  emissiveIntensity: number;
  transparent?: boolean;
  opacity?: number;
  side?: Side;
  depthWrite?: boolean;
  blending?: Blending;
}

export function createGlowNodeMaterial(opts: GlowMaterialOptions): GlowNodeMaterial {
  const mat = new MeshBasicNodeMaterial({
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? !opts.transparent,
  });
  if (opts.side !== undefined) mat.side = opts.side;
  if (opts.blending !== undefined) mat.blending = opts.blending;

  const hdr = color(opts.emissiveHex).mul(float(opts.emissiveIntensity * HDR_BLOOM_SCALE));
  const glowMat = mat as GlowNodeMaterial;
  glowMat.colorNode = hdr;
  return glowMat;
}
