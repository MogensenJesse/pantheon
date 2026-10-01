// src/world/grass/compute/shared/vegetationTileCullTsl.ts — tile mark + id for compact early-out
import { clamp, float, floor, max, min, mix, step, uint, vec2, vec3 } from 'three/tsl';
import { CAMERA_LAG_RADIUS_PER_M, grassSphereInFrustum } from '../../tsl/grassFrustumVisibilityTsl';
import type { TslNode } from '../../tsl/tslNode';

/** Terrain height samples per tile edge (corners, edge midpoints, centre). */
const TILE_HEIGHT_SAMPLE_T = [0, 0.5, 1] as const;

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
 * Map player-local wrapped blade offset → linear tile id (uint).
 * spacing = tileSize / bladesPerSide (same as init grid). Tile row/col use integer division:
 * f32 division may land just under an exact multiple and shift the blade one tile over.
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
  const col = uint(
    clamp(floor(offsetX.add(halfTile).div(spacing)), float(0), uBladesPerSide.sub(1)),
  );
  const row = uint(
    clamp(floor(offsetZ.add(halfTile).div(spacing)), float(0), uBladesPerSide.sub(1)),
  );
  return row.div(tileCullSize).mul(tilesPerSide).add(col.div(tileCullSize));
}

/**
 * Conservative frustum visibility for one T×T wrap-grid tile (0/1). `tileIndex`, `tileCullSize`
 * and `tilesPerSide` are uint so row/col are exact.
 * The sphere bounds the tile's XZ footprint and its sampled terrain height range (3×3 grid:
 * exact on planar slopes), plus blade bounds and the extra distance pad a blade at the tile's
 * far edge gets in `grassSphereInFrustum`. Only relief peaking between samples can poke out.
 */
export function vegetationTileFrustumVisible(params: {
  tileIndex: TslNode;
  uTileSize: TslNode;
  uBladesPerSide: TslNode;
  tileCullSize: TslNode;
  tilesPerSide: TslNode;
  uPlayerPosition: TslNode;
  uSurfaceBias: TslNode;
  uBladeBoundsRadius: TslNode;
  sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode;
}): TslNode {
  const {
    tileIndex,
    uTileSize,
    uBladesPerSide,
    tileCullSize,
    tilesPerSide,
    uPlayerPosition,
    uSurfaceBias,
    uBladeBoundsRadius,
    sampleTerrainSurfaceY,
  } = params;

  const halfTile = uTileSize.mul(0.5);
  const spacing = uTileSize.div(uBladesPerSide);
  const col0 = float(tileIndex.mod(tilesPerSide).mul(tileCullSize));
  const row0 = float(tileIndex.div(tilesPerSide).mul(tileCullSize));
  const col1 = min(col0.add(float(tileCullSize)), uBladesPerSide);
  const row1 = min(row0.add(float(tileCullSize)), uBladesPerSide);

  const wx0 = col0.mul(spacing).sub(halfTile).add(uPlayerPosition.x);
  const wx1 = col1.mul(spacing).sub(halfTile).add(uPlayerPosition.x);
  const wz0 = row0.mul(spacing).sub(halfTile).add(uPlayerPosition.z);
  const wz1 = row1.mul(spacing).sub(halfTile).add(uPlayerPosition.z);

  const heights: TslNode[] = [];
  for (const tz of TILE_HEIGHT_SAMPLE_T) {
    for (const tx of TILE_HEIGHT_SAMPLE_T) {
      const xz = (vec2 as any)(mix(wx0, wx1, tx), mix(wz0, wz1, tz));
      heights.push(sampleTerrainSurfaceY(xz).toVar());
    }
  }
  const minY = heights.reduce((a, b) => min(a, b));
  const maxY = heights.reduce((a, b) => max(a, b));

  const midX = wx0.add(wx1).mul(0.5);
  const midZ = wz0.add(wz1).mul(0.5);
  const midY = minY.add(maxY).mul(0.5).add(uSurfaceBias);

  const halfW = wx1.sub(wx0).mul(0.5);
  const halfD = wz1.sub(wz0).mul(0.5);
  const halfH = maxY.sub(minY).mul(0.5);
  const boxR = halfW.mul(halfW).add(halfD.mul(halfD)).add(halfH.mul(halfH)).sqrt();
  const tileRadius = boxR.mul(1 + CAMERA_LAG_RADIUS_PER_M).add(uBladeBoundsRadius);

  return grassSphereInFrustum((vec3 as any)(midX, midY, midZ), tileRadius);
}

/** Frames a tile stays "on" after leaving the frustum — kills edge flicker while walking. */
const TILE_MARK_STICKY_FRAMES = 2;

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
