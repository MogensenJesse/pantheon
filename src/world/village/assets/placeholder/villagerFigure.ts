// src/world/village/assets/placeholder/villagerFigure.ts — chunky toy villagers (rigid parts, animated in the vertex shader)
import type { BufferGeometry } from 'three';
import { Role, type RoleId, Sex, type SexId } from '../../model/types.ts';
import { MeshBuilder, type Rgb, type V3 } from './meshBuilder.ts';
import { PALETTE as P, rgb } from './palette.ts';

/** Rig part ids stored per vertex (`aRig.w`); the shader swings each part about its pivot (`aRig.xyz`). */
export const VillagerPart = {
  Torso: 0,
  Head: 1,
  ArmL: 2,
  ArmR: 3,
  LegL: 4,
  LegR: 5,
  /** Work tool, shown only while working. */
  Tool: 6,
  /** Priest's staff, held except while praying. */
  Staff: 7,
} as const;

/**
 * Colour slots, stored as colour alpha = slot / 3: the shader fills skin, hair and tunic per villager
 * (variant) and leaves fixed colours alone.
 */
export const VillagerSlot = { Fixed: 0, Skin: 1, Hair: 2, Tunic: 3 } as const;

/**
 * Joint pivots in figure space (metres, +Y up, facing +Z, feet at y = 0): chunky proportions, about
 * 1.45 m tall with a big head, hands and boots. Shoulders sit a little wider on the men.
 */
export const VILLAGER_RIG = {
  hip: [0, 0.56, 0] as V3,
  neck: [0, 1.02, 0] as V3,
  hipL: [-0.11, 0.56, 0] as V3,
  hipR: [0.11, 0.56, 0] as V3,
  /** Where the tool is held; the shader scales it about here. */
  hand: [0.34, 0.52, 0.04] as V3,
} as const;
const SHOULDER_Y = 0.99;
const shoulderX = (sex: SexId) => (sex === Sex.Female ? 0.28 : 0.32);

/** Tunic tints the shader picks from by variant: natural dyes (madder, woad, moss, weld, tan, grey). */
export const VILLAGER_TUNICS: readonly Rgb[] = [
  rgb(0x8a3e30),
  rgb(0x4a6688),
  rgb(0x5f7a3f),
  rgb(0xa8843a),
  rgb(0x8a6a4e),
  rgb(0x76766c),
];
/** Hair colours (dark brown, brown, ginger, blonde) and skin tones the shader picks from by variant. */
export const VILLAGER_HAIR: readonly Rgb[] = [
  rgb(0x3b2a1c),
  rgb(0x6b4426),
  rgb(0xa8582a),
  rgb(0xd2ad62),
];
export const VILLAGER_SKIN: readonly Rgb[] = [rgb(0xecb99a), rgb(0xe0a382), rgb(0xa86f4c)];

const SKIN: Rgb = P.skin;
const TROUSERS: Rgb = P.trousers;
const BOOTS: Rgb = P.boots;
const HAIR: Rgb = P.hair;
const EYE: Rgb = P.tar;
/** White: the shader multiplies it by the villager's tunic tint. */
const TUNIC: Rgb = [1, 1, 1];

/** Roles that show a work tool (the shader hides it unless the villager is working). */
const hasTool = (role: RoleId) => role !== Role.Priest && role !== Role.Idler;

/**
 * One figure per role and sex, about 250 triangles each; every rigid part is tagged for the vertex
 * shader. Roles read from the silhouette (hat, apron, robe, tool), the sexes from the build, the
 * hair and the dress. These are stand-ins for the modelled kit: same rig, same part ids.
 */
