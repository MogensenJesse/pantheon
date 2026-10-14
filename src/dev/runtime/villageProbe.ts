// src/dev/runtime/villageProbe.ts — DEV console hook: window.__pantheonVillage

import { kitLook } from '../../world/village/render/villageKitLook';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { villageDevState } from '../../world/village/villageDevState';

/**
 * Install `window.__pantheonVillage`: inspect the village and drive its time and faith from the
 * console. Returns a disposer that removes the hook.
 */
export function initVillageProbe(village: VillageSystemContext): () => void {
  const win = window as unknown as Record<string, unknown>;
  const round = (v: number) => Math.round(v * 10) / 10;

  win.__pantheonVillage = {
    stats: () => village.sim.stats(),
    buildings: () =>
      village.sim.buildings.map((b) => ({
        id: b.id,
        type: b.type,
        stage: b.stage,
        progress: round(b.progress),
        x: round(b.x),
        z: round(b.z),
        plinthM: round(b.plinthTopY - b.plinthBaseY),
      })),
    fields: () =>
      village.sim.fields.map((f) => ({
        id: f.id,
        x: round(f.x),
        z: round(f.z),
        rotY: round(f.rotY),
        halfW: f.halfW,
        halfD: f.halfD,
        growth: Math.round(f.growth * 100) / 100,
      })),
    /** Ring layout check: where each building sits against its ring and how far its door is off the temple. */
    layout: () => {
      const { sim } = village;
      const { seed, rings } = sim;
      const deg = (rad: number) => Math.round((rad * 180) / Math.PI);
      const rows = sim.buildings
        .filter((b) => b.ring >= 0)
        .map((b) => {
          const toTemple = Math.atan2(seed.x - b.x, seed.z - b.z);
          const off = Math.atan2(Math.sin(toTemple - b.rotY), Math.cos(toTemple - b.rotY));
          return {
            id: b.id,
            type: b.type,
            ring: b.ring,
            fromTempleM: round(Math.hypot(b.x - seed.x, b.z - seed.z)),
            offRingM: round(rings.nearestRing(b.x, b.z).offset),
            doorOffTempleDeg: deg(off),
          };
        });
      console.table(rows);
      const facing = rows.filter((r) => Math.abs(r.doorOffTempleDeg) <= 30).length;
      return {
        rings: sim.stats().ringCounts,
        facingTemple: `${facing}/${rows.length}`,
        network: sim.stats().network,
      };
    },
    setTimeScale: (scale: number) => {
      villageDevState.timeScale = Math.max(0, Math.min(256, scale));
    },
    forcePresence: (on: boolean) => {
      villageDevState.forcePresence = on;
    },
    /** Live look of the modelled kit: shade lift 0..1 and colour gain (no argument = read them). */
    kitLook: (look: { shade?: number; gain?: number } = {}) => {
      if (look.shade !== undefined) kitLook.shade.value = look.shade;
      if (look.gain !== undefined) kitLook.gain.value = look.gain;
      return { shade: kitLook.shade.value, gain: kitLook.gain.value };
    },
    addFaith: village.dev.addFaith,
    spawnVillagers: village.dev.spawnVillagers,
    startSite: village.dev.startSite,
    completeSites: village.dev.completeSites,
  };

  return () => {
    delete win.__pantheonVillage;
  };
}
