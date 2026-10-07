// src/world/village/assets/placeholder/buildingKit.ts — house, workshop and granary placeholder geometry
import type { BufferGeometry } from 'three';
import type { VillageAssetMeta, VillageStage } from '../../model/assetKeys.ts';
import { type Detail, type LodGeometries, lodsOf, windowGlowQuad } from './kitUtil.ts';
import { MeshBuilder, type Rgb, seedFromString } from './meshBuilder.ts';
import { PALETTE as P } from './palette.ts';

export type HouseType = 'house_a' | 'house_b' | 'house_c' | 'workshop' | 'granary';

interface HouseSpec {
  /** Footprint inside the walls (m). */
  w: number;
  d: number;
  wallH: number;
  rise: number;
  overhang: number;
  wall: Rgb;
  roof: Rgb;
  doorX: number;
  frontWindowsX: readonly number[];
  sideWindows: boolean;
  chimney: boolean;
  /** Floor height above the ground (m): the granary stands on stone feet. */
  floorY: number;
  openFront: boolean;
}

const HOUSE_SPECS: Record<HouseType, HouseSpec> = {
  house_a: {
    w: 5,
    d: 4,
    wallH: 2.3,
    rise: 1.5,
    overhang: 0.45,
    wall: P.faluRed,
    roof: P.turf,
    doorX: -1.1,
    frontWindowsX: [0.9],
    sideWindows: true,
    chimney: true,
    floorY: 0,
    openFront: false,
  },
  house_b: {
    w: 6,
    d: 4.5,
    wallH: 2.4,
    rise: 1.7,
    overhang: 0.5,
    wall: P.ochre,
    roof: P.thatch,
    doorX: 0,
    frontWindowsX: [-1.9, 1.9],
    sideWindows: true,
    chimney: true,
    floorY: 0,
    openFront: false,
  },
  house_c: {
    w: 7,
    d: 5,
    wallH: 2.6,
    rise: 2,
    overhang: 0.55,
    wall: P.greyWood,
    roof: P.slate,
    doorX: -1.5,
    frontWindowsX: [0.8, 2.4],
    sideWindows: true,
    chimney: true,
    floorY: 0,
    openFront: false,
  },
  workshop: {
    w: 6,
    d: 5,
    wallH: 2.4,
    rise: 1.4,
    overhang: 0.7,
    wall: P.timber,
    roof: P.shingle,
    doorX: 0,
    frontWindowsX: [],
    sideWindows: true,
    chimney: true,
    floorY: 0,
    openFront: true,
  },
  granary: {
    w: 3.2,
    d: 3.2,
    wallH: 2.2,
    rise: 1.2,
    overhang: 0.5,
    wall: P.timber,
    roof: P.turf,
    doorX: 0,
    frontWindowsX: [],
    sideWindows: false,
    chimney: false,
    floorY: 0.9,
    openFront: false,
  },
};

export const HOUSE_TYPES = Object.keys(HOUSE_SPECS) as HouseType[];

const SILL_H = 0.3;
const WINDOW_W = 0.6;
const WINDOW_H = 0.62;
const WINDOW_BOTTOM = 1.1;
const DOOR_W = 0.95;
const DOOR_H = 1.9;

interface WindowSlot {
  yaw: number;
  /** Distance from the centre to the wall plane along the slot normal. */
  half: number;
  along: number;
}

function windowSlots(s: HouseSpec): WindowSlot[] {
  const slots: WindowSlot[] = s.frontWindowsX.map((along) => ({ yaw: 0, half: s.d / 2, along }));
  if (s.sideWindows) {
    slots.push({ yaw: Math.PI / 2, half: s.w / 2, along: 0 });
    slots.push({ yaw: -Math.PI / 2, half: s.w / 2, along: 0 });
  }
  if (!s.openFront) slots.push({ yaw: Math.PI, half: s.d / 2, along: 0 });
  return slots;
}

function chimneyTop(s: HouseSpec): readonly [number, number, number] | undefined {
  if (!s.chimney) return undefined;
  const x = s.w * 0.28;
  const z = -s.d * 0.12;
  const roofY = s.floorY + s.wallH + s.rise * (1 - Math.abs(z) / (s.d / 2));
  return [x, roofY + 1.1, z];
}

function feet(b: MeshBuilder, s: HouseSpec, detail: Detail): void {
  if (detail === 2) {
    b.box(0, 0, 0, s.w - 0.4, s.floorY, s.d - 0.4, P.stoneDark);
    return;
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(
        sx * (s.w / 2 - 0.3),
        0,
        sz * (s.d / 2 - 0.3),
        0.5,
        s.floorY,
        0.5,
        P.stoneDark,
        P.stone,
      );
    }
  }
}

