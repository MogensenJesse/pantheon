// src/rendering/bloomLayer.ts — HDR emissiveNode on glow meshes for MRT selective bloom
import { type Object3D } from 'three';
import { NodeMaterial } from 'three/webgpu';
import { color, float } from 'three/tsl';
import { HDR_BLOOM_SCALE } from './glowMaterial';

type GlowNodeMaterial = NodeMaterial & {
  emissiveNode: unknown;
};

/** Write bright emissive into the MRT emissive buffer (bloom picks this up only). */
export function enableBloomEmissive(
  object: Object3D,
  emissiveHex = 0xffffff,
  emissiveIntensity = 1.25,
): void {
  object.traverse((child) => {
    const mat = (child as { material?: unknown }).material;
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (m instanceof NodeMaterial && 'emissiveNode' in m) {
        const glow = m as GlowNodeMaterial;
        glow.emissiveNode = color(emissiveHex).mul(float(emissiveIntensity * HDR_BLOOM_SCALE));
      }
    }
  });
}

/** @deprecated Use enableBloomEmissive */
export const enableBloomLayer = enableBloomEmissive;
