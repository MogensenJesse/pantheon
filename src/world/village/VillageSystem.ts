// src/world/village/VillageSystem.ts — village life: founding, growth and render hooks (orbSystem-style context)
import { type DirectionalLight, Group, type InstancedMesh, type Scene, type Vector3 } from 'three';
import { VILLAGE } from '../../config/village';
import { bus } from '../../core/EventBus';
import { state } from '../../core/GameState';
import type { GridTextureGpu } from '../../map/MapGrids';
import type { VillageSeedEntity } from '../../map/MapTypes';
import { unregisterMeshShadowCast } from '../../rendering/sunShadow';
import type { GrassSystem } from '../grass/core/GrassSystem';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import type { PropLodGroup } from '../mapProps/mapPropLod';
import { createVillageAssets } from './assets/villageAssets';
import { createBuildingRenderer } from './render/buildingRenderer';
import { createShadowInvalidationBatcher } from './render/shadowInvalidationBatcher';
import { createVillageTerrainLayers } from './render/villageTerrainLayers';
import type { FaithInputs } from './sim/faith';
import {
  createVillageSim,
  type VillageEvent,
  type VillageSeed,
  type VillageSim,
} from './sim/villageSim';
import { createTerrainSampler } from './terrainSamplerAdapter';
import { getVillageTimeScale, isVillagePresenceForced } from './villageDevState';

export interface VillageSystemOptions {
  scene: Scene;
  renderer: GridTextureGpu;
  /** Undefined when the map has no grass. */
  grassSystem?: GrassSystem;
  sun: DirectionalLight;
  terrain: MapTerrainContext;
  seeds: readonly VillageSeedEntity[];
  /** Shared with the frame tick: village batches join it so props' LOD rebinning drives them too. */
  propLodGroups: PropLodGroup[];
  /** Render-debug and shadow-diagnostic mesh list shared with the map props. */
  debugMeshes: InstancedMesh[];
}

/** DEV cheats that go through the system so the renderer follows. */
export interface VillageDevApi {
  addFaith: (amount: number) => void;
  /** Start a site right now at no faith cost; false when the cap or the planner says no. */
  startSite: () => boolean;
  completeSites: () => void;
}

export interface VillageSystemContext {
  readonly sim: VillageSim;
  readonly dev: VillageDevApi;
  /** Fixed-step simulation. */
  update: (dt: number, playerPosition: Vector3) => void;
  /** Once per frame, before the prop LOD rebin. */
  render: (frameDelta: number) => void;
  /** Show one instance per batch for the pipeline warmup; pair with endWarmup. */
  beginWarmup: () => void;
  endWarmup: () => void;
  dispose: () => void;
}

/** DEV only: `?villageSeed=x,z[,rotY]` founds a village on maps without an authored seed. */
function devSeedFromUrl(): VillageSeed | null {
  if (!import.meta.env.DEV) return null;
  const raw = new URLSearchParams(window.location.search).get('villageSeed');
  if (!raw) return null;
  const [x, z, rotY = 0] = raw.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotY)) return null;
  return { x: x!, z: z!, rotY, radiusM: VILLAGE.SEED.DEFAULT_RADIUS_M, id: VILLAGE.SEED.DEFAULT };
}

function resolveSeed(seeds: readonly VillageSeedEntity[]): VillageSeed | null {
  const authored = seeds[0];
  if (!authored) return devSeedFromUrl();
  if (seeds.length > 1) console.warn('[village] several villageSeed entities; using the first');
  return {
    x: authored.x,
    z: authored.z,
    rotY: authored.rotY ?? 0,
    radiusM: authored.radiusM ?? VILLAGE.SEED.DEFAULT_RADIUS_M,
    id: authored.seed ?? VILLAGE.SEED.DEFAULT,
  };
}

