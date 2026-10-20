// src/gameplay/initGameplay.ts — the gameplay systems built on the world: the conversion quest, the powers
// and their screens, energy regeneration, shrine zones and orb respawn, and what they do each fixed step
//
// `main.ts` builds the world and hands over what these need; this wires them together and returns the
// few things other parts reach for (the quest for the save, the powers for the DEV hooks).

import type { Camera, Scene } from 'three';
import { Vector3 } from 'three';
import { ABILITY_IDS } from '../abilities/abilities';
import type { AbilityRuntime } from '../abilities/abilityRuntime';
import { type AbilityView, abilityView } from '../abilities/abilityView';
import {
  type BuilderPowers,
  type CursorAim,
  createBuilderPowers,
} from '../abilities/builderPowers';
import type { CastResult } from '../abilities/caster';
import { createPowers, type Powers } from '../abilities/powers';
import { PHASE0 } from '../config/phase0';
import { WORLD } from '../config/world';
import type { CameraInputContext } from '../core/CameraInput';
import { bus } from '../core/EventBus';
import { energyMeter } from '../core/energy';
import { state } from '../core/state/gameState';
import type { OrbSystemContext } from '../entities/energyOrb/orbSystem';
import { sampleOrbTerrainFooting } from '../entities/orbTerrainFooting';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { type EnergyRegen, initEnergyRegen } from '../entities/shrine/energyRegen';
import { createShrineZones, type ShrineZones } from '../entities/shrine/shrineZones';
import type { ShrineEntity } from '../map/MapTypes';
import type { QuestState } from '../quests/quest';
import { initQuest, type QuestRuntime } from '../quests/questRuntime';
import type { SkillRuntime } from '../skills/skillRuntime';
import { initAbilityUi } from '../ui/abilities';
import { initPowerOverlay } from '../ui/overlay';
import { initQuestUi } from '../ui/quests';
import { initSkillUi } from '../ui/skills';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { templeOf } from '../world/village/model/buildings';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import type { Weather } from '../world/weather/weather';

export interface GameplayDeps {
  scene: Scene;
  camera: Camera;
  terrain: MapTerrainContext;
  player: PlayerControllerContext;
  lookInput: CameraInputContext;
  orbSystem: OrbSystemContext;
  shrines: readonly ShrineEntity[];
  /** Null when the map has no village. */
  village: VillageSystemContext | null;
  /** Where the village is (the respawn rule keeps clear of it); null without one. */
  villageSeed: { x: number; z: number; radiusM: number } | null;
  waterLevelM: number;
  skills: SkillRuntime;
  abilities: AbilityRuntime;
  /** The weather the rain powers act on, the game clock it runs on and where the cloud wind blows toward. */
  weather: Weather;
  clock: () => number;
  windDirectionDeg: number;
  /** The quest state of the save being continued, if any. */
  savedQuest: QuestState | undefined;
}

export interface Gameplay {
  /** The conversion quest; null in a village that has none (a DEV sandbox village) or without one. */
  quest: QuestRuntime | null;
  powers: Powers | null;
  energyRegen: EnergyRegen;
  shrineZones: ShrineZones;
  abilityUi: ReturnType<typeof initAbilityUi>;
  /** The arch II powers the player has, as the overview's bar shows them; empty without a village. */
  builderList: () => AbilityView[];
  /** Casts an arch II power at what the cursor is over (the overview calls this). */
  castBuilder: (id: string, aim: CursorAim) => CastResult;
  /** What the cursor would hit with an arch II power, for the hint; null when nothing fits. */
  /** Where the orb is on the ground. */
  orbPlace: () => { x: number; z: number };
  /** Once per fixed step. */
  update: (dt: number) => void;
  dispose: () => void;
}

