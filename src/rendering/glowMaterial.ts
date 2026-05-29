// src/rendering/glowMaterial.ts — HDR color for scene-output bloom + visible shell
import { type Blending, type Side } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { color, float, uniform } from 'three/tsl';
import { VISUAL } from '../config/visualTuning';

/** Live HDR multiplier for glow mesh bloom contribution (dev-tunable). */
const uHdrBloomScale = uniform(VISUAL.bloom.HDR_SCALE);

export function setHdrBloomScale(value: number): void {
  uHdrBloomScale.value = value;
}

export function getHdrBloomScale(): number {
  return uHdrBloomScale.value;
}

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

  const hdr = color(opts.emissiveHex).mul(float(opts.emissiveIntensity).mul(uHdrBloomScale));
  const glowMat = mat as GlowNodeMaterial;
  glowMat.colorNode = hdr;
  return glowMat;
}
