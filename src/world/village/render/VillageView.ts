// src/world/village/render/VillageView.ts — everything the village draws, driven by sim events
import { type DirectionalLight, Group, type InstancedMesh, type Scene, Vector3 } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import type { GridTextureGpu } from '../../../map/MapGrids';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import { type TodWeights, todWeights } from '../../../rendering/tod/todBlend';
import type { GrassSystem } from '../../grass/core/GrassSystem';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { onPropContactAoRebaked } from '../../mapProps/data/propContactAoDevState';
import type { PropLodGroup } from '../../mapProps/mapPropLod';
import { sampleChiseledWorldNormal } from '../../terrain/cpu/terrainChiselCpu';
import type { VillageAssetSet } from '../assets/villageAssets';
import { hasWindowGlow, type VillageStage } from '../model/assetKeys';
import type { Building, Field } from '../model/types';
import { localToWorld } from '../sim/geometry';
import { smokeStrength, windowsLit } from '../sim/lightSchedule';
import type { VillageSim } from '../sim/villageSim';
import { createBuildingRenderer } from './buildingRenderer';
import { createCrownOrbs } from './crownOrb';
import { createDressingRenderer } from './dressingRenderer';
import { createShadowInvalidationBatcher } from './shadowInvalidationBatcher';
import { createSmokeRenderer } from './smokeRenderer';
import { createTerraformView } from './terraformView';
import { createVillagerRenderer, type LineupFigure } from './villagerRenderer';
import { createVillageTerrainLayers } from './villageTerrainLayers';
import { uVillageGlow, uVillageTime } from './villageUniforms';
import { createInstancedWarmup } from './warmup';
import { createWheatFields } from './wheatFields';
import { createWindowGlow } from './windowGlow';

export interface VillageViewOptions {
  scene: Scene;
  renderer: GridTextureGpu;
  sun: DirectionalLight;
  terrain: MapTerrainContext;
  /** Undefined when the map has no grass. */
  grassSystem?: GrassSystem;
  assets: VillageAssetSet;
  sim: VillageSim;
  /** The shared prop group list: static map props near a levelled pad are re-seated on the new ground. */
  mapPropGroups: readonly PropLodGroup[];
}

export interface VillageFrame {
  alpha: number;
  frameDelta: number;
  viewX: number;
  viewZ: number;
  dayPhase: number;
  vigil: boolean;
}

export interface VillageView {
  /** Every prop LOD group the view owns (the frame tick rebins them with the map props). */
  readonly groups: readonly PropLodGroup[];
  /** Every InstancedMesh, for the render-debug and shadow-diagnostic lists. */
  readonly instancedMeshes: readonly InstancedMesh[];
  /** Show every building the sim already has: those of a new village, or of a restored one. */
  showFounded: () => void;
  siteStarted: (building: Building) => void;
  stageCompleted: (building: Building, stage: VillageStage) => void;
  fieldStarted: (field: Field) => void;
  frame: (frame: VillageFrame) => void;
  /** DEV: draw these figures besides the villagers (null removes them). */
  setLineup: (figures: readonly LineupFigure[] | null) => void;
  beginWarmup: () => void;
  endWarmup: () => void;
  /** Unhook from the scene (the caller owns the shared lists). */
  dispose: () => void;
}

const LIGHT_REFRESH_S = 1;
const _weights: TodWeights = { night: 0, goldenHour: 0, noon: 0 };
const _groundNormal = new Vector3();
const STOCKPILE_OUT_M = 1.2;

