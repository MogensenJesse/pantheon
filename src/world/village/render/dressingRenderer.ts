// src/world/village/render/dressingRenderer.ts — field fences and site stockpiles (the wheat is grass, see wheatFields.ts)
import type { DirectionalLight } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { VILLAGE } from '../../../config/village';
import { VISUAL } from '../../../config/visualTuning';
import { FENCE_KEY, STOCKPILE_KEY } from '../model/assetKeys';
import type { Field } from '../model/types';
import { localToWorld } from '../sim/geometry';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';
import { composeYawMatrix } from './matrixUtil';
import { createVillageMaterialPool } from './villageMaterials';

export interface DressingRenderer {
  readonly batches: readonly DynamicPropBatch[];
  addField: (field: Field) => void;
  addStockpile: (id: number, x: number, z: number, rotY: number) => void;
  removeStockpile: (id: number) => void;
  /** Re-seat pieces inside a world rectangle after the ground under them was levelled. */
  resnap: (minX: number, maxX: number, minZ: number, maxZ: number) => void;
  dispose: () => void;
}

/** A fence segment or stockpile: placed once on the ground, so it keeps what it needs to be re-seated. */
interface Piece {
  handle: number;
  x: number;
  z: number;
  yaw: number;
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
        const handle = fenceBatch.add(x, z, composeYawMatrix(x, getY(x, z) - 0.1, z, yaw, 1));
        if (handle) fences.push({ handle, x, z, yaw });
      }
    }
  };

  return {
    batches: [fenceBatch, stockpileBatch],
    addField: (field) => {
      if (fenced.has(field.id)) return;
      fenced.add(field.id);
      fenceField(field);
    },
    addStockpile: (id, x, z, rotY) => {
      if (stockpiles.has(id)) return;
      const handle = stockpileBatch.add(x, z, composeYawMatrix(x, getY(x, z), z, rotY, 1));
      if (handle) stockpiles.set(id, { handle, x, z, yaw: rotY });
    },
    removeStockpile: (id) => {
      const piece = stockpiles.get(id);
      if (piece === undefined) return;
      stockpileBatch.remove(piece.handle);
      stockpiles.delete(id);
    },
    resnap: (minX, maxX, minZ, maxZ) => {
      const inside = (x: number, z: number) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
      for (const f of fences) {
        if (inside(f.x, f.z)) {
          fenceBatch.set(
            f.handle,
            f.x,
            f.z,
            composeYawMatrix(f.x, getY(f.x, f.z) - 0.1, f.z, f.yaw, 1),
          );
        }
      }
      for (const p of stockpiles.values()) {
        if (inside(p.x, p.z)) {
          stockpileBatch.set(
            p.handle,
            p.x,
            p.z,
            composeYawMatrix(p.x, getY(p.x, p.z), p.z, p.yaw, 1),
          );
        }
      }
    },
    dispose: () => {
      for (const b of [fenceBatch, stockpileBatch]) {
        for (const mesh of b.meshes) mesh.geometry.dispose();
      }
      materials.dispose();
      fenced.clear();
      stockpiles.clear();
      fences.length = 0;
    },
  };
}
