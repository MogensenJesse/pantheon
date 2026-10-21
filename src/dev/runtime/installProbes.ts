// src/dev/runtime/installProbes.ts — installs every DEV console hook (window.__pantheon*) at once
//
// Loaded with a dynamic import under `import.meta.env.DEV`, so none of it ships. Returns one teardown.

import type { DirectionalLight, Vector3 } from 'three';
import type { OrbSystemContext } from '../../entities/energyOrb/orbSystem';
import type { Gameplay } from '../../gameplay/initGameplay';
import type { Saving } from '../../gameplay/setupSaving';
import type { Overview } from '../../overview/overviewController';
import type { BootRestore } from '../../save/bootSave';
import type { SaveService } from '../../save/saveService';
import type { SkillRuntime } from '../../skills/skillRuntime';
import type { OverviewUi } from '../../ui/overview/overviewUi';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { forceRain } from '../../world/village/villageDevState';
import type { Weather } from '../../world/weather/weather';
import { installDevHook } from './devHook';
import { initOrbProbe } from './orbProbe';
import { initPowersProbe } from './powersProbe';
import { initQuestProbe } from './questProbe';
import { initSaveProbe } from './saveProbe';
import { initShadowProbes } from './shadowProbes';
import { initSkillsProbe } from './skillsProbe';
import { initVillageProbe } from './villageProbe';
import { initWeatherProbe } from './weatherProbe';

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
  /** The storm fronts, and the game clock they run on. */
  weather: Weather;
  clock: () => number;
  overview: Overview;
  /** Null when the map has no village. */
  overviewUi: OverviewUi | null;
  sun: DirectionalLight;
  playerPosition: Vector3;
  getWorldY: (x: number, z: number) => number;
  getYaw: () => number;
}

export function installProbes(src: ProbeSources): () => void {
  const { gameplay, village } = src;
  const disposers: (() => void)[] = [
    // Console teleport for checking distant spots (`__pantheonTeleport(x, z)`).
    installDevHook('__pantheonTeleport', (x: number, z: number) => {
      src.playerPosition.x = x;
      src.playerPosition.z = z;
    }),
    // The village overview: `__pantheonOverview.debug()`, `.setActive(true, true)` (true skips the temple rule).
    installDevHook('__pantheonOverview', {
      debug: () => src.overview.debug(),
      setActive: (active: boolean, force = false) => src.overview.setActive(active, force),
      toggle: () => src.overview.toggle(),
      focusOn: (x: number, z: number) => src.overview.focusOn(x, z),
      /** M3b: what is selected and hovered, `select('villager'|'building'|'field', idOrIndex)`, and where a thing is on screen. */
      selection: () => src.overviewUi?.selection() ?? null,
      hovered: () => src.overviewUi?.hovered() ?? null,
      select: (kind: 'villager' | 'building' | 'field' | null, id = 0) =>
        src.overviewUi?.select(
          kind === null ? null : kind === 'villager' ? { kind, index: id } : { kind, id },
        ),
      screenOf: (kind: 'villager' | 'building' | 'field', id: number) =>
        src.overviewUi?.screenOf(kind === 'villager' ? { kind, index: id } : { kind, id }) ?? null,
    }),
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
  disposers.push(
    initWeatherProbe({
      weather: src.weather,
      clock: src.clock,
      position: () => src.playerPosition,
      forceVillageRain: forceRain,
    }),
  );
  if (village) {
    disposers.push(initVillageProbe(village));
    if (gameplay.powers) {
      disposers.push(
        initPowersProbe({
          powers: gameplay.powers,
          sim: village.sim,
          orbPlace: gameplay.orbPlace,
          builderList: gameplay.builderList,
          castBuilder: gameplay.castBuilder,
        }),
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
