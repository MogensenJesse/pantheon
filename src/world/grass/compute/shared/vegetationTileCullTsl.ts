// src/world/grass/compute/shared/vegetationTileCullTsl.ts — tile mark + id for compact early-out
import { clamp, float, floor, max, min, mix, smoothstep, step, uint, vec3 } from 'three/tsl';
import { grassSharedUniforms } from '../../config/grassUniforms';
import {
  grassFrustumBypassActive,
  grassFrustumVisibilityAt,
} from '../../tsl/grassFrustumVisibilityTsl';
import type { TslNode } from '../../tsl/tslNode';

/** CPU helper: tiles along one wrap-grid edge. */
export function grassTilesPerSide(bladesPerSide: number, tileCullSize: number): number {
  const t = Math.max(1, Math.floor(tileCullSize));
  return Math.max(1, Math.ceil(Math.max(1, bladesPerSide) / t));
}

export function grassTileCount(bladesPerSide: number, tileCullSize: number): number {
  const side = grassTilesPerSide(bladesPerSide, tileCullSize);
  return side * side;
}

/**
 * Map player-local wrapped blade offset → linear tile id.
 * spacing = tileSize / bladesPerSide (same as init grid).
 */
export function vegetationTileIdFromOffset(
  offsetX: TslNode,
  offsetZ: TslNode,
  uTileSize: TslNode,
  uBladesPerSide: TslNode,
  tileCullSize: TslNode,
  tilesPerSide: TslNode,
): TslNode {
  const halfTile = uTileSize.mul(0.5);
  const spacing = uTileSize.div(uBladesPerSide);
  const col = clamp(floor(offsetX.add(halfTile).div(spacing)), float(0), uBladesPerSide.sub(1));
  const row = clamp(floor(offsetZ.add(halfTile).div(spacing)), float(0), uBladesPerSide.sub(1));
  const tileX = floor(col.div(tileCullSize));
  const tileZ = floor(row.div(tileCullSize));
  return tileZ.mul(tilesPerSide).add(tileX);
}

/**
 * Tile-mark frustum pads — looser than per-blade cull, and grow with look-down so
 * ground foreshortening does not pop whole T×T blocks at screen edges.
 */
function tileMarkFrustumUniforms() {
  const u = grassSharedUniforms as any;
  // 0 at horizon → 1 at steep pitch (blade bypass threshold).
  const lookDown = float(1).sub(smoothstep(float(-0.55), float(-0.08), u.uCameraForward.y));
  const extraPadX = lookDown.mul(0.55).add(0.12);
  const extraPadY = lookDown.mul(1.1).add(0.2);
  return {
    uCameraMatrix: u.uCameraMatrix,
    uFx: u.uFx,
    uFy: u.uFy,
    uCullPadNdcX: u.uCullPadNdcX.add(extraPadX),
    uCullPadNdcYNear: u.uCullPadNdcYNear.add(extraPadY),
    uCullPadNdcYFar: u.uCullPadNdcYFar.add(extraPadY),
  };
}

/**
 * Conservative frustum visibility for one T×T wrap-grid tile (0/1).
 * Sample at player height (where blades sit). Do not use y=0 / full heightScale
 * corners alone — those often miss the vertical FOV while grass is on-screen.
 */
