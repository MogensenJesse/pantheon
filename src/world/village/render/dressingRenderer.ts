// src/world/village/render/dressingRenderer.ts — field fences and site stockpiles (the wheat is grass, see wheatFields.ts)
import type { DirectionalLight } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { VILLAGE } from '../../../config/village';
import { VISUAL } from '../../../config/visualTuning';
import { FENCE_KEY, GRAVE_KEY, STOCKPILE_KEY, STUMP_KEY } from '../model/assetKeys';
import type { Field, Grave } from '../model/types';
import { localToWorld } from '../sim/geometry';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';
import { composeYawMatrix } from './matrixUtil';
import { createVillageMaterialPool } from './villageMaterials';

export interface DressingRenderer {
  readonly batches: readonly DynamicPropBatch[];
  addField: (field: Field) => void;
  addStockpile: (id: number, x: number, z: number, rotY: number) => void;
  removeStockpile: (id: number) => void;
  addGrave: (grave: Grave) => void;
  /** A stump where tree `id` stood, as big as the tree's scale. */
  addStump: (id: number, x: number, z: number, yaw: number, scale: number) => void;
  removeStump: (id: number) => void;
  /** The hand's sheaf (a stand-in pile): drawn where the hand holds it, and gone when it is let go. */
  holdSheaf: () => void;
  poseSheaf: (pose: { x: number; y: number; z: number; yaw: number; scale: number }) => void;
  releaseSheaf: () => void;
  /** Re-seat pieces inside a world rectangle after the ground under them was levelled. */
  resnap: (minX: number, maxX: number, minZ: number, maxZ: number) => void;
  dispose: () => void;
}

/** A fence segment, stockpile, grave or stump: placed once on the ground, so it keeps what it needs to be re-seated. */
interface Piece {
  batch: DynamicPropBatch;
  handle: number;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** Metres added to the ground height where it stands (a fence or grave is sunk a little). */
  lift: number;
}

const LOOK = VISUAL.village;
const FENCE_OFFSET_M = 0.35;

export function createDressingRenderer(
  sun: DirectionalLight,
  assets: Map<string, PropLodAsset>,
  getY: (x: number, z: number) => number,
): DressingRenderer {
  const materials = createVillageMaterialPool(sun);
  const batch = (key: string, capacity: number) => {
    const asset = assets.get(key);
    if (!asset) throw new Error(`Missing village asset: ${key}`);
    return createDynamicPropBatch({
      sun,
      key,
      asset,
      capacity,
      castsShadow: false,
      resolveMaterials: materials.resolve,
    });
  };
  const fenceBatch = batch(FENCE_KEY, LOOK.CAPACITY.FENCE);
  const stockpileBatch = batch(STOCKPILE_KEY, LOOK.CAPACITY.STOCKPILE);
  const graveBatch = batch(GRAVE_KEY, LOOK.CAPACITY.GRAVE);
  const graves: Piece[] = [];
  const stumpBatch = batch(STUMP_KEY, LOOK.CAPACITY.STUMP);
  const stumps = new Map<number, Piece>();
  const matrixOf = (p: Piece) =>
    composeYawMatrix(p.x, getY(p.x, p.z) + p.lift, p.z, p.yaw, p.scale);
  /** Puts a piece on the ground in `batch`; null when the batch is full. */
  const place = (
    batch: DynamicPropBatch,
    x: number,
    z: number,
    yaw: number,
    lift = 0,
    scale = 1,
  ): Piece | null => {
    const piece: Piece = { batch, handle: 0, x, z, yaw, scale, lift };
    piece.handle = batch.add(x, z, matrixOf(piece));
    return piece.handle ? piece : null;
  };
  let sheafHandle = 0;
  let sheafHeld = false;
  const fenced = new Set<number>();
  const stockpiles = new Map<number, Piece>();
  const fences: Piece[] = [];

  /** Two-metre fence segments just outside the plot; the edges along local Z turn a quarter. */
  const fenceField = (f: Field) => {
    const seg = VILLAGE.FIELDS.FENCE_SEGMENT_M;
    const edges: [number, number, number, number, number][] = [
      [0, f.halfD + FENCE_OFFSET_M, 2 * f.halfW, 1, 0],
      [0, -f.halfD - FENCE_OFFSET_M, 2 * f.halfW, 1, 0],
      [f.halfW + FENCE_OFFSET_M, 0, 2 * f.halfD, 0, 1],
      [-f.halfW - FENCE_OFFSET_M, 0, 2 * f.halfD, 0, 1],
    ];
    for (const [cx, cz, length, ax, az] of edges) {
      const count = Math.max(1, Math.round(length / seg));
      for (let k = 0; k < count; k++) {
        const along = -length / 2 + ((k + 0.5) * length) / count;
        const [x, z] = localToWorld(f, cx + ax * along, cz + az * along);
        const yaw = az === 1 ? f.rotY - Math.PI / 2 : f.rotY;
        const piece = place(fenceBatch, x, z, yaw, -0.1);
        if (piece) fences.push(piece);
      }
    }
  };

  return {
    batches: [fenceBatch, stockpileBatch, graveBatch, stumpBatch],
    addField: (field) => {
      if (fenced.has(field.id)) return;
      fenced.add(field.id);
      fenceField(field);
    },
    addStockpile: (id, x, z, rotY) => {
      if (stockpiles.has(id)) return;
      const piece = place(stockpileBatch, x, z, rotY);
      if (piece) stockpiles.set(id, piece);
    },
    addGrave: (grave) => {
      const piece = place(graveBatch, grave.x, grave.z, grave.yaw, -0.05);
      if (piece) graves.push(piece);
    },
    addStump: (id, x, z, yaw, scale) => {
      if (stumps.has(id)) return;
      const piece = place(stumpBatch, x, z, yaw, -0.05, scale);
      if (piece) stumps.set(id, piece);
    },
    removeStump: (id) => {
      const piece = stumps.get(id);
      if (!piece) return;
      stumpBatch.remove(piece.handle);
      stumps.delete(id);
    },
    holdSheaf: () => {
      sheafHeld = true;
    },
    poseSheaf: (pose) => {
      if (!sheafHeld) return;
      // The pile lies along local X: turn it to lie along the way the orb is going.
      const m = composeYawMatrix(pose.x, pose.y, pose.z, pose.yaw - Math.PI / 2, pose.scale);
      if (sheafHandle) stockpileBatch.set(sheafHandle, pose.x, pose.z, m);
      else sheafHandle = stockpileBatch.add(pose.x, pose.z, m);
    },
    releaseSheaf: () => {
      sheafHeld = false;
      if (sheafHandle) stockpileBatch.remove(sheafHandle);
      sheafHandle = 0;
    },
    removeStockpile: (id) => {
      const piece = stockpiles.get(id);
      if (piece === undefined) return;
      stockpileBatch.remove(piece.handle);
      stockpiles.delete(id);
    },
    resnap: (minX, maxX, minZ, maxZ) => {
      const inside = (x: number, z: number) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
      const pieces = [fences, graves, stumps.values(), stockpiles.values()];
      for (const group of pieces) {
        for (const p of group) if (inside(p.x, p.z)) p.batch.set(p.handle, p.x, p.z, matrixOf(p));
      }
    },
    dispose: () => {
      for (const b of [fenceBatch, stockpileBatch, graveBatch, stumpBatch]) b.dispose();
      materials.dispose();
      fenced.clear();
      stockpiles.clear();
      graves.length = 0;
      stumps.clear();
      fences.length = 0;
      sheafHandle = 0;
      sheafHeld = false;
    },
  };
}
