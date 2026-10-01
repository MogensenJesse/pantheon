// src/world/grass/compute/shared/vegetationOffsetTsl.ts — stateless wrap-tile XZ from slot index
import { float, floor, hash, max, mod, step, vec2 } from 'three/tsl';
import type { TslNode } from '../../tsl/tslNode';

/**
 * Origin-relative rest pose (unwrapped): one blade per grid cell, uniformly jittered inside
 * its own cell so the field stays stratified, unbiased, and inside the wrap tile. The atlas
 * is sampled at that position for the per-blade scale/wind-phase noise.
 */
export function vegetationJitteredGridOffset(params: {
  slotIndex: TslNode;
  perSide: TslNode;
  spacing: TslNode;
  halfTile: TslNode;
  tileSize: TslNode;
  windTex: TslNode;
}): { offsetX: TslNode; offsetZ: TslNode; atlas: TslNode } {
  const slot = float(params.slotIndex);
  const row = floor(slot.div(params.perSide));
  const col = slot.mod(params.perSide);
  const randX = hash(params.slotIndex.add(4321));
  const randZ = hash(params.slotIndex.add(1234));
  const offsetX = col.add(randX).mul(params.spacing).sub(params.halfTile);
  const offsetZ = row.add(randZ).mul(params.spacing).sub(params.halfTile);

  const tileUv = (vec2 as any)(
    offsetX.add(params.halfTile).div(params.tileSize),
    offsetZ.add(params.halfTile).div(params.tileSize),
  )
    .abs()
    .fract();
  const atlas = params.windTex.sample(tileUv);
  return { offsetX, offsetZ, atlas };
}

/** Player-follow wrap: local XZ in [-half, half] so world = local + player stays on a world cell. */
export function vegetationWrapToPlayer(
  gridX: TslNode,
  gridZ: TslNode,
  playerX: TslNode,
  playerZ: TslNode,
  tileSize: TslNode,
): { x: TslNode; z: TslNode } {
  const halfTile = tileSize.mul(0.5);
  return {
    x: mod(gridX.sub(playerX).add(halfTile), tileSize).sub(halfTile),
    z: mod(gridZ.sub(playerZ).add(halfTile), tileSize).sub(halfTile),
  };
}

function wrapCell(grid: TslNode, player: TslNode, halfTile: TslNode, tileSize: TslNode): TslNode {
  return floor(grid.sub(player).add(halfTile).div(tileSize));
}

/**
 * 1 when this slot jumped to a new world cell since the last compact player XZ.
 * Do not use a field-wide moved mask — that would reset every blade on a walk.
 */
export function vegetationSlotWrapped(
  gridX: TslNode,
  gridZ: TslNode,
  prevPlayerX: TslNode,
  prevPlayerZ: TslNode,
  playerX: TslNode,
  playerZ: TslNode,
  tileSize: TslNode,
): TslNode {
  const halfTile = tileSize.mul(0.5);
  const jump = max(
    wrapCell(gridX, playerX, halfTile, tileSize)
      .sub(wrapCell(gridX, prevPlayerX, halfTile, tileSize))
      .abs(),
    wrapCell(gridZ, playerZ, halfTile, tileSize)
      .sub(wrapCell(gridZ, prevPlayerZ, halfTile, tileSize))
      .abs(),
  );
  return step(float(0.5), jump);
}

/** Rest-pose grid + player-follow wrap for one slot (compact init/update and draw). */
export function vegetationFollowSlot(params: {
  slotIndex: TslNode;
  perSide: TslNode;
  spacing: TslNode;
  tileSize: TslNode;
  windTex: TslNode;
  playerX: TslNode;
  playerZ: TslNode;
}): { offsetX: TslNode; offsetZ: TslNode; gridX: TslNode; gridZ: TslNode; atlas: TslNode } {
  const halfTile = params.tileSize.mul(0.5);
  const placed = vegetationJitteredGridOffset({
    slotIndex: params.slotIndex,
    perSide: params.perSide,
    spacing: params.spacing,
    halfTile,
    tileSize: params.tileSize,
    windTex: params.windTex,
  });
  const wrapped = vegetationWrapToPlayer(
    placed.offsetX,
    placed.offsetZ,
    params.playerX,
    params.playerZ,
    params.tileSize,
  );
  return {
    offsetX: wrapped.x,
    offsetZ: wrapped.z,
    gridX: placed.offsetX,
    gridZ: placed.offsetZ,
    atlas: placed.atlas,
  };
}
