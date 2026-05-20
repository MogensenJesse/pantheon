// src/rendering/glowMaterial.ts — HDR emissive for bloom + visible shell color
import { type Side } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { color, float } from 'three/tsl';
import { PHASE0 } from '../config/phase0';

/** HDR multiplier for the emissive MRT target (bloom source). */
export const HDR_BLOOM_SCALE: number = PHASE0.BLOOM.HDR_SCALE;

export type GlowNodeMaterial = MeshStandardNodeMaterial & {
  colorNode: unknown;
  emissiveNode: unknown;
};

export interface GlowMaterialOptions {
  colorHex: number;
  emissiveHex: number;
  emissiveIntensity: number;
  transparent?: boolean;
  opacity?: number;
  side?: Side;
  depthWrite?: boolean;
  blending?: import('three').Blending;
}

export function createGlowNodeMaterial(opts: GlowMaterialOptions): GlowNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? undefined,
    depthWrite: opts.depthWrite ?? !opts.transparent,
    blending: opts.blending,
  });
  mat.roughnessNode = float(1);
  mat.metalnessNode = float(0);

  const hdr = color(opts.emissiveHex).mul(float(opts.emissiveIntensity * HDR_BLOOM_SCALE));
  const visible = color(opts.emissiveHex).mul(float(opts.emissiveIntensity * 1.15));

  const glowMat = mat as GlowNodeMaterial;
  glowMat.colorNode = visible;
  glowMat.emissiveNode = hdr;
  return glowMat;
}
