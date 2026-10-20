// src/world/village/render/forestView.ts — what the forest sim shows (M6): a felled tree leaves its static
// group, falls as a temporary instance, and a stump stays; a sapling grows back as an instance and the
// tree returns to its group. The static groups are never edited beyond one placement's scale (zero hides
// a tree), so `updatePropLod` and `resnapMapProps` need no changes and a resnap keeps a felled tree hidden.

import type { DirectionalLight, InstancedMesh } from 'three';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { VILLAGE } from '../../../config/village';
import { enableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { propReflectsInWater } from '../../mapProps/config/propReflectionKeys';
import { propCastsShadow } from '../../mapProps/config/propShadowKeys';
import type { PropLodGroup } from '../../mapProps/mapPropLod';
import { resolvePropInstanceMatrix } from '../../mapProps/resolvePropInstanceMatrix';
import { createPropTerrainSurface } from '../../terrain/cpu/terrainSurfaceCpu';
import type { Forest, TreeInfo } from '../sim/forest';
import { TreeState } from '../sim/forest';
import type { DressingRenderer } from './dressingRenderer';
import { createDynamicPropBatch, type DynamicPropBatch } from './dynamicPropBatch';

const F = VILLAGE.FOREST;
/** Instances of one tree key that can be falling or growing at once. */
const BATCH_CAPACITY = 64;
/** Seconds between growth updates of the saplings. */
const GROW_STEP_S = 0.25;
/** The fall: the share of it spent falling (the rest is a small bounce), and how far it springs back (rad). */
const FALL_SHARE = 0.8;
const BOUNCE_RAD = 0.07;

export interface ForestViewOptions {
  sun: DirectionalLight;
  terrain: MapTerrainContext;
  forest: Forest;
  /** The map's trees, in the order the sim has them (the index is the tree's id). */
  trees: readonly TreeInfo[];
  /** The shared prop group list: temporary tree batches are added to it. */
  propGroups: PropLodGroup[];
  /** The assets of the tree keys (`ASSET_MANIFEST.trees`). */
  propAssets: ReadonlyMap<string, PropLodAsset>;
  dressing: DressingRenderer;
  /** Where the meshes of a new batch go (the village's scene root). */
  addMeshes: (meshes: InstancedMesh[]) => void;
  /** Shadows and anything else that has to notice the trees changed. */
  onChanged: () => void;
}

export interface ForestView {
  /** Show the forest as the sim has it (a new game, or a restored one) before the first frame. */
  showFounded: () => void;
  felled: (tree: number, dirX: number, dirZ: number) => void;
  stump: (tree: number) => void;
  sapling: (tree: number) => void;
  grown: (tree: number) => void;
  frame: (dt: number) => void;
  dispose: () => void;
}

interface Falling {
  handle: number;
  batch: DynamicPropBatch;
  /** The tree's placed matrix and the point on the ground it turns about. */
  base: Matrix4;
  pivot: Vector3;
  axis: Vector3;
  t: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _t1 = new Matrix4();
const _t2 = new Matrix4();

/** The angle of the fall at time `t` (s): speeding up to a horizontal tree, a small spring back, then still. */
export function fallAngle(t: number): number {
  const total = F.FALL_S;
  const u = Math.min(1, t / total);
  const half = Math.PI / 2;
  if (u < FALL_SHARE) {
    const k = u / FALL_SHARE;
    return half * k * k;
  }
  const k = (u - FALL_SHARE) / (1 - FALL_SHARE);
  return half - BOUNCE_RAD * Math.sin(k * Math.PI);
}

export function createForestView(options: ForestViewOptions): ForestView {
  const { sun, terrain, forest, trees, propGroups, propAssets, dressing } = options;
  const surface = createPropTerrainSurface(terrain);

  // Which static group and slot each tree is: the map put its props of one key in entity order.
  const groups = new Map<string, PropLodGroup>();
  for (const g of propGroups) if (g.resnap) groups.set(g.key, g);
  const slotOf = new Int32Array(trees.length).fill(-1);
  const counters = new Map<string, number>();
  trees.forEach((tree, id) => {
    const n = counters.get(tree.key) ?? 0;
    counters.set(tree.key, n + 1);
    const group = groups.get(tree.key);
    if (group && n < group.placements.length) slotOf[id] = n;
  });

  const batches = new Map<string, DynamicPropBatch | null>();
  const batchOf = (key: string): DynamicPropBatch | null => {
    if (batches.has(key)) return batches.get(key)!;
    const asset = propAssets.get(key);
    let batch: DynamicPropBatch | null = null;
    if (asset) {
      batch = createDynamicPropBatch({
        sun,
        key,
        asset,
        capacity: BATCH_CAPACITY,
        castsShadow: propCastsShadow(key),
      });
      if (propReflectsInWater(key))
        for (const mesh of batch.meshes) enableWaterReflectionLayer(mesh);
      propGroups.push(batch.group);
      options.addMeshes(batch.meshes);
    }
    batches.set(key, batch);
    return batch;
  };

  const falling = new Map<number, Falling>();
  const growing = new Map<number, { handle: number; batch: DynamicPropBatch }>();
  let sinceGrow = 0;
  let changed = false;

  /** The static group holding tree `id` and its slot in it, or null when it has none. */
  const treeSlot = (id: number) => {
    const group = groups.get(trees[id]!.key);
    const slot = slotOf[id]!;
    return group && slot >= 0 ? { group, slot } : null;
  };

  /** Write the tree's placed matrix into `out` at scale `scaleMul` times its own. */
  const placedMatrix = (id: number, scaleMul: number, out: Matrix4): boolean => {
    const found = treeSlot(id);
    const resnap = found?.group.resnap;
    if (!found || !resnap) return false;
    const p = found.group.placements[found.slot]!;
    const base = trees[id]!.scale;
    resolvePropInstanceMatrix(
      { ...p, scale: base * scaleMul },
      surface,
      resnap.alignToSlope,
      resnap.foot,
      out,
    );
    return true;
  };

  /** Hide or show the tree in its static group. */
  const setStatic = (id: number, visible: boolean) => {
    const found = treeSlot(id);
    const resnap = found?.group.resnap;
    if (!found || !resnap) return;
    const { group, slot } = found;
    const p = group.placements[slot]!;
    p.scale = visible ? trees[id]!.scale : 0;
    resolvePropInstanceMatrix(p, surface, resnap.alignToSlope, resnap.foot, group.matrices[slot]!);
    group.dirty = true;
    changed = true;
  };

  const yawOf = (id: number) => {
    const found = treeSlot(id);
    return found ? found.group.placements[found.slot]!.yRotation : 0;
  };

  const startFall = (id: number, dirX: number, dirZ: number) => {
    const tree = trees[id]!;
    const batch = batchOf(tree.key);
    const group = treeSlot(id)?.group;
    // The tree as it stood: its placed matrix (taken before it is hidden) and the point on the ground it is rooted at.
    if (!batch || !group?.resnap) return;
    const base = new Matrix4();
    placedMatrix(id, 1, base);
    const pivot = group.resnap.foot.clone().applyMatrix4(base);
    const handle = batch.add(tree.x, tree.z, base);
    if (!handle) return;
    // About the horizontal axis that tips the top toward (dirX, dirZ).
    const axis = new Vector3(dirZ, 0, -dirX);
    if (axis.lengthSq() < 1e-9) axis.set(1, 0, 0);
    falling.set(id, { handle, batch, base, pivot, axis: axis.normalize(), t: 0 });
  };

  const poseFall = (f: Falling, tree: TreeInfo) => {
    _q.setFromAxisAngle(f.axis, fallAngle(f.t));
    _t1.makeTranslation(-f.pivot.x, -f.pivot.y, -f.pivot.z);
    _t2.makeRotationFromQuaternion(_q);
    _m.copy(f.base).premultiply(_t1).premultiply(_t2);
    _t1.makeTranslation(f.pivot.x, f.pivot.y, f.pivot.z);
    _m.premultiply(_t1);
    f.batch.set(f.handle, tree.x, tree.z, _m);
  };

  const endFall = (id: number) => {
    const f = falling.get(id);
    if (!f) return;
    f.batch.remove(f.handle);
    falling.delete(id);
    changed = true;
  };

  const startGrowing = (id: number) => {
    const batch = batchOf(trees[id]!.key);
    if (!batch || growing.has(id)) return;
    const tree = trees[id]!;
    placedMatrix(id, forest.growth(id), _m);
    const handle = batch.add(tree.x, tree.z, _m);
    if (handle) growing.set(id, { handle, batch });
  };

  const stopGrowing = (id: number) => {
    const g = growing.get(id);
    if (!g) return;
    g.batch.remove(g.handle);
    growing.delete(id);
  };

  const addStump = (id: number) => {
    const tree = trees[id]!;
    dressing.addStump(id, tree.x, tree.z, yawOf(id), tree.scale);
  };

  return {
    showFounded: () => {
      for (const id of forest.changed) {
        setStatic(id, false);
        const s = forest.state(id);
        // A tree that was mid-fall when saved stays hidden; its stump appears when the fall ends.
        if (s === TreeState.Sapling) startGrowing(id);
        else if (s !== TreeState.Falling) addStump(id);
      }
      options.onChanged();
    },
    felled: (id, dirX, dirZ) => {
      // The tree falls from where it stood: take its matrix, then hide it in the group.
      startFall(id, dirX, dirZ);
      setStatic(id, false);
    },
    stump: (id) => {
      endFall(id);
      addStump(id);
    },
    sapling: (id) => {
      dressing.removeStump(id);
      startGrowing(id);
    },
    grown: (id) => {
      stopGrowing(id);
      dressing.removeStump(id);
      setStatic(id, true);
    },
    frame: (dt) => {
      for (const [id, f] of falling) {
        f.t += dt;
        poseFall(f, trees[id]!);
      }
      sinceGrow += dt;
      if (sinceGrow >= GROW_STEP_S) {
        sinceGrow = 0;
        for (const [id, g] of growing) {
          placedMatrix(id, forest.growth(id), _m);
          g.batch.set(g.handle, trees[id]!.x, trees[id]!.z, _m);
        }
      }
      if (changed) {
        changed = false;
        options.onChanged();
      }
    },
    dispose: () => {
      for (const batch of batches.values()) batch?.dispose();
      falling.clear();
      growing.clear();
    },
  };
}
