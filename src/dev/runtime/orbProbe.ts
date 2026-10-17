// src/dev/runtime/orbProbe.ts — DEV console hook: window.__pantheonOrbs (orb respawn, regeneration, shrines)

import type { Vector3 } from 'three';
import type { OrbSystemContext } from '../../entities/energyOrb/orbSystem';
import type { EnergyRegen } from '../../entities/shrine/energyRegen';
import type { ShrineZones } from '../../entities/shrine/shrineZones';

export interface OrbProbeSources {
  orbSystem: OrbSystemContext;
  regen: EnergyRegen;
  zones: ShrineZones;
  playerPosition: () => Vector3;
}

/** Install `window.__pantheonOrbs`. Returns a disposer that removes the hook. */
export function initOrbProbe(src: OrbProbeSources): () => void {
  const win = window as unknown as Record<string, unknown>;
  const { orbSystem } = src;
  win.__pantheonOrbs = {
    total: () => orbSystem.orbs.length,
    liveCount: () => orbSystem.liveCount(),
    /** Where the live orbs are, and whether each is a respawned one. */
    live: () =>
      orbSystem.orbs
        .filter((o) => !o.absorbed)
        .map((o) => ({
          x: o.worldPos.x,
          z: o.worldPos.z,
          respawned: o.respawned,
          energy: o.energyValue,
        })),
    /** Mark the first `n` live orbs picked up, with no energy and no burst (to make free slots). */
    absorb: (n: number) => {
      let done = 0;
      for (const orb of orbSystem.orbs) {
        if (done >= n) break;
        if (!orb.absorbed) {
          orb.markAbsorbed();
          done++;
        }
      }
      return done;
    },
    /** Bring one orb back now, as the rule would. */
    respawnOne: () => orbSystem.respawnOne(src.playerPosition()),
    /** Seconds until the next orb is due. */
    clock: () => orbSystem.respawnClock.remainingSec,
    config: () => ({ ...orbSystem.respawnConfig }),
    /** Change the respawn interval (and restart the clock at it). */
    setInterval: (sec: number) => {
      orbSystem.respawnConfig.INTERVAL_SEC = sec;
      orbSystem.respawnClock.remainingSec = sec;
    },
    setMaxLive: (n: number) => {
      orbSystem.respawnConfig.MAX_LIVE = n;
    },
    /** Energy per second now. */
    regenRate: () => src.regen.rate(),
    inActiveZone: () => src.regen.inActiveZone(),
    zones: () => src.regen.zones.map((z) => ({ ...z })),
    ringMeshes: () => src.zones.meshes.length,
  };
  return () => {
    delete win.__pantheonOrbs;
  };
}
