// src/world/village/VillageSystem.ts — village life: wires the sim, its inputs and its view (orbSystem-style context)
import type { DirectionalLight, InstancedMesh, Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VILLAGE } from '../../config/village';
import { bus } from '../../core/EventBus';
import { state } from '../../core/GameState';
import type { VillageSeedEntity } from '../../map/MapTypes';
import { cyclePhaseFromSunPosition } from '../../rendering/sky/sunCycle';
import { unregisterMeshShadowCast } from '../../rendering/sunShadow';
import { currentSunAzimuthDeg, currentSunElevationDeg } from '../../rendering/sunSpherical';
import type { GrassSystem } from '../grass/core/GrassSystem';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import type { PropLodGroup } from '../mapProps/mapPropLod';
import { createVillageAssets } from './assets/villageAssets';
import { loadVillageKit } from './assets/villageKit';
import { makeVillageSeed, type VillageSeed } from './model/seed';
import type { VillageEvent } from './model/types';
import { createVillageView } from './render/VillageView';
import type { LineupFigure } from './render/villagerRenderer';
import {
  createVillageSim,
  type VillageMode,
  type VillageSim,
  type VillageSimInputs,
  type VillageSimState,
} from './sim/villageSim';
import { createTerrainSampler } from './terrainSamplerAdapter';
import { getVillageTimeScale, isVillagePresenceForced, villageDayPhase } from './villageDevState';

export interface VillageSystemOptions {
  scene: Scene;
  renderer: WebGPURenderer;
  /** Undefined when the map has no grass. */
  grassSystem?: GrassSystem;
  sun: DirectionalLight;
  terrain: MapTerrainContext;
  seeds: readonly VillageSeedEntity[];
  /** Positions of the map's trees: woodcutters chop the ones near the village. */
  trees: readonly { x: number; z: number }[];
  /** Shared with the frame tick: village batches join it so props' LOD rebinning drives them too. */
  propLodGroups: PropLodGroup[];
  /** Render-debug and shadow-diagnostic mesh list shared with the map props. */
  debugMeshes: InstancedMesh[];
  /** Continue a saved village instead of founding one (check it with `villageStateProblem` first). */
  restore?: VillageSimState;
  /** Default: a hamlet (the game's village); a DEV `?sandbox` visit keeps the self-growing village. */
  mode?: VillageMode;
}

/** DEV cheats that go through the system so the renderer follows. */
export interface VillageDevApi {
  addFaith: (amount: number) => void;
  /** Start a site right now at no faith cost; false when the cap or the planner says no. */
  startSite: () => boolean;
  completeSites: () => void;
  spawnVillagers: (count: number) => number;
  /** Same as the context's `addBelief` (kept for the console hook). */
  addBelief: (villager: number, amount: number) => boolean;
  /** Draw these figures besides the villagers (null removes them), to review models and poses. */
  setLineup: (figures: readonly LineupFigure[] | null) => void;
}

export interface VillageSystemContext {
  readonly sim: VillageSim;
  readonly dev: VillageDevApi;
  /** Distance from the orb to the village centre (m); Infinity before the first update. */
  playerDistance: () => number;
  /** Day-cycle phase 0..1 the village is running on (0.25 sunrise, 0.75 sunset). */
  dayPhase: () => number;
  /** Raise one villager's belief (the powers do this); true when it just reached 1. */
  addBelief: (villager: number, amount: number) => boolean;
  /** Add faith (Echo leaves some behind with each orb picked up). */
  addFaith: (amount: number) => void;
  /** Convert the hamlet (the conversion quest's last step): growth opens, `village:converted` is sent. */
  convert: () => boolean;
  /** Hold a villager still, facing (x, z), for a few seconds (the powers do this). */
  notice: (villager: number, x: number, z: number, seconds: number) => boolean;
  /** Fixed-step simulation. */
  update: (dt: number, playerPosition: Vector3) => void;
  /** Once per frame, before the prop LOD rebin; `viewPosition` is the camera. */
  render: (alpha: number, frameDelta: number, viewPosition: Vector3) => void;
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
  return makeVillageSeed({ x: x!, z: z!, rotY });
}

/** DEV only: `?sandbox` keeps the village that grows by itself; everything else is the hamlet. */
function villageModeFromUrl(): VillageMode {
  if (!import.meta.env.DEV) return 'hamlet';
  return new URLSearchParams(window.location.search).has('sandbox') ? 'sandbox' : 'hamlet';
}

export function resolveSeed(seeds: readonly VillageSeedEntity[]): VillageSeed | null {
  const authored = seeds[0];
  if (!authored) return devSeedFromUrl();
  if (seeds.length > 1) console.warn('[village] several villageSeed entities; using the first');
  return makeVillageSeed(authored);
}

