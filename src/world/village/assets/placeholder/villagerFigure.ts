// src/world/village/assets/placeholder/villagerFigure.ts — segmented toy villager (rigid parts, animated in the vertex shader)
import type { BufferGeometry } from 'three';
import { MeshBuilder, type Rgb, type V3 } from './meshBuilder.ts';
import { PALETTE as P } from './palette.ts';

/** Rig part ids stored per vertex (`aRig.w`); the shader swings each part about its pivot (`aRig.xyz`). */
export const VillagerPart = {
  Torso: 0,
  Head: 1,
  ArmL: 2,
  ArmR: 3,
  LegL: 4,
  LegR: 5,
  Tool: 6,
} as const;

/** Joint pivots in figure space (metres, +Y up, facing +Z, feet at y = 0). */
export const VILLAGER_RIG = {
  hip: [0, 0.82, 0] as V3,
  neck: [0, 1.32, 0] as V3,
  shoulderL: [-0.26, 1.28, 0] as V3,
  shoulderR: [0.26, 1.28, 0] as V3,
  hipL: [-0.1, 0.82, 0] as V3,
  hipR: [0.1, 0.82, 0] as V3,
  /** Where the tool is held; the shader scales it about here. */
  hand: [0.28, 0.8, 0.06] as V3,
} as const;

/** Tunic tints the shader picks from by variant (index into this list). */
export const VILLAGER_TUNICS: readonly Rgb[] = [
  P.faluRed,
  P.tunicBlue,
  P.tunicGreen,
  P.ochre,
  P.tunicPlum,
  P.tunicCream,
];

const SKIN: Rgb = P.skin;
const TROUSERS: Rgb = P.trousers;
const BOOTS: Rgb = P.boots;
const HAIR: Rgb = P.hair;
/** White: the shader multiplies it by the villager's tunic tint. */
const TUNIC: Rgb = [1, 1, 1];

/** About 180 triangles; every rigid part is tagged for the vertex shader. */
export function buildVillagerGeometry(): BufferGeometry {
  const b = new MeshBuilder(7, 0.04);
  const { hip, neck, shoulderL, shoulderR, hipL, hipR, hand } = VILLAGER_RIG;

  for (const [part, joint, sx] of [
    [VillagerPart.LegL, hipL, -1],
    [VillagerPart.LegR, hipR, 1],
  ] as const) {
    b.tag(part, joint);
    b.beam([sx * 0.1, 0.82, 0], [sx * 0.1, 0.1, 0], 0.15, TROUSERS);
    b.box(sx * 0.1, 0, 0.05, 0.16, 0.1, 0.27, BOOTS);
  }

  b.tag(VillagerPart.Torso, hip, 1);
  b.box(0, 0.82, 0, 0.44, 0.52, 0.26, TUNIC);
  b.tag(VillagerPart.Torso, hip);
  b.box(0, 0.8, 0, 0.46, 0.07, 0.28, BOOTS);

  b.tag(VillagerPart.Head, neck);
  b.box(0, 1.32, 0, 0.24, 0.26, 0.24, SKIN);
  b.box(0, 1.5, -0.01, 0.27, 0.1, 0.27, HAIR);
  b.box(0, 1.38, 0.13, 0.05, 0.07, 0.05, SKIN);

  for (const [part, shoulder, sx] of [
    [VillagerPart.ArmL, shoulderL, -1],
    [VillagerPart.ArmR, shoulderR, 1],
  ] as const) {
    b.tag(part, shoulder, 1);
    b.beam([sx * 0.26, 1.28, 0], [sx * 0.28, 0.86, 0.02], 0.12, TUNIC);
    b.tag(part, shoulder);
    b.box(sx * 0.28, 0.76, 0.03, 0.1, 0.12, 0.1, SKIN);
  }

  b.tag(VillagerPart.Tool, shoulderR);
  b.beam([hand[0], hand[1], hand[2]], [hand[0], hand[1], hand[2] + 0.36], 0.05, P.timber);
  b.box(hand[0], hand[1] + 0.02, hand[2] + 0.38, 0.1, 0.1, 0.16, P.stoneDark);
  return b.build();
}