/** Returns null when the map has no village seed. */
export function initVillageSystem(options: VillageSystemOptions): VillageSystemContext | null {
  const { scene, renderer, grassSystem, sun, terrain, propLodGroups, debugMeshes } = options;
  const seed = resolveSeed(options.seeds);
  if (!seed) return null;

  const assets = createVillageAssets();
  const shadows = createShadowInvalidationBatcher(VILLAGE.SHADOW_FLUSH_MIN_S);
  const buildings = createBuildingRenderer(sun, assets.assets, shadows.markDirty);
  const sim = createVillageSim({
    sampler: createTerrainSampler(terrain),
    footprintOf: (type) => assets.meta.get(type)!.footprint,
    seed,
  });

  const root = new Group();
  root.name = 'village';
  for (const batch of buildings.batches) {
    propLodGroups.push(batch.group);
    for (const mesh of batch.meshes) {
      root.add(mesh);
      debugMeshes.push(mesh);
    }
  }
  scene.add(root);

  const layers = createVillageTerrainLayers({
    renderer,
    pathMap: terrain.pathMap,
    aoMap: terrain.propAoMap,
    exclusionMap: grassSystem?.propExclusionMap ?? null,
    requestGrassCompact: grassSystem ? grassSystem.requestCompactPass : null,
    centerX: seed.x,
    centerZ: seed.z,
    radiusM: seed.radiusM,
  });

  for (const building of sim.buildings) {
    buildings.add(building, false);
    layers.stampBuilding(building);
    const padHeight = building.plinthTopY - building.plinthBaseY;
    if (
      import.meta.env.DEV &&
      building.type === 'temple' &&
      padHeight > VILLAGE.PLINTH.WARN_HEIGHT_M
    ) {
      console.warn(
        `[village] temple pad is ${padHeight.toFixed(1)} m tall: the seed sits on steep ground. ` +
          'Move it to flatter land or rotate it so the long axis follows the contour lines.',
      );
    }
  }
  layers.commitFull();
  bus.emit('village:founded', { x: seed.x, z: seed.z, buildings: sim.buildings.length });

  const events: VillageEvent[] = [];
  const inputs: FaithInputs = { playerDistM: null, presenceActive: false };

  const applyEvents = () => {
    for (const event of events) {
      const { building } = event;
      if (event.kind === 'siteStarted') {
        buildings.add(building, true);
        layers.stampBuilding(building);
        bus.emit('village:siteStarted', {
          id: building.id,
          type: building.type,
          x: building.x,
          z: building.z,
        });
      } else {
        buildings.setStage(building.id, event.stage);
        bus.emit('village:stageCompleted', {
          id: building.id,
          type: building.type,
          stage: event.stage,
        });
      }
    }
    events.length = 0;
  };

  return {
    sim,
    dev: {
      addFaith: (amount) => sim.addFaith(amount),
      startSite: () => {
        const started = sim.startSiteNow(events);
        applyEvents();
        return started;
      },
      completeSites: () => {
        sim.completeOpenSites(events);
        applyEvents();
      },
    },
    update: (dt, playerPosition) => {
      inputs.playerDistM = Math.hypot(playerPosition.x - seed.x, playerPosition.z - seed.z);
      inputs.presenceActive = state.phase >= 1 || isVillagePresenceForced();
      const { MAX_SUBSTEP_S, MAX_SUBSTEPS } = VILLAGE.TIME_SCALE;
      let remaining = dt * getVillageTimeScale();
      for (let step = 0; step < MAX_SUBSTEPS && remaining > 1e-6; step++) {
        const slice = Math.min(MAX_SUBSTEP_S, remaining);
        sim.update(slice, inputs, events);
        remaining -= slice;
      }
      applyEvents();
    },
    render: (frameDelta) => {
      buildings.update(frameDelta);
      layers.flush(frameDelta);
      shadows.update(frameDelta);
    },
    beginWarmup: buildings.beginWarmup,
    endWarmup: buildings.endWarmup,
    dispose: () => {
      for (const batch of buildings.batches) {
        const groupIndex = propLodGroups.indexOf(batch.group);
        if (groupIndex >= 0) propLodGroups.splice(groupIndex, 1);
        for (const mesh of batch.meshes) {
          const debugIndex = debugMeshes.indexOf(mesh);
          if (debugIndex >= 0) debugMeshes.splice(debugIndex, 1);
          unregisterMeshShadowCast(mesh);
          root.remove(mesh);
        }
      }
      scene.remove(root);
      buildings.dispose();
      assets.dispose();
    },
  };
}
