// src/world/village/render/buildingRenderer.ts — places stage meshes and plinths for village buildings, with rise-in
import type { DirectionalLight, Matrix4 } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { VILLAGE } from '../../../config/village';
import { VISUAL } from '../../../config/visualTuning';
import {
  BUILDING_TYPES,
  buildingStages,
  PLINTH_KEY,
  stageKey,
  type VillageBuildingType,
  type VillageStage,
} from '../model/assetKeys';
import type { Building } from '../model/types';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';
import { composeYawMatrix } from './matrixUtil';
import { createVillageMaterialPool } from './villageMaterials';

export interface BuildingRenderer {
  readonly batches: readonly DynamicPropBatch[];
  /** Model floor offset of a type's finished mesh (0 for kit meshes with the pivot on the floor). */
  floorYOf: (type: VillageBuildingType) => number;
  /** Show a building; `animate` raises its plinth and mesh from the ground. */
  add: (building: Building, animate: boolean) => void;
  /** Swap to the next stage mesh, which rises while the old one is removed part-way. */
  setStage: (id: number, stage: VillageStage) => void;
  remove: (id: number) => void;
  /** Advance rise-in animations (frame delta, s). */
  update: (dt: number) => void;
  dispose: () => void;
}

type Part = 'stage' | 'plinth';

interface Placed {
  building: Building;
  /** Stage mesh on screen; the sim may already have moved `building.stage` on. */
  stage: VillageStage;
  stageHandle: number;
  plinthHandle: number;
}

interface Rise {
  id: number;
  part: Part;
  t: number;
  /** Previous stage mesh, removed once the new one has risen part-way. */
  old?: { batch: DynamicPropBatch; handle: number };
}

function capacityFor(key: string): number {
  if (key === PLINTH_KEY) return LOOK.CAPACITY.PLINTH;
  if (key.startsWith('village_temple')) return LOOK.CAPACITY.TEMPLE;
  if (key.startsWith('village_well')) return LOOK.CAPACITY.WELL;
  return LOOK.CAPACITY.BUILDING;
}

const LOOK = VISUAL.village;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** Height scale at rise progress t: from RISE_FROM up to full size (stages overshoot slightly). */
function riseScale(part: Part, t: number): number {
  const from = LOOK.CONSTRUCTION.RISE_FROM;
  const eased = part === 'stage' ? easeOutBack(Math.min(1, t)) : easeOutCubic(Math.min(1, t));
  return from + (1 - from) * eased;
}

