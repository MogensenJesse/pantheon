// src/landmarks/landmarkHover.ts — the runestones hang in the air: a bob and a slow turn, written into their matrices
//
// The three stones of the runestones landmark are props under their own keys (`stone_runic_hover_*`, see the
// manifest). Their static lift over the ground is already in their instance matrix (`surfaceLift` in the stand-in
// table); every drawn frame this moves them from there: up and down like the orb's bob, and a turn about the
// stone's own vertical axis. Each stone has its own phase and speeds (`VISUAL.landmark.hover.stones`), so they
// never rise and fall together. Writing the matrix (not bobbing in the shader) puts the turn on the stone's own
// axis and lets the shadow follow. (pure apart from the group list: node-runnable)

import { Matrix4 } from 'three';
import { HOVERING_STONE_NUMBERS, HOVERING_STONE_PREFIX } from '../assets/assetManifest.ts';
import { landmark as LOOK } from '../config/visual/landmark.ts';
import type { PropLodGroup } from '../world/mapProps/mapPropLod.ts';

const TAU = Math.PI * 2;

/** Which stone of the landmark (0, 1, 2) a prop key is, or -1 when it does not hang in the air. */
export function hoverIndexOf(key: string): number {
  if (!key.startsWith(HOVERING_STONE_PREFIX)) return -1;
  return (HOVERING_STONE_NUMBERS as readonly number[]).indexOf(
    Number(key.slice(HOVERING_STONE_PREFIX.length)),
  );
}

/** How far stone `index` is from its resting pose `elapsedS` seconds in: up (m) and turned (rad, 0..2π). */
export function hoverPose(index: number, elapsedS: number): { dy: number; yaw: number } {
  const { bobM, speed, spin, stones } = LOOK.hover;
  const stone = stones[index % stones.length]!;
  return {
    dy: bobM * Math.sin(elapsedS * speed * stone.speed + stone.phase),
    yaw: (((elapsedS * spin * stone.spin) % TAU) + TAU) % TAU,
  };
}

export interface LandmarkHover {
  /** Once per drawn frame, before the prop LOD update that uploads the matrices. */
  frame: (frameDelta: number) => void;
}

/** Hangs the hovering stones among `groups` (the map's prop LOD groups) and keeps them moving. */
export function createLandmarkHover(groups: readonly PropLodGroup[]): LandmarkHover {
  const stones = groups.flatMap((group) => {
    const index = hoverIndexOf(group.key);
    if (index < 0) return [];
    return group.matrices.map((m, at) => ({
      group,
      at,
      index,
      base: m.clone(),
      written: m.clone(),
    }));
  });
  const turn = new Matrix4();
  let elapsed = 0;

  return {
    frame(frameDelta) {
      elapsed += frameDelta;
      for (const stone of stones) {
        const m = stone.group.matrices[stone.at]!;
        // Someone re-seated the stone (the ground under it moved): start from where it is now.
        if (!m.equals(stone.written)) stone.base.copy(m);
        const { dy, yaw } = hoverPose(stone.index, elapsed);
        m.copy(stone.base).multiply(turn.makeRotationY(yaw));
        m.elements[13] += dy;
        stone.written.copy(m);
        stone.group.dirty = true;
      }
    },
  };
}