export function vegetationTileFrustumVisible(params: {
  tileId: TslNode;
  uTileSize: TslNode;
  uBladesPerSide: TslNode;
  tileCullSize: TslNode;
  tilesPerSide: TslNode;
  uPlayerPosition: TslNode;
  uHeightScale: TslNode;
  uSurfaceBias: TslNode;
  uBladeBoundsRadius: TslNode;
}): TslNode {
  const {
    tileId,
    uTileSize,
    uBladesPerSide,
    tileCullSize,
    tilesPerSide,
    uPlayerPosition,
    uHeightScale,
    uSurfaceBias,
    uBladeBoundsRadius,
  } = params;

  const halfTile = uTileSize.mul(0.5);
  const spacing = uTileSize.div(uBladesPerSide);
  const tileX = tileId.mod(tilesPerSide);
  const tileZ = floor(tileId.div(tilesPerSide));
  const col0 = tileX.mul(tileCullSize);
  const row0 = tileZ.mul(tileCullSize);
  const col1 = min(col0.add(tileCullSize), uBladesPerSide);
  const row1 = min(row0.add(tileCullSize), uBladesPerSide);

  const x0 = col0.mul(spacing).sub(halfTile);
  const x1 = col1.mul(spacing).sub(halfTile);
  const z0 = row0.mul(spacing).sub(halfTile);
  const z1 = row1.mul(spacing).sub(halfTile);

  const wx0 = x0.add(uPlayerPosition.x);
  const wx1 = x1.add(uPlayerPosition.x);
  const wz0 = z0.add(uPlayerPosition.z);
  const wz1 = z1.add(uPlayerPosition.z);
  const midX = wx0.add(wx1).mul(0.5);
  const midZ = wz0.add(wz1).mul(0.5);
  const midY = uPlayerPosition.y;

  const u = grassSharedUniforms as any;
  const lookDown = float(1).sub(smoothstep(float(-0.55), float(-0.08), u.uCameraForward.y));

  // Cover tile XZ footprint without `length(vec2)` (unsafe with casted nodes in WGSL).
  const halfExt = max(wx1.sub(wx0), wz1.sub(wz0)).mul(0.5);
  const relief = max(uHeightScale.mul(0.25), uBladeBoundsRadius.mul(8)).add(uSurfaceBias);
  // Pitch-down grows world radius — ground tiles occupy more screen and need over-include.
  const tileRadius = halfExt
    .mul(mix(float(2.2), float(3.5), lookDown))
    .add(uBladeBoundsRadius)
    .add(relief);

  const cam = tileMarkFrustumUniforms();
  // Cast: TSL vec3(x,y,z) typings reject swizzled uniform components across module boundaries.
  const yTip = midY.add(uBladeBoundsRadius);
  const c0 = grassFrustumVisibilityAt((vec3 as any)(wx0, midY, wz0), tileRadius, cam);
  const c1 = grassFrustumVisibilityAt((vec3 as any)(wx1, midY, wz0), tileRadius, cam);
  const c2 = grassFrustumVisibilityAt((vec3 as any)(wx0, midY, wz1), tileRadius, cam);
  const c3 = grassFrustumVisibilityAt((vec3 as any)(wx1, midY, wz1), tileRadius, cam);
  const cMid = grassFrustumVisibilityAt((vec3 as any)(midX, midY, midZ), tileRadius, cam);
  const cTip = grassFrustumVisibilityAt((vec3 as any)(midX, yTip, midZ), tileRadius, cam);

  const frustumVis = max(cTip, max(cMid, max(max(c0, c1), max(c2, c3))));
  // Soft tile bypass starts earlier than blade bypass so mild look-down does not pop blocks.
  const earlyTileBypass = float(1).sub(smoothstep(float(-0.42), float(-0.18), u.uCameraForward.y));
  return mix(frustumVis, float(1), max(grassFrustumBypassActive(), earlyTileBypass));
}

/** Frames a tile stays "on" after leaving the frustum — kills edge flicker while walking. */
const TILE_MARK_STICKY_FRAMES = 12;

/** Write tileVisible[tileId] for mark pass (respects uGrassTileCullEnabled). */
export function assignVegetationTileMark(
  tileVisible: TslNode,
  tileId: TslNode,
  visible01: TslNode,
  uGrassTileCullEnabled: TslNode,
): void {
  const enabled = step(float(0.5), uGrassTileCullEnabled);
  const prev = (tileVisible.element(tileId) as any).toFloat();
  const marked = step(float(0.5), visible01);
  const sticky = float(TILE_MARK_STICKY_FRAMES);
  // Marked → refresh sticky counter; else decay. Cull off → keep all tiles live.
  const decayed = max(float(0), prev.sub(1));
  const next = mix(decayed, sticky, marked);
  const bit = mix(sticky, next, enabled);
  (tileVisible.element(tileId) as any).assign(uint(bit));
}