export function createBuildingRenderer(
  sun: DirectionalLight,
  assets: Map<string, PropLodAsset>,
  onChange: () => void,
): BuildingRenderer {
  const materials = createVillageMaterialPool(sun);
  const batchByKey = new Map<string, DynamicPropBatch>();
  const placed = new Map<number, Placed>();
  let rises: Rise[] = [];

  const batchFor = (key: string): DynamicPropBatch => {
    let batch = batchByKey.get(key);
    if (!batch) {
      const asset = assets.get(key);
      if (!asset) throw new Error(`Missing village asset: ${key}`);
      batch = createDynamicPropBatch({
        sun,
        key,
        asset,
        capacity: capacityFor(key),
        castsShadow: true,
        resolveMaterials: materials.resolve,
      });
      batchByKey.set(key, batch);
    }
    return batch;
  };

  // Build every batch up front so no shader or buffer work happens mid-game.
  batchFor(PLINTH_KEY);
  for (const type of BUILDING_TYPES) {
    for (const stage of buildingStages(type)) batchFor(stageKey(type, stage));
  }

  const stageBatch = (b: Building, stage: VillageStage) => batchFor(stageKey(b.type, stage));

  /** World matrix of a stage mesh or the plinth, with its height scaled by `k`. */
  const composeMatrix = (b: Building, stage: VillageStage, part: Part, k: number): Matrix4 => {
    if (part === 'stage') {
      const y = b.plinthTopY - stageBatch(b, stage).footY;
      return composeYawMatrix(b.x, y, b.z, b.rotY, 1, k, 1);
    }
    const pad = VILLAGE.PLINTH.PAD_M;
    const height = k * (b.plinthTopY - b.plinthBaseY);
    return composeYawMatrix(
      b.x,
      b.plinthBaseY,
      b.z,
      b.rotY,
      2 * (b.halfW + pad),
      height,
      2 * (b.halfD + pad),
    );
  };

  const batchOf = (entry: Placed, part: Part) =>
    part === 'stage' ? stageBatch(entry.building, entry.stage) : batchFor(PLINTH_KEY);

  const handleOf = (entry: Placed, part: Part) =>
    part === 'stage' ? entry.stageHandle : entry.plinthHandle;

  const place = (entry: Placed, part: Part, k: number): number => {
    const b = entry.building;
    return batchOf(entry, part).add(b.x, b.z, composeMatrix(b, entry.stage, part, k));
  };

  /** Jump a running rise to its end state and drop the old mesh it was replacing. */
  const finishRise = (rise: Rise) => {
    const entry = placed.get(rise.id);
    if (entry) {
      const b = entry.building;
      batchOf(entry, rise.part).set(
        handleOf(entry, rise.part),
        b.x,
        b.z,
        composeMatrix(b, entry.stage, rise.part, 1),
      );
    }
    rise.old?.batch.remove(rise.old.handle);
    rise.old = undefined;
    onChange();
  };

  return {
    batches: [...batchByKey.values()],
    floorYOf: (type) => batchFor(stageKey(type, 2)).footY,
    add: (building, animate) => {
      const k = animate ? LOOK.CONSTRUCTION.RISE_FROM : 1;
      const entry: Placed = { building, stage: building.stage, stageHandle: 0, plinthHandle: 0 };
      entry.stageHandle = place(entry, 'stage', k);
      entry.plinthHandle = place(entry, 'plinth', k);
      placed.set(building.id, entry);
      if (animate) {
        rises.push(
          { id: building.id, part: 'stage', t: 0 },
          { id: building.id, part: 'plinth', t: 0 },
        );
      }
      onChange();
    },
    setStage: (id, stage) => {
      const entry = placed.get(id);
      if (!entry) return;
      for (const rise of rises.filter((r) => r.id === id && r.part === 'stage')) finishRise(rise);
      rises = rises.filter((r) => !(r.id === id && r.part === 'stage'));
      const old = { batch: stageBatch(entry.building, entry.stage), handle: entry.stageHandle };
      entry.stage = stage;
      entry.stageHandle = place(entry, 'stage', LOOK.CONSTRUCTION.RISE_FROM);
      rises.push({ id, part: 'stage', t: 0, old });
      onChange();
    },
    remove: (id) => {
      const entry = placed.get(id);
      if (!entry) return;
      for (const rise of rises.filter((r) => r.id === id)) {
        rise.old?.batch.remove(rise.old.handle);
      }
      rises = rises.filter((r) => r.id !== id);
      stageBatch(entry.building, entry.stage).remove(entry.stageHandle);
      batchFor(PLINTH_KEY).remove(entry.plinthHandle);
      placed.delete(id);
      onChange();
    },
    update: (dt) => {
      if (rises.length === 0) return;
      const { RISE_S, SWAP_AT } = LOOK.CONSTRUCTION;
      const live: Rise[] = [];
      for (const rise of rises) {
        const entry = placed.get(rise.id);
        if (!entry) continue;
        rise.t += dt / RISE_S;
        if (rise.t >= 1) {
          finishRise(rise);
          continue;
        }
        if (rise.old && rise.t >= SWAP_AT) {
          rise.old.batch.remove(rise.old.handle);
          rise.old = undefined;
        }
        const b = entry.building;
        batchOf(entry, rise.part).set(
          handleOf(entry, rise.part),
          b.x,
          b.z,
          composeMatrix(b, entry.stage, rise.part, riseScale(rise.part, rise.t)),
        );
        live.push(rise);
      }
      rises = live;
    },
    dispose: () => {
      for (const batch of batchByKey.values()) {
        for (const mesh of batch.meshes) mesh.geometry.dispose();
      }
      materials.dispose();
      batchByKey.clear();
      placed.clear();
      rises = [];
    },
  };
}