export function createVillageView(options: VillageViewOptions): VillageView {
  const { scene, renderer, sun, terrain, grassSystem, assets, sim, mapPropGroups } = options;
  const shadows = createShadowInvalidationBatcher(VISUAL.village.SHADOW_FLUSH_MIN_S);
  const buildings = createBuildingRenderer(sun, assets.assets, shadows.markDirty);
  const glow = createWindowGlow(sun, assets.assets, buildings.floorYOf);
  const dressing = createDressingRenderer(sun, assets.assets, terrain.getWorldY);
  const terraform = createTerraformView({
    terrain,
    grass: grassSystem,
    dressing,
    propGroups: mapPropGroups,
    onGroundChanged: shadows.markDirty,
  });
  const smoke = createSmokeRenderer();
  const wheat = createWheatFields(grassSystem);
  const villagers = createVillagerRenderer({
    sun,
    figures: assets.villagers,
    getY: terrain.getWorldY,
    getGroundNormal: (x, z, out) => {
      sampleChiseledWorldNormal(terrain.grids, x, z, _groundNormal);
      out.x = _groundNormal.x;
      out.z = _groundNormal.z;
    },
  });
  const layers = createVillageTerrainLayers({
    renderer,
    overlayMap: terrain.overlayMap,
    aoMap: terrain.propAoMap,
    exclusionMap: grassSystem?.propExclusionMap ?? null,
    requestGrassCompact: grassSystem ? grassSystem.requestCompactPass : null,
    wear: sim.wear,
    centerX: sim.seed.x,
    centerZ: sim.seed.z,
    radiusM: sim.seed.radiusM,
  });

  const batches = [...buildings.batches, ...glow.batches, ...dressing.batches];
  const groups = batches.map((batch) => batch.group);
  const instancedMeshes = batches.flatMap((batch) => batch.meshes);
  const root = new Group();
  root.name = 'village';
  for (const mesh of [...instancedMeshes, ...villagers.meshes, smoke.mesh]) root.add(mesh);
  scene.add(root);
  const crownOrbs = createCrownOrbs(root);

  let elapsed = 0;
  let lightClock = Number.POSITIVE_INFINITY;
  let lastPhase = 0.5;
  let lastVigil = false;
  const chimneyAdded = new Set<number>();

  /** A stockpile of planks beside an open site, past its last work slot. */
  const stockpileSpot = (b: Building): [number, number] => {
    const slots = assets.meta.get(b.type)?.workSlots;
    const last = slots?.[slots.length - 1] ?? [b.halfW + 1, 0];
    return localToWorld(b, last[0] + STOCKPILE_OUT_M, last[1]);
  };

  const registerChimney = (b: Building) => {
    const chimney = assets.meta.get(b.type)?.chimney;
    if (!chimney || chimneyAdded.has(b.id)) return;
    const [x, z] = localToWorld(b, chimney[0], chimney[2]);
    smoke.addChimney(b.id, x, b.plinthTopY + chimney[1], z);
    chimneyAdded.add(b.id);
  };

  /** Show a building: its mesh and terrain marks, then a stockpile (open site) or smoke (finished). */
  const present = (b: Building, animate: boolean) => {
    buildings.add(b, animate);
    layers.stampBuilding(b);
    const crownY = assets.meta.get(b.type)?.crownY;
    if (crownY !== undefined && b.stage === 2) {
      crownOrbs.add(b.x, b.plinthTopY - buildings.floorYOf(b.type), b.z, crownY);
    }
    if (b.stage < 2) {
      const [x, z] = stockpileSpot(b);
      dressing.addStockpile(b.id, x, z, b.rotY);
    } else {
      registerChimney(b);
    }
  };

  const fieldStarted = (field: Field) => {
    dressing.addField(field);
    wheat.add(field);
  };

  const refreshLighting = () => {
    for (const b of sim.buildings) {
      if (b.stage !== 2) continue;
      const occupied = sim.isOccupied(b.id);
      if (hasWindowGlow(b.type)) {
        glow.setLit(b, windowsLit(b.type, b.id, occupied, lastPhase, lastVigil));
      }
      if (chimneyAdded.has(b.id)) {
        smoke.setStrength(b.id, occupied ? smokeStrength(b.id, lastPhase, lastVigil) : 0);
      }
    }
  };

  const applyWear = () => {
    for (const tile of sim.wear.takeDirty()) layers.applyWear(sim.wear.worldRect(tile));
  };

  const warmup = createInstancedWarmup([...instancedMeshes, smoke.mesh]);
  // DEV: dragging the terrain-AO sliders re-bakes the AO texture, which wipes the village's shade.
  const unsubscribeAoRebake = import.meta.env.DEV
    ? onPropContactAoRebaked(() => layers.reapplyAo(sim.buildings))
    : () => {};

  return {
    groups,
    instancedMeshes,
    showFounded: () => {
      for (const b of sim.buildings) terraform?.register(b);
      terraform?.settle(sim.buildings);
      for (const b of sim.buildings) present(b, false);
      for (const field of sim.fields) fieldStarted(field);
      applyWear();
      layers.commitFull();
    },
    siteStarted: (building) => {
      terraform?.register(building);
      present(building, true);
    },
    stageCompleted: (building, stage) => {
      buildings.setStage(building.id, stage);
      if (stage === 2) {
        dressing.removeStockpile(building.id);
        registerChimney(building);
      }
    },
    fieldStarted,
    frame: (f) => {
      elapsed += f.frameDelta;
      uVillageTime.value = elapsed;
      todWeights(currentSunElevationDeg(), _weights);
      uVillageGlow.value = _weights.night + 0.4 * _weights.goldenHour;
      lastPhase = f.dayPhase;
      lastVigil = f.vigil;
      lightClock += f.frameDelta;
      if (lightClock >= LIGHT_REFRESH_S) {
        lightClock = 0;
        refreshLighting();
      }
      terraform?.update(f.frameDelta, sim.buildings);
      buildings.update(f.frameDelta);
      wheat.update(sim.fields);
      villagers.update({
        alpha: f.alpha,
        elapsed,
        villagers: sim.villagers,
        viewX: f.viewX,
        viewZ: f.viewZ,
      });
      applyWear();
      // A hamlet's temple orb and beam follow the share of believers (full strength when all believe);
      // the faith that believers then earn adds to that.
      const beliefGlow =
        sim.mode === 'hamlet' ? sim.beliefShare() * VISUAL.village.CROWN_ORB.MAX_FAITH : 0;
      crownOrbs.update(elapsed, f.frameDelta, sim.faith.earned + beliefGlow);
      layers.flush(f.frameDelta);
      shadows.update(f.frameDelta);
    },
    setLineup: villagers.setLineup,
    beginWarmup: () => {
      warmup.begin();
      villagers.beginWarmup();
    },
    endWarmup: () => {
      warmup.end();
      villagers.endWarmup();
    },
    dispose: () => {
      unsubscribeAoRebake();
      for (const mesh of [...instancedMeshes, ...villagers.meshes, smoke.mesh]) root.remove(mesh);
      scene.remove(root);
      crownOrbs.dispose();
      villagers.dispose();
      smoke.dispose();
      dressing.dispose();
      glow.dispose();
      buildings.dispose();
    },
  };
}