/** Resolves to null when the map has no village seed. Loads the modelled kit (GLBs) first. */
export async function initVillageSystem(
  options: VillageSystemOptions,
): Promise<VillageSystemContext | null> {
  const { scene, renderer, grassSystem, sun, terrain, propLodGroups, debugMeshes } = options;
  const seed = resolveSeed(options.seeds);
  if (!seed) return null;

  const assets = createVillageAssets(await loadVillageKit(renderer));
  const sim = createVillageSim({
    sampler: createTerrainSampler(terrain),
    metaOf: (type) => assets.meta.get(type)!,
    seed,
    trees: options.trees,
    restore: options.restore,
    mode: options.mode ?? villageModeFromUrl(),
  });
  const view = createVillageView({
    scene,
    renderer,
    sun,
    terrain,
    grassSystem,
    assets,
    sim,
    mapPropGroups: propLodGroups,
  });
  propLodGroups.push(...view.groups);
  debugMeshes.push(...view.instancedMeshes);

  // A restored village is shown the same way: every building at its saved stage, pads levelled by
  // their saved progress, no rise-in animation.
  view.showFounded();
  const temple = sim.buildings.find((b) => b.type === 'temple');
  const padHeight = temple ? temple.plinthTopY - temple.plinthBaseY : 0;
  if (import.meta.env.DEV && padHeight > VILLAGE.PLINTH.WARN_HEIGHT_M) {
    console.warn(
      `[village] temple pad needs ${padHeight.toFixed(1)} m of fill: the seed sits on steep ground. ` +
        'Move it to flatter land or rotate it so the long axis follows the contour lines.',
    );
  }
  bus.emit('village:founded', { x: seed.x, z: seed.z, buildings: sim.buildings.length });

  const events: VillageEvent[] = [];
  const inputs: VillageSimInputs = {
    playerDistM: null,
    presenceActive: false,
    dayPhase: 0.5,
    vigil: false,
  };

  const applyEvents = () => {
    // Drained first: a listener may raise more events (the quest converts the village when the elder
    // believes), and those must not replay the ones being delivered.
    const batch = events.splice(0);
    for (const event of batch) {
      if (event.kind === 'fieldStarted') {
        view.fieldStarted(event.field);
        continue;
      }
      if (event.kind === 'villagerConverted') {
        bus.emit('village:villagerConverted', {
          villager: event.villager,
          converts: event.converts,
          total: sim.villagers.count,
        });
        continue;
      }
      if (event.kind === 'villageConverted') {
        bus.emit('village:converted', { converts: sim.believers(), total: sim.villagers.count });
        continue;
      }
      const { building } = event;
      if (event.kind === 'siteStarted') {
        view.siteStarted(building);
        bus.emit('village:siteStarted', {
          id: building.id,
          type: building.type,
          x: building.x,
          z: building.z,
        });
      } else {
        view.stageCompleted(building, event.stage);
        bus.emit('village:stageCompleted', {
          id: building.id,
          type: building.type,
          stage: event.stage,
        });
      }
    }
  };

  const addBelief = (villager: number, amount: number) => {
    const crossed = sim.addBelief(villager, amount, events);
    applyEvents();
    return crossed;
  };

  return {
    sim,
    dayPhase: () => inputs.dayPhase,
    addBelief,
    convert: () => {
      const done = sim.convertVillage(events);
      applyEvents();
      return done;
    },
    notice: sim.notice,
    addFaith: sim.addFaith,
    dev: {
      addFaith: sim.addFaith,
      startSite: () => {
        const started = sim.startSiteNow(events);
        applyEvents();
        return started;
      },
      completeSites: () => {
        sim.completeOpenSites(events);
        applyEvents();
      },
      spawnVillagers: (count) => sim.spawnVillagers(count),
      addBelief,
      setLineup: view.setLineup,
    },
    playerDistance: () => inputs.playerDistM ?? Number.POSITIVE_INFINITY,
    update: (dt, playerPosition) => {
      inputs.playerDistM = Math.hypot(playerPosition.x - seed.x, playerPosition.z - seed.z);
      inputs.presenceActive = state.phase >= 1 || isVillagePresenceForced();
      inputs.dayPhase = villageDayPhase(
        cyclePhaseFromSunPosition(currentSunElevationDeg(), currentSunAzimuthDeg()),
      );
      // Phase 0: the sun is pinned at night, so people keep vigil instead of waiting for dawn.
      inputs.vigil = state.phase < 1;
      sim.beginStep();
      const { MAX_SUBSTEP_S, MAX_SUBSTEPS } = VILLAGE.TIME_SCALE;
      let remaining = dt * getVillageTimeScale();
      for (let step = 0; step < MAX_SUBSTEPS && remaining > 1e-6; step++) {
        const slice = Math.min(MAX_SUBSTEP_S, remaining);
        sim.update(slice, inputs, events);
        remaining -= slice;
      }
      applyEvents();
    },
    render: (alpha, frameDelta, viewPosition) => {
      view.frame({
        alpha,
        frameDelta,
        viewX: viewPosition.x,
        viewZ: viewPosition.z,
        dayPhase: inputs.dayPhase,
        vigil: inputs.vigil,
      });
    },
    beginWarmup: view.beginWarmup,
    endWarmup: view.endWarmup,
    dispose: () => {
      for (const group of view.groups) {
        const index = propLodGroups.indexOf(group);
        if (index >= 0) propLodGroups.splice(index, 1);
      }
      for (const mesh of view.instancedMeshes) {
        const index = debugMeshes.indexOf(mesh);
        if (index >= 0) debugMeshes.splice(index, 1);
        unregisterMeshShadowCast(mesh);
      }
      view.dispose();
      assets.dispose();
    },
  };
}