function drawWindows(b: MeshBuilder, s: HouseSpec, detail: Detail): void {
  const y = s.floorY + WINDOW_BOTTOM;
  for (const slot of windowSlots(s)) {
    b.within(0, 0, 0, slot.yaw, () => {
      if (detail === 0) {
        b.box(slot.along, y - 0.08, slot.half, WINDOW_W + 0.16, WINDOW_H + 0.16, 0.08, P.trim);
      }
      b.box(slot.along, y, slot.half, WINDOW_W, WINDOW_H, 0.1, P.window);
    });
  }
}

function wallBase(s: HouseSpec): number {
  return s.floorY > 0 ? s.floorY : SILL_H;
}

function buildFinished(s: HouseSpec, detail: Detail, seed: number): MeshBuilder {
  const b = new MeshBuilder(seed);
  const base = wallBase(s);
  const top = s.floorY + s.wallH;

  if (s.floorY > 0) feet(b, s, detail);
  else b.box(0, 0, 0, s.w + 0.12, SILL_H, s.d + 0.12, P.stone, P.stoneLight);

  if (s.openFront && detail === 2) {
    b.box(0, base, 0, s.w, top - base, s.d, s.wall);
  } else if (s.openFront) {
    b.box(0, base, -s.d / 2 + 0.1, s.w, top - base, 0.2, s.wall);
    for (const sx of [-1, 1]) {
      b.box(sx * (s.w / 2 - 0.1), base, 0, 0.2, top - base, s.d - 0.4, s.wall);
      const px = sx * (s.w / 2 - 0.15);
      b.beam([px, base, s.d / 2 - 0.15], [px, top, s.d / 2 - 0.15], 0.26, P.timberDark);
    }
  } else {
    b.box(0, base, 0, s.w, top - base, s.d, s.wall);
    if (detail < 2) b.box(s.doorX, base, s.d / 2, DOOR_W, DOOR_H, 0.1, P.door);
    if (detail === 0) {
      b.box(s.doorX, base, s.d / 2 - 0.005, DOOR_W + 0.25, DOOR_H + 0.2, 0.08, P.trim);
      b.box(s.doorX, 0, s.d / 2 + 0.3, 1.3, base, 0.5, P.stoneLight);
    }
  }

  if (detail < 2) drawWindows(b, s, detail);
  b.gableRoof(0, top, 0, s.w, s.d, s.rise, s.overhang, s.roof);

  if (detail === 0) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = (sx * s.w) / 2;
        const cz = (sz * s.d) / 2;
        b.beam([cx, base, cz], [cx, top, cz], 0.2, P.timberDark);
      }
    }
    const ridge = s.w / 2 + s.overhang;
    b.beam([-ridge, top + s.rise + 0.04, 0], [ridge, top + s.rise + 0.04, 0], 0.16, P.timberDark);
  }

  const chimney = chimneyTop(s);
  if (chimney && detail < 2) {
    const baseY = top + s.rise * 0.3;
    b.box(chimney[0], baseY, chimney[2], 0.6, chimney[1] - baseY, 0.6, P.stoneDark, P.stone);
  }
  return b;
}

