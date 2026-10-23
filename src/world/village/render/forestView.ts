// src/world/village/render/forestView.ts — what the forest sim shows: a felled tree leaves its static
// group, falls as a temporary instance, and a stump stays; a sapling grows back as an instance and the
// tree returns to its group. The static groups are never edited beyond one placement's scale (zero hides
// a tree), so `updatePropLod` and `resnapMapProps` need no changes and a resnap keeps a felled tree hidden.

import type { DirectionalLight } from 'three';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
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
import { fallAngle } from './treeFall';

/** Instances of one tree key that can be falling or growing at once. */
const BATCH_CAPACITY = 64;
/** Seconds between growth updates of the saplings. */
const GROW_STEP_S = 0.25;
/** Seconds between shadow updates while the hand carries a tree (the shadow is baked, not drawn live). */
const CARRY_SHADOW_S = 0.25;

export interface ForestViewOptions {
  sun: DirectionalLight;
  terrain: MapTerrainContext;
  forest: Forest;
  /** The map's trees, in the order the sim has them (the index is the tree's id). */
  trees: readonly TreeInfo[];
  /** The map's static prop groups: the trees' own, which a felled tree is hidden in. */
  propGroups: readonly PropLodGroup[];
  /** The assets of the tree keys (`ASSET_MANIFEST.trees`). */
  propAssets: ReadonlyMap<string, PropLodAsset>;
  dressing: DressingRenderer;
  /** Shadows and anything else that has to notice the trees changed. */
  onChanged: () => void;
}

/** What the village shows the hand carrying: a tree, or a sheaf of wheat. */
export type CarriedKind = 'tree' | 'wheat';

/** Where the hand holds what it carries: a tree's root (or a sheaf's base) at (x, y, z), a crown tipped back from the heading. */
export interface CarriedPose {
  x: number;
  y: number;
  z: number;
  /** About +y, rad; the crown trails opposite. */
  yaw: number;
  /** Tilt back from upright, rad. */
  tilt: number;
  /** Size next to the thing standing. */
  scale: number;
}

