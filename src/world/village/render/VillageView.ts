// src/world/village/render/VillageView.ts — everything the village draws, driven by sim events
import { type DirectionalLight, Group, type InstancedMesh, type Scene, Vector3 } from 'three';
import { VILLAGE } from '../../../config/village';
import type { GridTextureGpu } from '../../../map/MapGrids';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import { type TodWeights, todWeights } from '../../../rendering/tod/todBlend';
import type { GrassSystem } from '../../grass/core/GrassSystem';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import type { PropLodGroup } from '../../mapProps/mapPropLod';
import { sampleChiseledWorldNormal } from '../../terrain/cpu/terrainChiselCpu';
import { hasWindowGlow, type VillageStage } from '../assets/villageAssetKeys';
import type { VillageAssetSet } from '../assets/villageAssets';
import { localToWorld } from '../sim/geometry';
import { smokeStrength, windowsLit } from '../sim/lighting';
import type { VillageSim } from '../sim/villageSim';
import type { Building, Field } from '../sim/villageTypes';
import { createBuildingRenderer } from './buildingRenderer';
import { createDressingRenderer } from './dressingRenderer';
import { createShadowInvalidationBatcher } from './shadowInvalidationBatcher';
import { createSmokeRenderer } from './smokeRenderer';
import { createVillagerRenderer } from './villagerRenderer';
import { createVillageTerrainLayers } from './villageTerrainLayers';
import { uVillageGlow, uVillageTime } from './villageUniforms';
import { createInstancedWarmup } from './warmup';
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
  /** Show the buildings that exist at founding. */
  showFounded: () => void;
  siteStarted: (building: Building) => void;
  stageCompleted: (building: Building, stage: VillageStage) => void;
  fieldStarted: (field: Field) => void;
  frame: (frame: VillageFrame) => void;
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
  const { scene, renderer, sun, terrain, grassSystem, assets, sim } = options;
  const shadows = createShadowInvalidationBatcher(VILLAGE.SHADOW_FLUSH_MIN_S);
  const buildings = createBuildingRenderer(sun, assets.assets, shadows.markDirty);
  const glow = createWindowGlow(sun, assets.assets, buildings.floorYOf);
  const dressing = createDressingRenderer(sun, assets.assets, terrain.getWorldY);
  const smoke = createSmokeRenderer();
  const villagers = createVillagerRenderer({
    sun,
    getY: terrain.getWorldY,
    getGroundNormal: (x, z, out) => {
      sampleChiseledWorldNormal(terrain.grids, x, z, _groundNormal);
      out.x = _groundNormal.x;
      out.z = _groundNormal.z;
    },
  });
  const layers = createVillageTerrainLayers({
    renderer,
    pathMap: terrain.pathMap,
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
    if (b.stage < 2) {
      const [x, z] = stockpileSpot(b);
      dressing.addStockpile(b.id, x, z, b.rotY);
    } else {
      registerChimney(b);
    }
  };

  const fieldStarted = (field: Field) => {
    dressing.addField(field);
    layers.stampField(field);
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
    const worn = sim.wear.takeDirty();
    if (worn) layers.applyWear(sim.wear.worldRect(worn));
  };

  const warmup = createInstancedWarmup([...instancedMeshes, smoke.mesh]);

  return {
    groups,
    instancedMeshes,
    showFounded: () => {
      for (const b of sim.buildings) present(b, false);
      for (const field of sim.fields) fieldStarted(field);
      applyWear();
      layers.commitFull();
    },
    siteStarted: (building) => present(building, true),
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
      buildings.update(f.frameDelta);
      for (const field of sim.fields) dressing.setGrowth(field);
      villagers.update({
        alpha: f.alpha,
        elapsed,
        villagers: sim.villagers,
        viewX: f.viewX,
        viewZ: f.viewZ,
      });
      applyWear();
      layers.flush(f.frameDelta);
      shadows.update(f.frameDelta);
    },
    beginWarmup: () => {
      warmup.begin();
      villagers.beginWarmup();
    },
    endWarmup: () => {
      warmup.end();
      villagers.endWarmup();
    },
    dispose: () => {
      for (const mesh of [...instancedMeshes, ...villagers.meshes, smoke.mesh]) root.remove(mesh);
      scene.remove(root);
      villagers.dispose();
      smoke.dispose();
      dressing.dispose();
      glow.dispose();
      buildings.dispose();
    },
  };
}
