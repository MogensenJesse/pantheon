// src/world/village/assets/placeholder/temple.ts — central temple (stave-church inspired) and well placeholders
import type { BufferGeometry } from 'three';
import type { VillageAssetMeta } from '../../model/assetKeys.ts';
import { type Detail, type LodGeometries, lodsOf, windowGlowQuad } from './kitUtil.ts';
import { MeshBuilder, seedFromString } from './meshBuilder.ts';
import { PALETTE as P } from './palette.ts';

/** Footprint 9 x 13 m: nave z in [-2, 6.5], chancel z in [-6.5, -2], door on +Z. */
const NAVE_W = 9;
const NAVE_D = 8.5;
const NAVE_Z = 2.25;
const NAVE_WALL = 3.6;
const NAVE_RISE = 2.4;
const CHANCEL_W = 5;
const CHANCEL_D = 4.5;
const CHANCEL_Z = -4.25;
const CHANCEL_WALL = 3;
const CHANCEL_RISE = 1.8;
const TOWER = 3.4;
const TOWER_Z = 1.75;
const TOWER_BASE = 4.6;
const TOWER_H = 3.4;
const TOWER_ROOF = 2.6;
const SPIRE_H = 1.6;
const BASE_H = 0.4;
const WIN_W = 0.7;
const WIN_H = 1.2;
const WIN_Y = 1.6;

interface TempleWindow {
  cz: number;
  yaw: number;
  half: number;
  along: number;
  y: number;
  w: number;
  h: number;
}

function templeWindows(): TempleWindow[] {
  const out: TempleWindow[] = [];
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
    for (const along of [-2.4, 0, 2.4]) {
      out.push({ cz: NAVE_Z, yaw, half: NAVE_W / 2, along, y: WIN_Y, w: WIN_W, h: WIN_H });
    }
    out.push({ cz: CHANCEL_Z, yaw, half: CHANCEL_W / 2, along: 0, y: WIN_Y, w: WIN_W, h: WIN_H });
  }
  for (const along of [-2.9, 2.9]) {
    out.push({ cz: 0, yaw: 0, half: NAVE_Z + NAVE_D / 2, along, y: WIN_Y, w: WIN_W, h: WIN_H });
  }
  return out;
}

