// src/world/grass/compute/shared/vegetationTileCullTsl.ts — tile mark + id for compact early-out
import { clamp, float, floor, max, min, mix, step, uint, vec2, vec3 } from 'three/tsl';
import { grassSphereInFrustum } from '../../tsl/grassFrustumVisibilityTsl';
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
 * Conservative frustum visibility for one T×T wrap-grid tile (0/1).
 * Sphere sits on sampled terrain Y; radius covers the XZ footprint plus blade bounds.
 */
export function vegetationTileFrustumVisible(params: {
  tileId: TslNode;
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
    tileId,
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
  const midY = sampleTerrainSurfaceY((vec2 as any)(midX, midZ)).add(uSurfaceBias);

  const halfW = wx1.sub(wx0).mul(0.5);
  const halfD = wz1.sub(wz0).mul(0.5);
  const xzR = halfW.mul(halfW).add(halfD.mul(halfD)).sqrt();
  const tileRadius = xzR.add(uBladeBoundsRadius);

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
