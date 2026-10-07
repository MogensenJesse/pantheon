// src/world/village/render/dressingRenderer.ts — crops that grow with their field, fences, and site stockpiles
import type { DirectionalLight } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { VILLAGE } from '../../../config/village';
import { CROP_KEYS, FENCE_KEY, STOCKPILE_KEY } from '../model/assetKeys';
import type { Field } from '../model/types';
import { hash01, localToWorld } from '../sim/geometry';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';
import { composeYawMatrix } from './matrixUtil';
import { createVillageMaterialPool } from './villageMaterials';

export interface DressingRenderer {
  readonly batches: readonly DynamicPropBatch[];
  addField: (field: Field) => void;
  /** Scale a field's crops to its growth; ignores small changes. */
  setGrowth: (field: Field) => void;
  addStockpile: (id: number, x: number, z: number, rotY: number) => void;
  removeStockpile: (id: number) => void;
  dispose: () => void;
}

interface Crop {
  handle: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface PlantedField {
  batch: DynamicPropBatch;
  crops: Crop[];
  shownGrowth: number;
}

/** Growth change worth re-uploading the field's matrices for. */
const GROWTH_STEP = 0.04;
const FENCE_OFFSET_M = 0.35;

const cropScale = (growth: number) => 0.15 + 0.85 * growth;

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
  const cropBatches = CROP_KEYS.map((key) => batch(key, VILLAGE.CAPACITY.CROP));
  const fenceBatch = batch(FENCE_KEY, VILLAGE.CAPACITY.FENCE);
  const stockpileBatch = batch(STOCKPILE_KEY, VILLAGE.CAPACITY.STOCKPILE);
  const planted = new Map<number, PlantedField>();
  const stockpiles = new Map<number, number>();

  const plantCrops = (f: Field): PlantedField => {
    const target = cropBatches[f.crop]!;
    const spacing = VILLAGE.FIELDS.CROP_SPACING_M;
    const cols = Math.max(1, Math.floor((2 * f.halfW) / spacing));
    const rows = Math.max(1, Math.floor((2 * f.halfD) / spacing));
    const crops: Crop[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = hash01(f.id * 131 + r * 17 + c);
        const lx = -f.halfW + ((c + 0.5 + (h - 0.5) * 0.3) * 2 * f.halfW) / cols;
        const lz = -f.halfD + ((r + 0.5 + (hash01(h * 99) - 0.5) * 0.3) * 2 * f.halfD) / rows;
        const [x, z] = localToWorld(f, lx, lz);
        const y = getY(x, z);
        const yaw = h * Math.PI * 2;
        const handle = target.add(x, z, composeYawMatrix(x, y, z, yaw, cropScale(f.growth)));
        if (handle) crops.push({ handle, x, y, z, yaw });
      }
    }
    return { batch: target, crops, shownGrowth: f.growth };
  };

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
        fenceBatch.add(x, z, composeYawMatrix(x, getY(x, z) - 0.1, z, yaw, 1));
      }
    }
  };

  return {
    batches: [...cropBatches, fenceBatch, stockpileBatch],
    addField: (field) => {
      if (planted.has(field.id)) return;
      planted.set(field.id, plantCrops(field));
      fenceField(field);
    },
    setGrowth: (field) => {
      const entry = planted.get(field.id);
      if (!entry || Math.abs(field.growth - entry.shownGrowth) < GROWTH_STEP) return;
      entry.shownGrowth = field.growth;
      const scale = cropScale(field.growth);
      for (const crop of entry.crops) {
        entry.batch.set(
          crop.handle,
          crop.x,
          crop.z,
          composeYawMatrix(crop.x, crop.y, crop.z, crop.yaw, scale),
        );
      }
    },
    addStockpile: (id, x, z, rotY) => {
      if (stockpiles.has(id)) return;
      const handle = stockpileBatch.add(x, z, composeYawMatrix(x, getY(x, z), z, rotY, 1));
      if (handle) stockpiles.set(id, handle);
    },
    removeStockpile: (id) => {
      const handle = stockpiles.get(id);
      if (handle === undefined) return;
      stockpileBatch.remove(handle);
      stockpiles.delete(id);
    },
    dispose: () => {
      for (const b of [...cropBatches, fenceBatch, stockpileBatch]) {
        for (const mesh of b.meshes) mesh.geometry.dispose();
      }
      materials.dispose();
      planted.clear();
      stockpiles.clear();
    },
  };
}