function buildTemple(detail: Detail, seed: number): MeshBuilder {
  const b = new MeshBuilder(seed);
  const frontZ = NAVE_Z + NAVE_D / 2;
  b.box(0, 0, NAVE_Z, NAVE_W + 0.3, BASE_H, NAVE_D + 0.3, P.stone, P.stoneLight);
  const chancelBase = detail === 2 ? 0 : BASE_H;
  if (detail < 2) {
    b.box(0, 0, CHANCEL_Z, CHANCEL_W + 0.3, BASE_H, CHANCEL_D + 0.3, P.stone, P.stoneLight);
  }
  b.box(0, BASE_H, NAVE_Z, NAVE_W, NAVE_WALL - BASE_H, NAVE_D, P.tar);
  b.box(0, chancelBase, CHANCEL_Z, CHANCEL_W, CHANCEL_WALL - chancelBase, CHANCEL_D, P.tar);
  b.within(0, 0, NAVE_Z, Math.PI / 2, () =>
    b.gableRoof(0, NAVE_WALL, 0, NAVE_D, NAVE_W, NAVE_RISE, 0.8, P.shingle),
  );
  b.within(0, 0, CHANCEL_Z, Math.PI / 2, () =>
    b.gableRoof(0, CHANCEL_WALL, 0, CHANCEL_D, CHANCEL_W, CHANCEL_RISE, 0.6, P.shingle),
  );
  b.box(0, TOWER_BASE, TOWER_Z, TOWER, TOWER_H, TOWER, P.tar);
  const roofY = TOWER_BASE + TOWER_H;
  b.pyramid(0, roofY, TOWER_Z, TOWER + 0.6, TOWER + 0.6, TOWER_ROOF, P.shingle);
  b.cone(0, roofY + TOWER_ROOF, TOWER_Z, 0.22, SPIRE_H, detail === 0 ? 8 : 4, P.timberDark);
  if (detail < 2) {
    b.box(0, BASE_H, frontZ, 1.8, 2.6, 0.12, P.door);
    for (const w of templeWindows()) {
      b.within(0, 0, w.cz, w.yaw, () => b.box(w.along, w.y, w.half, w.w, w.h, 0.1, P.window));
    }
  }
  if (detail === 0) {
    b.box(0, BASE_H - 0.02, frontZ, 2.2, 2.9, 0.1, P.trim);
    b.box(0, 0, frontZ + 0.7, 3.2, BASE_H, 1.2, P.stoneLight);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = (sx * NAVE_W) / 2;
        const cz = NAVE_Z + (sz * NAVE_D) / 2;
        b.beam([cx, BASE_H, cz], [cx, NAVE_WALL, cz], 0.3, P.timberDark);
      }
    }
    const ridgeEnd = NAVE_D / 2 + 0.8;
    const ridgeY = NAVE_WALL + NAVE_RISE;
    for (const sz of [-1, 1]) {
      const z = NAVE_Z + sz * ridgeEnd;
      b.beam([0, ridgeY, z], [0, ridgeY + 0.9, z + sz * 0.5], 0.2, P.timberDark);
    }
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      b.within(0, 0, TOWER_Z, yaw, () => {
        b.box(0, TOWER_BASE + 1.4, TOWER / 2, 0.7, 1.1, 0.1, P.window);
      });
    }
  }
  return b;
}

function templeGlow(seed: number): BufferGeometry {
  const b = new MeshBuilder(seed, 0);
  for (const w of templeWindows()) {
    b.within(0, 0, w.cz, w.yaw, () => windowGlowQuad(b, w.along, w.y, w.w, w.h, w.half));
  }
  return b.build();
}

export interface TempleKit {
  geometries: LodGeometries;
  glow: BufferGeometry;
  meta: VillageAssetMeta;
}

export function buildTempleKit(): TempleKit {
  return {
    geometries: lodsOf((d) => buildTemple(d, seedFromString(`temple:${d}`)).build()),
    glow: templeGlow(seedFromString('temple:glow')),
    meta: {
      footprint: [NAVE_W, 13],
      height: TOWER_BASE + TOWER_H + TOWER_ROOF + SPIRE_H,
      door: [0, NAVE_Z + NAVE_D / 2],
      workSlots: [
        [-3, 7.5],
        [3, 7.5],
        [-5.5, 0],
        [5.5, 0],
      ],
    },
  };
}

function buildWell(detail: Detail, seed: number): MeshBuilder {
  const b = new MeshBuilder(seed);
  b.cylinder(0, 0, 0, 1, 0.9, 10, P.stone, P.stoneLight);
  if (detail < 2) b.cylinder(0, 0.9, 0, 0.7, 0.02, 10, P.window);
  for (const sx of [-1, 1]) b.beam([sx * 0.95, 0, 0], [sx * 0.95, 2.1, 0], 0.16, P.timberDark);
  if (detail === 0) b.beam([-0.95, 1.9, 0], [0.95, 1.9, 0], 0.1, P.timber);
  b.gableRoof(0, 2.1, 0, 2.2, 1.4, 0.55, 0.25, P.shingle);
  return b;
}

export function buildWellKit(): { geometries: LodGeometries; meta: VillageAssetMeta } {
  return {
    geometries: lodsOf((d) => buildWell(d, seedFromString(`well:${d}`)).build()),
    meta: {
      footprint: [2.2, 2.2],
      height: 2.65,
      door: [0, 1.1],
      workSlots: [
        [0, 1.6],
        [0, -1.6],
      ],
    },
  };
}
