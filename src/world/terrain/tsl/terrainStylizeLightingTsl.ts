// src/world/terrain/tsl/terrainStylizeLightingTsl.ts — Firewatch hue-split on chisel faces
import { dot, float, max, normalize } from 'three/tsl';

type TslNode = any;

function lerp(a: TslNode, b: TslNode, t: TslNode): TslNode {
  return a.mul(float(1).sub(t)).add(b.mul(t));
}

/**
 * Shared play + editor lighting. N is the fragment facet face
 * (`chiseledWorldNormalAtWorldXZ`); tangent PBR normals do not light the slabs.
 *
 * Hue-split: mix(unlitRamp, litRamp, (N·L) * sunVis). Umbra picks the shadow
 * palette. Palettes already carry complementary sun/shadow hues; day/night
 * brightness is `sunColor * sunIntensity` (vis is not multiplied again). Mix
 * sampled albedo toward the palettes with `paletteMix`, then AO × (ambient + sun).
 */
export function applyTerrainStylizeLighting(opts: {
  sampledAlbedo: TslNode;
  unlitRamp: TslNode;
  litRamp: TslNode;
  paletteMix: TslNode;
  faceNormal: TslNode;
  sunDirection: TslNode;
  sunColor: TslNode;
  sunIntensity: TslNode;
  ambientColor: TslNode;
  ambientIntensity: TslNode;
  sunVis: TslNode;
  aoTerm: TslNode;
}): { nLit: TslNode; ndl: TslNode; diffuse: TslNode } {
  const nLit = normalize(opts.faceNormal);
  const ndl = max(dot(nLit, opts.sunDirection), 0);
  const hueSplit = lerp(opts.unlitRamp, opts.litRamp, ndl.mul(opts.sunVis));
  const sunLit = opts.sunColor.mul(opts.sunIntensity);
  const color = lerp(opts.sampledAlbedo, hueSplit, opts.paletteMix);
  const diffuse = color
    .mul(opts.aoTerm)
    .mul(opts.ambientColor.mul(opts.ambientIntensity).add(sunLit));
  return { nLit, ndl, diffuse };
}

/** Convenience: 1 = no extra occlusion (editor simple shading). */
export const STYLIZE_LIGHTING_OPEN = float(1);