export function initGameplay(deps: GameplayDeps): Gameplay {
  const { village, skills, abilities, player, orbSystem, terrain } = deps;
  const orbPlace = () => ({ x: player.position.x, z: player.position.z });

  const skillUi = initSkillUi({
    state: skills.state,
    unlock: skills.unlock,
    respec: skills.respec,
  });

  // The conversion quest is the hamlet's way to a converted village (a sandbox village has none).
  const quest =
    village && village.sim.mode === 'hamlet'
      ? initQuest({
          initial: deps.savedQuest,
          village,
          orbPlace,
          dayPhase: village.dayPhase,
          gamePhase: () => state.phase,
          energy: energyMeter,
          grantSparks: skills.grantSparks,
        })
      : null;
  const questUi = quest
    ? initQuestUi({
        objective: quest.objective,
        journal: quest.journal,
      })
    : () => {};

  // The conversion powers act on the village through its belief and its villagers.
  const powers = village
    ? createPowers(
        {
          villagers: village.sim.villagers,
          buildings: village.sim.buildings,
          addBelief: village.addBelief,
          notice: village.notice,
          canBelieve: (i) => quest?.canBelieve(i) ?? true,
        },
        energyMeter,
      )
    : null;
  // A villager who dies leaves the pool and the last one takes their slot: a channel follows or ends.
  const offVillagerDied = bus.on('village:villagerDied', ({ villager, moved }) =>
    powers?.murmur.villagerRemoved(villager, moved),
  );
  const signOrigin = new Vector3();
  // The arch II powers act on the village and the weather, paid in the village's faith.
  const builder: BuilderPowers | null = village
    ? createBuilderPowers({
        fields: village.sim.fields,
        buildings: village.sim.buildings,
        forest: village.sim.forest,
        bless: village.bless,
        kindle: village.kindle,
        provide: village.provide,
        weather: deps.weather,
        clock: deps.clock,
        windDirectionDeg: deps.windDirectionDeg,
      })
    : null;
  if (village) {
    abilities.setFaith({
      amount: () => village.sim.faith.faith,
      spend: (amount) => village.addFaith(-amount),
    });
  }
  if (powers) {
    abilities.setPerformer((def, target) => {
      if (def.arch === 'village') return builder?.perform(def, target) ?? false;
      const ok = powers.perform(def, target, orbPlace());
      // A sign shines: sparkles burst where the orb is.
      if (ok && def.id === ABILITY_IDS.sign) {
        signOrigin.set(
          player.position.x,
          player.position.y + PHASE0.POWERS.SIGN.SPARKLE_HEIGHT_M,
          player.position.z,
        );
        orbSystem.burstAt(signOrigin, player.position);
      }
      return ok;
    });
  }
  const builderList = (): AbilityView[] =>
    abilities.defs
      .filter((def) => def.arch === 'village' && abilities.isGranted(def.id))
      .map((def) => abilityView(def, abilities.status(def.id)));
  const castBuilder = (id: string, aim: CursorAim): CastResult => {
    const def = abilities.defs.find((d) => d.id === id);
    if (!def || !builder) return { ok: false, reason: 'unknown' };
    return abilities.cast(id, builder.resolveTarget(def, aim));
  };
  const abilityUi = initAbilityUi({
    list: () =>
      abilities.defs
        .filter((def) => def.arch === 'void' && abilities.isGranted(def.id))
        .map((def) =>
          abilityView(
            def,
            abilities.status(def.id),
            def.id === ABILITY_IDS.murmur && !!powers?.murmur.active(),
          ),
        ),
    // What a power reaches is decided where the orb is now: the nearest villager, house or place.
    cast: (id) => {
      const def = abilities.defs.find((d) => d.id === id);
      if (!def) return abilities.cast(id, { kind: 'cursor', ...orbPlace() });
      const target = powers?.resolveTarget(def, orbPlace()) ?? {
        kind: def.targeting,
        ...orbPlace(),
      };
      return abilities.cast(id, target);
    },
    setLookBlocked: (blocked) => deps.lookInput.setLookBlocked(blocked),
  });
  const powerOverlay =
    village && powers
      ? initPowerOverlay({
          camera: deps.camera,
          villagers: village.sim.villagers,
          buildings: village.sim.buildings,
          orbPosition: orbPlace,
          groundY: (x, z) => terrain.getWorldY(x, z),
          pipRangeM: PHASE0.POWERS.PIP_RANGE_M,
          murmurTarget: () =>
            abilities.isGranted(ABILITY_IDS.murmur) ? powers.murmurTarget(orbPlace()) : -1,
          murmurActive: () => powers.murmur.active(),
          dreamTarget: () =>
            abilities.isGranted(ABILITY_IDS.dream) ? powers.dreamTarget(orbPlace()) : -1,
          elder: quest
            ? { index: quest.elder, met: quest.elderMet, rangeM: PHASE0.QUEST.ELDER_PIP_RANGE_M }
            : undefined,
        })
      : () => {};

  // Energy comes back inside shrine zones (with Attunement) and slowly anywhere (Renewal); picked-up
  // orbs return once the tree has opened. Both read the skill modifiers, so neither does anything early.
  const energyRegen = initEnergyRegen(
    deps.shrines,
    () => player.position,
    village
      ? {
          temple: () => templeOf(village.sim.buildings) ?? null,
          believers: () => village.sim.believers(),
        }
      : null,
  );
  const shrineZones = createShrineZones(deps.scene, terrain, energyRegen.zones);
  const place = PHASE0.RESPAWN_PLACE;
  const half = WORLD.SIZE * PHASE0.PLAYER.WORLD_CLAMP_MARGIN * place.EDGE_SHARE;
  orbSystem.configureRespawn({
    enabled: skills.isOpen,
    shrines: deps.shrines.map((s) => ({ x: s.x, z: s.z })),
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    // Open, gently sloping land above the water; the village keeps its own ground clear.
    isWalkable: (x, z) => {
      const footing = sampleOrbTerrainFooting(terrain, x, z, PHASE0.ORB.ENERGY_RADIUS);
      return (
        footing.surfaceY > deps.waterLevelM + place.WATER_CLEARANCE_M &&
        footing.normalY >= place.MIN_NORMAL_Y
      );
    },
    avoid: deps.villageSeed
      ? [
          {
            x: deps.villageSeed.x,
            z: deps.villageSeed.z,
            radiusM: deps.villageSeed.radiusM + place.VILLAGE_CLEARANCE_M,
          },
        ]
      : [],
  });

  let zoneClock = 0;
  let villageSync = 0;
  return {
    quest,
    powers,
    energyRegen,
    shrineZones,
    abilityUi,
    builderList,
    castBuilder,
    orbPlace,
    update: (dt) => {
      abilities.update(dt);
      if (village && powers) powers.update(dt, orbPlace(), village.dayPhase());
      quest?.update(dt);
      // Arch II opens, and gives sparks, as the converted village earns faith.
      villageSync += dt;
      if (village && villageSync >= 1) {
        villageSync = 0;
        skills.syncVillage({
          converted: village.sim.converted,
          faithEarned: village.sim.faith.earned,
        });
      }
      energyRegen.update(dt);
      zoneClock += dt;
      shrineZones.update(zoneClock, energyRegen.inActiveZone());
    },
    dispose: () => {
      offVillagerDied();
      skillUi();
      questUi();
      abilityUi.dispose();
      powerOverlay();
      quest?.dispose();
      shrineZones.dispose();
    },
  };
}