export interface ForestView {
  /** One batch per tree key, made up front: the village adds them to its scene and its prop groups. */
  readonly batches: readonly DynamicPropBatch[];
  /** Show the forest as the sim has it (a new game, or a restored one) before the first frame. */
  showFounded: () => void;
  felled: (tree: number, dirX: number, dirZ: number) => void;
  /** The orb's hand pulled the tree out: it leaves its group and a stump stays, with no fall. */
  uprooted: (tree: number) => void;
  /**
   * The hand lifts a tree (view only: the sim still has it standing): it leaves its group, a stump shows and a
   * small copy follows `pose`. False when it cannot be lifted (not standing, or already lifted).
   */
  lift: (tree: number) => boolean;
  pose: (tree: number, pose: CarriedPose) => void;
  /** The hold ends. `putBack` restores the tree and drops the stump; otherwise the sim's events carry on from here. */
  release: (tree: number, putBack: boolean) => void;
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
const _euler = new Euler();
const _pos = new Vector3();
const _scale = new Vector3();

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
    if (group && n < group.placements.length) {
      slotOf[id] = n;
      // The slot is found by counting, so the map's props must still be in the sim's tree order.
      const p = group.placements[n]!;
      if (import.meta.env.DEV && Math.hypot(p.x - tree.x, p.z - tree.z) > 0.5) {
        console.warn(`[forest] tree ${id} (${tree.key}) is not where its prop slot ${n} is`);
      }
    }
  });

  // Every batch is made now, before the village's pipelines are warmed up, so the first tree to fall
  // creates no mesh or shader mid-game; the village adds them to its scene and prop groups.
  const batches = new Map<string, DynamicPropBatch>();
  for (const { key } of trees) {
    const asset = propAssets.get(key);
    if (!asset || batches.has(key)) continue;
    const batch = createDynamicPropBatch({
      sun,
      key,
      asset,
      capacity: BATCH_CAPACITY,
      castsShadow: propCastsShadow(key),
      // a sapling is a small copy of the tree's model: swaying by the model's height would sway it like a full tree
      sways: false,
    });
    if (propReflectsInWater(key)) for (const mesh of batch.meshes) enableWaterReflectionLayer(mesh);
    batches.set(key, batch);
  }
  const batchOf = (key: string): DynamicPropBatch | undefined => batches.get(key);

  const falling = new Map<number, Falling>();
  const growing = new Map<number, { handle: number; batch: DynamicPropBatch }>();
  /** The small copies of trees the hand carries. */
  const carried = new Map<number, { handle: number; batch: DynamicPropBatch }>();
  /** Trees the hand hid and put a stump under; the sim has them standing until the delivery uproots them. */
  const lifted = new Set<number>();
  let sinceGrow = 0;
  let sinceCarryShadow = 0;
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
    if (falling.has(id)) return;
    const handle = batch.add(tree.x, tree.z, base);
    if (!handle) {
      if (import.meta.env.DEV) console.warn(`[forest] no room to show ${tree.key} falling`);
      return;
    }
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
    else if (import.meta.env.DEV) console.warn(`[forest] no room to show ${tree.key} growing`);
  };

  const stopGrowing = (id: number) => {
    const g = growing.get(id);
    if (!g) return;
    g.batch.remove(g.handle);
    growing.delete(id);
  };

  const endCarry = (id: number) => {
    const c = carried.get(id);
    if (!c) return;
    c.batch.remove(c.handle);
    carried.delete(id);
    changed = true;
  };

  const addStump = (id: number) => {
    const tree = trees[id]!;
    dressing.addStump(id, tree.x, tree.z, yawOf(id), tree.scale);
  };

  return {
    batches: [...batches.values()],
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
      // A woodcutter got to a tree the hand was holding: the hold is over, the sim's events take it from here.
      lifted.delete(id);
      endCarry(id);
    },
    uprooted: (id) => {
      setStatic(id, false);
      addStump(id);
      lifted.delete(id);
      endCarry(id);
    },
    lift: (id) => {
      if (lifted.has(id) || !forest.isStanding(id)) return false;
      const tree = trees[id]!;
      const batch = batchOf(tree.key);
      // The tree as it stood, until the first pose puts the small copy on the hand.
      const shown = batch && placedMatrix(id, 1, _m);
      setStatic(id, false);
      addStump(id);
      lifted.add(id);
      if (batch && shown) {
        const handle = batch.add(tree.x, tree.z, _m);
        if (handle) carried.set(id, { handle, batch });
        else if (import.meta.env.DEV) console.warn(`[forest] no room to show ${tree.key} carried`);
      }
      return true;
    },
    pose: (id, p) => {
      const c = carried.get(id);
      if (!c) return;
      _euler.set(-p.tilt, p.yaw, 0, 'YXZ');
      _q.setFromEuler(_euler);
      const scale = trees[id]!.scale * p.scale;
      // The model's root is not its origin: hang the root, not the origin, from the hand.
      _pos.set(0, c.batch.footY * scale, 0).applyQuaternion(_q);
      _pos.set(p.x - _pos.x, p.y - _pos.y, p.z - _pos.z);
      _scale.setScalar(scale);
      _m.compose(_pos, _q, _scale);
      c.batch.set(c.handle, p.x, p.z, _m);
    },
    release: (id, putBack) => {
      endCarry(id);
      if (putBack && lifted.delete(id)) {
        dressing.removeStump(id);
        setStatic(id, true);
      }
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
      if (carried.size > 0) {
        sinceCarryShadow += dt;
        if (sinceCarryShadow >= CARRY_SHADOW_S) {
          sinceCarryShadow = 0;
          changed = true;
        }
      }
      if (changed) {
        changed = false;
        options.onChanged();
      }
    },
    dispose: () => {
      for (const batch of batches.values()) batch.dispose();
      falling.clear();
      growing.clear();
      carried.clear();
      lifted.clear();
    },
  };
}