function buildFrame(s: HouseSpec, detail: Detail, seed: number): MeshBuilder {
  const b = new MeshBuilder(seed);
  const base = wallBase(s);
  const top = s.floorY + s.wallH;
  const ridgeHalf = s.w / 2 + s.overhang;

  if (s.floorY > 0) {
    feet(b, s, detail);
    b.box(0, s.floorY - 0.15, 0, s.w, 0.15, s.d, P.timber);
  } else {
    b.box(0, 0, 0, s.w + 0.12, SILL_H, s.d + 0.12, P.stone, P.stoneLight);
  }

  const post = (x: number, z: number) => b.beam([x, base, z], [x, top, z], 0.22, P.timber);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) post((sx * s.w) / 2, (sz * s.d) / 2);
  }
  if (detail === 2) {
    b.beam([-ridgeHalf, top + s.rise, 0], [ridgeHalf, top + s.rise, 0], 0.2, P.timberLight);
    return b;
  }

  const spans = Math.max(1, Math.round(s.w / 1.7));
  for (let i = 1; i < spans; i++) {
    const x = -s.w / 2 + (s.w * i) / spans;
    post(x, -s.d / 2);
    if (!s.openFront) post(x, s.d / 2);
  }
  const plateY = top - 0.1;
  for (const sx of [-1, 1]) {
    const px = (sx * s.w) / 2;
    b.beam([px, plateY, -s.d / 2], [px, plateY, s.d / 2], 0.2, P.timberLight);
  }
  for (const sz of [-1, 1]) {
    const pz = (sz * s.d) / 2;
    b.beam([-s.w / 2, plateY, pz], [s.w / 2, plateY, pz], 0.2, P.timberLight);
  }
  b.box(0, base, -s.d / 2 + 0.05, s.w, top - base, 0.1, s.wall);

  const rafters = detail === 0 ? Math.max(3, Math.round(s.w / 1.2) + 1) : 3;
  for (let i = 0; i < rafters; i++) {
    const x = -s.w / 2 + (s.w * i) / (rafters - 1);
    b.beam([x, top, s.d / 2], [x, top + s.rise, 0], 0.14, P.timberLight);
    b.beam([x, top, -s.d / 2], [x, top + s.rise, 0], 0.14, P.timberLight);
  }
  b.beam([-ridgeHalf, top + s.rise, 0], [ridgeHalf, top + s.rise, 0], 0.2, P.timberLight);
  return b;
}

function buildFoundation(s: HouseSpec, detail: Detail, seed: number): MeshBuilder {
  const b = new MeshBuilder(seed);
  if (detail === 2) {
    b.box(0, 0, 0, s.w + 0.4, 0.3, s.d + 0.4, P.stone, P.stoneLight);
    return b;
  }
  const hw = s.w / 2 + 0.15;
  const hd = s.d / 2 + 0.15;
  const footing = (x: number, z: number, sx: number, sz: number) =>
    b.box(x, 0, z, sx, 0.25, sz, P.stoneDark, P.stone);
  footing(0, -hd, s.w + 0.6, 0.35);
  footing(0, hd, s.w + 0.6, 0.35);
  footing(-hw, 0, 0.35, s.d + 0.6);
  footing(hw, 0, 0.35, s.d + 0.6);
  const sill = (x: number, z: number, sx: number, sz: number) =>
    b.box(x, 0.25, z, sx, 0.2, sz, P.timber);
  sill(0, -hd, s.w + 0.4, 0.28);
  sill(0, hd, s.w + 0.4, 0.28);
  sill(-hw, 0, 0.28, s.d + 0.4);
  sill(hw, 0, 0.28, s.d + 0.4);
  if (s.floorY > 0) feet(b, s, detail);
  return b;
}

function glowGeometry(s: HouseSpec, seed: number): BufferGeometry {
  const b = new MeshBuilder(seed, 0);
  const y = s.floorY + WINDOW_BOTTOM;
  for (const slot of windowSlots(s)) {
    b.within(0, 0, 0, slot.yaw, () =>
      windowGlowQuad(b, slot.along, y, WINDOW_W, WINDOW_H, slot.half),
    );
  }
  return b.build();
}

export interface HouseKit {
  /** Indexed by stage 0, 1, 2. */
  stages: readonly [LodGeometries, LodGeometries, LodGeometries];
  /** Window glow quads; null for types without lit windows. */
  glow: BufferGeometry | null;
  meta: VillageAssetMeta;
}

export function buildHouseKit(type: HouseType): HouseKit {
  const s = HOUSE_SPECS[type];
  const stage = (st: VillageStage): LodGeometries => {
    const build = st === 0 ? buildFoundation : st === 1 ? buildFrame : buildFinished;
    return lodsOf((d) => build(s, d, seedFromString(`${type}:${st}:${d}`)).build());
  };
  const chimney = chimneyTop(s);
  /** Ridge beam top. */
  const roofPeak = s.floorY + s.wallH + s.rise + 0.12;
  const meta: VillageAssetMeta = {
    footprint: [s.w, s.d],
    height: chimney ? Math.max(chimney[1], roofPeak) : roofPeak,
    door: [s.openFront ? 0 : s.doorX, s.d / 2],
    chimney,
    workSlots: [
      [-s.w * 0.25, s.d / 2 + 1],
      [s.w * 0.25, s.d / 2 + 1],
      [0, -s.d / 2 - 1],
      [s.w / 2 + 1, 0],
    ],
  };
  const hasGlow = windowSlots(s).length > 0 && type !== 'granary';
  return {
    stages: [stage(0), stage(1), stage(2)],
    glow: hasGlow ? glowGeometry(s, seedFromString(`${type}:glow`)) : null,
    meta,
  };
}
