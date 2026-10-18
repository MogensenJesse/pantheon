// src/entities/energyOrb/orbSystem.ts — residue orb visual bootstrap + per-tick update

import alea, { type AleaState } from 'alea';
import type { Scene, Vector3 } from 'three';
import { PHASE0 } from '../../config/phase0';
import type { OrganicOrbSettings } from '../../config/visual/organicOrb';
import { VISUAL } from '../../config/visualTuning';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { createEnergyOrbParticles } from '../energyOrbParticles';
import { sampleOrbTerrainFooting } from '../orbTerrainFooting';
import {
  getLiveOrganicOrbSettings,
  getOrganicOrbDevRevision,
} from '../organicOrb/organicOrbDevState';
import { createOrganicOrbMaterial } from '../organicOrb/organicOrbMaterial';
import { createOrganicOrbGeometry } from '../organicOrb/organicOrbMesh';
import { createEnergyOrb, type EnergyOrb, type OrbPlacement } from './energyOrb';
import {
  newRespawnClock,
  type Point,
  pickRespawnSpot,
  pickSlot,
  type RespawnClock,
  type RespawnConfig,
  respawnEnergy,
  retrySoon,
  stepRespawn,
} from './respawn';

const { ENERGY_RADIUS: ORB_RADIUS, RNG_SEED } = PHASE0.ORB;

export interface InitOrbSystemOptions {
  placements: OrbPlacement[];
}

/**
 * What a save keeps of the orbs. Slots are named by their place on the map (their "home"), so a map
 * edited between saves still matches: a slot added since starts fresh, one removed is dropped.
 */
export interface OrbsState {
  /** Home places of the slots with no live orb. */
  absorbed: { x: number; z: number }[];
  /** Slots whose orb is live at a respawn place instead of at home. */
  relocated: { homeX: number; homeZ: number; x: number; z: number; energy: number }[];
  respawn: {
    /** Seconds until the next orb is due. */
    remainingSec: number;
    /** The respawn random stream's position (null until it has been used). */
    rng: AleaState | null;
  };
}

/** What the orb system needs to know to bring orbs back (given once the world is built). */
export interface OrbRespawnOptions {
  /** The skill tree has opened. */
  enabled: () => boolean;
  /** Shrine places: half of the respawns land near one. */
  shrines: readonly Point[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  isWalkable: (x: number, z: number) => boolean;
  /** Discs to keep clear (the village). */
  avoid?: readonly (Point & { radiusM: number })[];
}

/** An orb counts as the saved one when it sits this close (m): maps can be edited between saves. */
const RESTORE_MATCH_M = 0.5;

export interface OrbSystemContext {
  orbs: EnergyOrb[];
  update: (playerPos: Vector3, dt: number) => void;
  /** Turns the respawn rule on (it does nothing until this is called). */
  configureRespawn: (options: OrbRespawnOptions) => void;
  /** The live respawn tunables (DEV tools may change them). */
  respawnConfig: RespawnConfig;
  /** Seconds until the next orb is due. */
  respawnClock: RespawnClock;
  /** Orbs alive now. */
  liveCount: () => number;
  /** A burst of sparkles at a point (a Sign uses it); the second point is where the orb is. */
  burstAt: (origin: Vector3, playerPos: Vector3) => void;
  /** Brings one orb back now, as the rule would (false when no slot is free or no spot was found). */
  respawnOne: (playerPos: Vector3) => boolean;
  serialize: () => OrbsState;
  /** Mark the saved orbs picked up (no energy, no burst); returns how many were found on this map. */
  restore: (state: OrbsState) => number;
  dispose: () => void;
}

export function initOrbSystem(
  scene: Scene,
  terrain: MapTerrainContext,
  options: InitOrbSystemOptions,
): OrbSystemContext {
  const rng = alea(`${RNG_SEED}-orbs`);
  const organic = createOrganicOrbMaterial();
  organic.setMorphOriginMul(VISUAL.energyOrb.morphOriginMul);
  const residueLook: OrganicOrbSettings = {
    ...getLiveOrganicOrbSettings(),
    ...VISUAL.energyOrb.look,
  };
  organic.sync(residueLook);
  let residueLookRev = getOrganicOrbDevRevision();
  const orbGeometry = createOrganicOrbGeometry(ORB_RADIUS);

  const slotPlacements = options.placements;
  if (slotPlacements.length === 0) {
    throw new Error('initOrbSystem requires at least one orb placement from the map.');
  }

  const sparkles = createEnergyOrbParticles(scene, slotPlacements.length);

  /** Where each slot's orb started: a save names slots by this. */
  const homes: Point[] = slotPlacements.map((p) => ({ x: p.x, z: p.z }));
  const spawnTerrainY = new Float32Array(slotPlacements.length);
  const spawnNormalY = new Float32Array(slotPlacements.length);
  const orbs: EnergyOrb[] = [];
  for (let i = 0; i < slotPlacements.length; i++) {
    const slot = slotPlacements[i];
    const x = slot.x;
    const z = slot.z;
    const footing = sampleOrbTerrainFooting(terrain, x, z, ORB_RADIUS);
    spawnTerrainY[i] = footing.surfaceY;
    spawnNormalY[i] = footing.normalY;
    const bobPhase = rng() * Math.PI * 2;
    const authoredEnergy =
      'energy' in slot && typeof slot.energy === 'number' ? slot.energy : undefined;
    const energyValue =
      authoredEnergy ??
      PHASE0.ORB.ENERGY_MIN + Math.floor(rng() * (PHASE0.ORB.ENERGY_MAX - PHASE0.ORB.ENERGY_MIN));
    orbs.push(
      createEnergyOrb(
        scene,
        x,
        z,
        footing.surfaceY,
        bobPhase,
        energyValue,
        organic.material,
        orbGeometry,
        sparkles.burst,
        footing.normalY,
      ),
    );
  }

  let elapsed = 0;

  const respawnConfig: RespawnConfig = { ...PHASE0.RESPAWN };
  const respawnRng = alea(`${RNG_SEED}-respawn`);
  const respawnClock = newRespawnClock(respawnConfig);
  let respawnOptions: OrbRespawnOptions | null = null;

  const liveCount = () => orbs.reduce((n, o) => n + (o.absorbed ? 0 : 1), 0);

  const respawnOne = (playerPos: Vector3): boolean => {
    const opts = respawnOptions;
    if (!opts) return false;
    const free: number[] = [];
    for (let i = 0; i < orbs.length; i++) if (orbs[i]!.absorbed) free.push(i);
    if (free.length === 0) return false;
    const spot = pickRespawnSpot({
      rng: respawnRng,
      player: { x: playerPos.x, z: playerPos.z },
      liveOrbs: orbs.filter((o) => !o.absorbed).map((o) => ({ x: o.worldPos.x, z: o.worldPos.z })),
      shrines: opts.shrines,
      bounds: opts.bounds,
      isWalkable: opts.isWalkable,
      avoid: opts.avoid,
      config: respawnConfig,
    });
    if (!spot) return false;
    const slot = free[pickSlot(respawnRng, free.length)]!;
    const footing = sampleOrbTerrainFooting(terrain, spot.x, spot.z, ORB_RADIUS);
    spawnTerrainY[slot] = footing.surfaceY;
    spawnNormalY[slot] = footing.normalY;
    orbs[slot]!.respawn(
      spot.x,
      spot.z,
      footing.surfaceY,
      footing.normalY,
      respawnEnergy(respawnRng),
    );
    return true;
  };

  const update = (playerPos: Vector3, dt: number) => {
    elapsed += dt;
    const pulseScale =
      PHASE0.ORB.PULSE_BASE +
      PHASE0.ORB.PULSE_AMPLITUDE * Math.sin(elapsed * PHASE0.ORB.PULSE_SPEED);

    const lookRev = getOrganicOrbDevRevision();
    if (lookRev !== residueLookRev) {
      residueLookRev = lookRev;
      Object.assign(residueLook, getLiveOrganicOrbSettings(), VISUAL.energyOrb.look);
      organic.sync(residueLook);
    }
    sparkles.update(elapsed, playerPos);
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i]!;
      if (orb.absorbed) continue;
      orb.updateFloat(spawnTerrainY[i]!, elapsed, spawnNormalY[i]!);
      orb.updatePulse(pulseScale);
      orb.checkAbsorption(playerPos);
    }
    sparkles.syncIdle(orbs);