export function buildVillagerGeometry(
  role: RoleId = Role.Idler,
  sex: SexId = Sex.Male,
): BufferGeometry {
  const b = new MeshBuilder(7 + role * 2 + sex, 0.04);
  const female = sex === Sex.Female;
  const { hip, neck, hipL, hipR } = VILLAGER_RIG;
  const sx0 = shoulderX(sex);
  const bodyW = female ? 0.44 : 0.5;
  const priest = role === Role.Priest;
  const hatted = role !== Role.Idler && !priest;
  const bearded = !female && (role === Role.Farmer || role === Role.Woodcutter || priest);

  for (const [part, joint, sx] of [
    [VillagerPart.LegL, hipL, -1],
    [VillagerPart.LegR, hipR, 1],
  ] as const) {
    b.tag(part, joint);
    b.beam([sx * 0.11, 0.56, 0], [sx * 0.11, 0.14, 0], 0.19, TROUSERS);
    b.box(sx * 0.11, 0, 0.05, 0.2, 0.14, 0.32, BOOTS);
  }

  b.tag(VillagerPart.Torso, hip, 1);
  b.box(0, 0.56, 0, bodyW, 0.5, 0.32, TUNIC);
  if (female && !priest) b.box(0, 0.22, 0, 0.5, 0.36, 0.38, TUNIC);
  b.tag(VillagerPart.Torso, hip);
  b.box(0, 0.55, 0, bodyW + 0.02, 0.06, 0.34, BOOTS);
  if (role === Role.Builder) b.box(0, 0.3, 0.17, 0.38, 0.5, 0.035, P.timberDark);
  if (role === Role.Fisherman) b.box(0, 0.34, 0.17, 0.4, 0.4, 0.035, P.ochre);
  if (priest) {
    b.box(0, 0.12, 0, 0.58, 0.46, 0.42, P.tunicCream);
    b.box(0, 0.8, -0.02, 0.62, 0.28, 0.4, P.slate);
  }

  b.tag(VillagerPart.Head, neck);
  b.box(0, 1.08, 0, 0.4, 0.38, 0.38, SKIN);
  b.box(0, 1.16, 0.2, 0.07, 0.08, 0.06, SKIN);
  b.box(-0.09, 1.28, 0.195, 0.06, 0.03, 0.02, EYE);
  b.box(0.09, 1.28, 0.195, 0.06, 0.03, 0.02, EYE);
  if (!hatted) b.box(0, 1.4, -0.01, 0.43, 0.1, 0.42, HAIR);
  if (female) {
    b.box(0, 0.98, -0.2, 0.4, 0.5, 0.1, HAIR);
    if (hatted) b.box(0, 1.34, -0.01, 0.43, 0.08, 0.42, HAIR);
  }
  if (bearded) b.box(0, 0.98, 0.17, 0.3, 0.22, 0.07, HAIR);
  if (priest) b.box(0, 1.1, -0.2, 0.44, 0.34, 0.1, P.slate);
  if (role === Role.Builder) b.box(0, 1.42, -0.01, 0.44, 0.09, 0.43, P.timber);
  if (role === Role.Farmer) {
    b.box(0, 1.44, 0, 0.64, 0.04, 0.64, P.thatch);
    b.box(0, 1.46, 0, 0.36, 0.14, 0.36, P.thatch);
  }
  if (role === Role.Woodcutter) {
    b.box(0, 1.4, -0.03, 0.46, 0.14, 0.46, P.timberDark);
    b.box(0, 1.1, -0.2, 0.42, 0.34, 0.06, P.timberDark);
  }
  if (role === Role.Fisherman) {
    b.box(0, 1.42, 0, 0.44, 0.1, 0.44, P.tunicBlue);
    b.box(0, 1.41, 0.2, 0.4, 0.03, 0.14, P.tunicBlue);
  }

  for (const [part, sx] of [
    [VillagerPart.ArmL, -1],
    [VillagerPart.ArmR, 1],
  ] as const) {
    const shoulder: V3 = [sx * sx0, SHOULDER_Y, 0];
    b.tag(part, shoulder, 1);
    b.beam(shoulder, [sx * (sx0 + 0.02), 0.6, 0.02], 0.16, TUNIC);
    b.tag(part, shoulder);
    b.box(sx * (sx0 + 0.02), 0.44, 0.03, 0.15, 0.16, 0.15, SKIN);
  }

  if (priest) {
    b.tag(VillagerPart.Staff, [sx0, SHOULDER_Y, 0]);
    b.beam([sx0 + 0.02, 0.03, 0.05], [sx0 + 0.04, 1.7, 0.05], 0.05, P.timber);
  }

  if (hasTool(role)) {
    // The tool hangs from the right hand in the rest pose; the working poses swing it up and forward.
    const hx = sx0 + 0.02;
    b.tag(VillagerPart.Tool, [sx0, SHOULDER_Y, 0]);
    if (role === Role.Builder) {
      b.beam([hx, 0.55, 0.07], [hx, 0.12, 0.07], 0.05, P.timber);
      b.box(hx, 0.06, 0.07, 0.1, 0.12, 0.2, P.stoneDark);
    } else if (role === Role.Farmer) {
      b.beam([hx, 0.6, 0.06], [hx, -0.35, 0.06], 0.05, P.timber);
      b.box(hx, -0.45, 0.06, 0.24, 0.1, 0.05, P.stoneDark);
    } else if (role === Role.Woodcutter) {
      b.beam([hx, 0.55, 0.07], [hx, -0.05, 0.07], 0.05, P.timber);
      b.box(hx, -0.14, 0.14, 0.05, 0.2, 0.22, P.stoneDark);
    } else {
      b.beam([hx, 0.52, 0.06], [hx, -0.2, 1.2], 0.035, P.timberLight);
    }
  }
  return b.build();
}
