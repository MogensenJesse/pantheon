// src/dev/runtime/villageProbe.ts — DEV console hook: window.__pantheonVillage

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
    setTimeScale: (scale: number) => {
      villageDevState.timeScale = Math.max(0, Math.min(256, scale));
    },
    forcePresence: (on: boolean) => {
      villageDevState.forcePresence = on;
    },
    addFaith: village.dev.addFaith,
    startSite: village.dev.startSite,
    completeSites: village.dev.completeSites,
  };

  return () => {
    delete win.__pantheonVillage;
  };
}
