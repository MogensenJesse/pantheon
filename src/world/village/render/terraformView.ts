// src/world/village/render/terraformView.ts — levels the terrain under building pads as they are built
import { VILLAGE } from '../../../config/village';
import type { GrassSystem } from '../../grass/core/GrassSystem';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { resnapMapProps } from '../../mapProps/mapPropInstancing';
import type { PropLodGroup } from '../../mapProps/mapPropLod';
import type { NodeBounds } from '../../terrain/cpu/fineDelta';
import { sampleChiseledWorldYBase } from '../../terrain/cpu/terrainChiselCpu';
import type { Building } from '../model/types';
import { planPad } from '../sim/pad';
import { createTerraformer } from '../sim/terraform';
import type { DressingRenderer } from './dressingRenderer';

export interface TerraformView {
  /** Claim the pad of a building (nothing moves until its fraction rises). */
  register: (building: Building) => void;
  /** Follow construction progress and flush the changed ground. `settle` jumps to the current state. */
  update: (dt: number, buildings: readonly Building[]) => void;
  settle: (buildings: readonly Building[]) => void;
}

/** A fraction step worth recomputing nodes for. */
const FRACTION_STEP = 1 / 48;
/** Seconds between flushes of changed ground into the mesh, grass, props and shadows. */
const FLUSH_S = 0.25;

/** How far a building's pad is levelled: over its foundation phase, then complete. */
export function levelFraction(b: Building): number {
  if (b.stage >= 1) return 1;
  return Math.min(1, Math.max(0, b.progress / VILLAGE.CONSTRUCTION.WORK_S[0]!));
}

/** Null when the map has no detail layer (no village seed at build time). */
export function createTerraformView(options: {
  terrain: MapTerrainContext;
  grass?: GrassSystem;
  dressing: DressingRenderer;
  /** Shared prop group list; groups without `resnap` (village batches) are skipped. */
  propGroups: readonly PropLodGroup[];
  onGroundChanged: () => void;
}): TerraformView | null {
  const { terrain, grass, dressing, propGroups, onGroundChanged } = options;
  const fine = terrain.fine;
  if (!fine) return null;
  const { delta } = fine;
  const baseY = (x: number, z: number) => sampleChiseledWorldYBase(terrain.grids, x, z);
  const terraformer = createTerraformer(delta, baseY);
  const tracked = new Map<number, number>();
  let pending: NodeBounds | null = null;
  let sinceFlush = 0;

  const merge = (b: NodeBounds) => {
    if (!pending) pending = { ...b };
    else {
      pending.ix0 = Math.min(pending.ix0, b.ix0);
      pending.iz0 = Math.min(pending.iz0, b.iz0);
      pending.ix1 = Math.max(pending.ix1, b.ix1);
      pending.iz1 = Math.max(pending.iz1, b.iz1);
    }
  };

  const flush = () => {
    const bounds = pending;
    if (!bounds) return;
    pending = null;
    sinceFlush = 0;
    fine.refresh(bounds);
    const s = delta.stepM;
    const minX = delta.originX + (bounds.ix0 - 1) * s;
    const maxX = delta.originX + (bounds.ix1 + 1) * s;
    const minZ = delta.originZ + (bounds.iz0 - 1) * s;
    const maxZ = delta.originZ + (bounds.iz1 + 1) * s;
    resnapMapProps(propGroups, terrain, minX, maxX, minZ, maxZ);
    dressing.resnap(minX, maxX, minZ, maxZ);
    grass?.invalidateTerrainHeights();
    onGroundChanged();
  };

  const follow = (buildings: readonly Building[], force: boolean) => {
    for (const b of buildings) {
      const applied = tracked.get(b.id);
      if (applied === undefined || applied >= 1) continue;
      const f = levelFraction(b);
      if (!force && f < 1 && f - applied < FRACTION_STEP) continue;
      terraformer.setFraction(b.id, f);
      tracked.set(b.id, f);
    }
    const dirty = terraformer.takeDirty();
    if (dirty) merge(dirty);
  };

  return {
    register: (b) => {
      if (tracked.has(b.id)) return;
      // The sim seated the building on this same original ground; use its floor so the two agree.
      const pad = planPad(baseY, b.x, b.z, b.rotY, b.halfW, b.halfD);
      terraformer.add(b.id, { ...pad, floorY: b.plinthTopY });
      tracked.set(b.id, 0);
    },
    update: (dt, buildings) => {
      follow(buildings, false);
      sinceFlush += dt;
      if (pending && sinceFlush >= FLUSH_S) flush();
    },
    settle: (buildings) => {
      follow(buildings, true);
      flush();
    },
  };
}
