// src/dev/runtime/installProbes.ts — installs every DEV console hook (window.__pantheon*) at once
//
// Loaded with a dynamic import under `import.meta.env.DEV`, so none of it ships. Returns one teardown.

import type { DirectionalLight, Vector3 } from 'three';
import type { OrbSystemContext } from '../../entities/energyOrb/orbSystem';
import type { Gameplay } from '../../gameplay/initGameplay';
import type { BootRestore } from '../../save/bootSave';
import type { SaveService } from '../../save/saveService';
import type { Saving } from '../../save/setupSaving';
import type { SkillRuntime } from '../../skills/skillRuntime';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { initOrbProbe } from './orbProbe';
import { initPowersProbe } from './powersProbe';
import { initQuestProbe } from './questProbe';
import { initSaveProbe } from './saveProbe';
import { initShadowProbes } from './shadowProbes';
import { initSkillsProbe } from './skillsProbe';
import { initVillageProbe } from './villageProbe';

export interface ProbeSources {
  gameplay: Gameplay;
  saving: Saving;
  saveService: SaveService;
  restored: BootRestore | null;
  autosaving: boolean;
  skills: SkillRuntime;
  orbSystem: OrbSystemContext;
  /** Null when the map has no village. */
  village: VillageSystemContext | null;
  sun: DirectionalLight;
  playerPosition: Vector3;
  getWorldY: (x: number, z: number) => number;
  getYaw: () => number;
}

export function installProbes(src: ProbeSources): () => void {
  const { gameplay, village } = src;
  const win = window as unknown as Record<string, unknown>;
  // Console teleport for checking distant spots (`__pantheonTeleport(x, z)`).
  win.__pantheonTeleport = (x: number, z: number) => {
    src.playerPosition.x = x;
    src.playerPosition.z = z;
  };
  const disposers: (() => void)[] = [
    () => {
      delete win.__pantheonTeleport;
    },
    initShadowProbes({
      getWorldY: src.getWorldY,
      sun: src.sun,
      getPlayerPosition: () => src.playerPosition,
    }),
    initSaveProbe({
      service: src.saveService,
      saver: src.saving.saver,
      capture: src.saving.capture,
      restored: src.restored,
      autosaving: src.autosaving,
      pauseMenu: src.saving.pauseMenu,
    }),
    initOrbProbe({
      orbSystem: src.orbSystem,
      regen: gameplay.energyRegen,
      zones: gameplay.shrineZones,
      playerPosition: () => src.playerPosition,
    }),
    initSkillsProbe(src.skills, {
      getYaw: src.getYaw,
      radialOpen: gameplay.abilityUi.isOpen,
    }),
  ];
  if (village) {
    disposers.push(initVillageProbe(village));
    if (gameplay.powers) {
      disposers.push(
        initPowersProbe({ powers: gameplay.powers, sim: village.sim, orbPlace: gameplay.orbPlace }),
      );
    }
    if (gameplay.quest) {
      disposers.push(initQuestProbe({ quest: gameplay.quest, sim: village.sim }));
    }
  }
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}
