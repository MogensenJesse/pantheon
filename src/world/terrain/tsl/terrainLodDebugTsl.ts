// src/world/terrain/tsl/terrainLodDebugTsl.ts — DEV clipmap rings painted on the terrain surface
import { Color } from 'three';
import { float, length, max, mix, smoothstep, vec2, vec3 } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

type TslNode = any;

const DETAIL_RADIUS = new Color(0x44ffcc);
const DETAIL_FADE = new Color(0xffffff);
const MACRO_RING = new Color(0xffaa44);
const CENTER_SQUARE = new Color(0x44ff88);
const MAP_BOUNDARY = new Color(0xccccff);

const RING_HALF_M = 0.8;
const SQUARE_HALF_M = 0.55;
const MAP_HALF_M = 2;

function colorNode(c: Color): TslNode {
  return vec3(c.r, c.g, c.b);
}

function stripeMask(metric: TslNode, radius: TslNode, halfWidthM: number): TslNode {
  const delta = metric.sub(radius).abs();
  return float(1).sub(smoothstep(float(0), float(halfWidthM), delta));
}

function chebyshevFrom(worldXZ: TslNode, origin: TslNode): TslNode {
  const d = worldXZ.sub(origin);
  return max(d.x.abs(), d.y.abs());
}

/** Mix bright ring/square stripes into lit terrain when `uLodDebugEnabled` is on. */
export function applyTerrainLodDebugOverlay(
  litColor: TslNode,
  worldXZ: TslNode,
  uniforms: TerrainSplatUniforms,
): TslNode {
  const {
    uLodDebugEnabled,
    uDetailPatchOrigin,
    uLodDebugMidOrigin,
    uLodDebugCenterHalf,
    uLodDebugMidHalf,
    uDetailRadiusM,
    uDetailDispFadeStartM,
    uLayerFadeBandM,
    uMacroRadiusM,
    uMacroFadeBandM,
    uWorldSize,
  } = uniforms as any;

  const dist = length(worldXZ.sub(uDetailPatchOrigin));
  const detailFadeStart = max(uDetailDispFadeStartM, uDetailRadiusM.sub(uLayerFadeBandM));
  const macroFadeStart = max(float(0), uMacroRadiusM.sub(uMacroFadeBandM));
  const worldOrigin = vec2(0, 0);
  const mapHalf = uWorldSize.mul(0.5);

  let overlay = litColor;
  overlay = mix(
    overlay,
    colorNode(MAP_BOUNDARY),
    stripeMask(chebyshevFrom(worldXZ, worldOrigin), mapHalf, MAP_HALF_M),
  );
  overlay = mix(
    overlay,
    colorNode(MACRO_RING),
    stripeMask(chebyshevFrom(worldXZ, uLodDebugMidOrigin), uLodDebugMidHalf, SQUARE_HALF_M),
  );
  overlay = mix(overlay, colorNode(MACRO_RING), stripeMask(dist, macroFadeStart, RING_HALF_M));
  overlay = mix(overlay, colorNode(MACRO_RING), stripeMask(dist, uMacroRadiusM, RING_HALF_M));
  overlay = mix(
    overlay,
    colorNode(CENTER_SQUARE),
    stripeMask(chebyshevFrom(worldXZ, uDetailPatchOrigin), uLodDebugCenterHalf, SQUARE_HALF_M),
  );
  overlay = mix(overlay, colorNode(DETAIL_FADE), stripeMask(dist, detailFadeStart, RING_HALF_M));
  overlay = mix(overlay, colorNode(DETAIL_RADIUS), stripeMask(dist, uDetailRadiusM, RING_HALF_M));
  return mix(litColor, overlay, uLodDebugEnabled);
}