    if (respawnOptions) {
      const live = liveCount();
      const due = stepRespawn(respawnClock, dt, {
        open: respawnOptions.enabled(),
        live,
        free: orbs.length - live,
        config: respawnConfig,
      });
      if (due && !respawnOne(playerPos)) retrySoon(respawnClock, respawnConfig);
    }
  };

  const serialize = (): OrbsState => {
    const absorbed: OrbsState['absorbed'] = [];
    const relocated: OrbsState['relocated'] = [];
    orbs.forEach((orb, i) => {
      const home = homes[i]!;
      if (orb.absorbed) absorbed.push({ x: home.x, z: home.z });
      else if (orb.respawned) {
        relocated.push({
          homeX: home.x,
          homeZ: home.z,
          x: orb.worldPos.x,
          z: orb.worldPos.z,
          energy: orb.energyValue,
        });
      }
    });
    return {
      absorbed,
      relocated,
      respawn: { remainingSec: respawnClock.remainingSec, rng: respawnRng.exportState() },
    };
  };

  /** The slot whose home is within `RESTORE_MATCH_M` of a saved place, or -1. */
  const slotAtHome = (x: number, z: number, wantLive: boolean): number => {
    let best = -1;
    let bestSq = RESTORE_MATCH_M * RESTORE_MATCH_M;
    for (let i = 0; i < orbs.length; i++) {
      if (orbs[i]!.absorbed === wantLive) continue;
      const d = (homes[i]!.x - x) ** 2 + (homes[i]!.z - z) ** 2;
      if (d <= bestSq) {
        bestSq = d;
        best = i;
      }
    }
    return best;
  };

  const restore = (state: OrbsState): number => {
    let matched = 0;
    for (const saved of state.absorbed) {
      const i = slotAtHome(saved.x, saved.z, true);
      if (i >= 0) {
        orbs[i]!.markAbsorbed();
        matched++;
      }
    }
    for (const saved of state.relocated) {
      const i = slotAtHome(saved.homeX, saved.homeZ, true);
      if (i < 0) continue;
      const footing = sampleOrbTerrainFooting(terrain, saved.x, saved.z, ORB_RADIUS);
      spawnTerrainY[i] = footing.surfaceY;
      spawnNormalY[i] = footing.normalY;
      orbs[i]!.respawn(saved.x, saved.z, footing.surfaceY, footing.normalY, saved.energy);
      matched++;
    }
    respawnClock.remainingSec = state.respawn.remainingSec;
    if (state.respawn.rng) respawnRng.importState(state.respawn.rng);
    return matched;
  };

  const dispose = () => {
    sparkles.dispose();
    for (const orb of orbs) {
      orb.dispose();
    }
    orbGeometry.dispose();
    organic.dispose();
  };

  return {
    orbs,
    update,
    configureRespawn: (options) => {
      respawnOptions = options;
    },
    respawnConfig,
    respawnClock,
    liveCount,
    burstAt: sparkles.burst,
    respawnOne,
    serialize,
    restore,
    dispose,
  };
}
