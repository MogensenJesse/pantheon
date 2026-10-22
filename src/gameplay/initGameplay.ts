// src/gameplay/initGameplay.ts — the gameplay systems built on the world: the conversion quest, the powers
// and their screens, energy regeneration, shrine zones and orb respawn, and what they do each fixed step
//
// `main.ts` builds the world and hands over what these need; this wires them together and returns the
// few things other parts reach for (the quest for the save, the powers for the DEV hooks).

import type { Camera, Scene } from 'three';
import { Vector3 } from 'three';
import { ABILITY_IDS, abilityById } from '../abilities/abilities';
import type { AbilityRuntime } from '../abilities/abilityRuntime';
import { type AbilityView, abilityView } from '../abilities/abilityView';
import type { CursorAim } from '../abilities/builderPowers';
import { initBuilderRuntime } from '../abilities/builderRuntime';
import type { CastResult } from '../abilities/caster';
import { createPowers, type Powers } from '../abilities/powers';
import { PHASE0 } from '../config/phase0';
import type { CameraInputContext } from '../core/CameraInput';
import { bus } from '../core/EventBus';
import { energyMeter } from '../core/energy';
import { state } from '../core/state/gameState';
import type { OrbSystemContext } from '../entities/energyOrb/orbSystem';
import { configureOrbRespawn } from '../entities/energyOrb/respawnSetup';
import { createLandmarkLights, type LandmarkLights } from '../entities/landmark/landmarkLights';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { createShrineZones, type ShrineZones } from '../entities/shrine/shrineZones';
import { createFinaleCutscene } from '../finale/cutscene';
import type { LandmarkRuntime } from '../landmarks/landmarkRuntime';
import { type AmbientLife, initAmbientLife } from '../life/ambientLife';
import type { PlaceLife } from '../life/placeLife';
import type { ShrineEntity } from '../map/MapTypes';
import { FINALE_QUEST } from '../quests/content/finale';
import { memoryBookOf } from '../quests/memoryBook';
import type { QuestsState } from '../quests/questLog';
import { initQuest, type QuestRuntime } from '../quests/questRuntime';
import type { Cinematic } from '../rendering/cinematic';
import type { SkillRuntime } from '../skills/skillRuntime';
import { initAbilityUi } from '../ui/abilities';
import { initPowerOverlay } from '../ui/overlay';
import { initQuestUi } from '../ui/quests';
import { initSkillUi } from '../ui/skills';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { templeOf } from '../world/village/model/buildings';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import type { Weather } from '../world/weather/weather';
import { type EnergyRegen, initEnergyRegen } from './energyRegen/energyRegen';
import { createVillageSkillSync } from './progression';
import { initRestoration, type RestorationRuntime } from './restoration';

export interface GameplayDeps {
  scene: Scene;
  camera: Camera;
  terrain: MapTerrainContext;
  player: PlayerControllerContext;
  lookInput: CameraInputContext;
  orbSystem: OrbSystemContext;
  shrines: readonly ShrineEntity[];
  /** The map's Phase 0 landmarks, made before the world reveal (which waits for them). */
  landmarks: LandmarkRuntime;
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
  /** The life at the places of power (made with the rest of the scene so it is compiled with it). */
  placeLife: PlaceLife;
  windDirectionDeg: number;
  /** The quests of the save being continued, if any. */
  savedQuests: QuestsState | undefined;
  /** Plays the last night's scripted view, and the overview is closed for it. */
  cinematic: Cinematic;
  closeOverview: () => void;
}

export interface Gameplay {
  /** The conversion quest; null in a village that has none (a DEV sandbox village) or without one. */
  quest: QuestRuntime | null;
  powers: Powers | null;
  landmarks: LandmarkRuntime;
  /** Starts and finishes the restoration of the places of power. */
  restoration: RestorationRuntime;
  landmarkLights: LandmarkLights;
  /** The life at the places of power, tied to the story. */
  ambientLife: AmbientLife;
  energyRegen: EnergyRegen;
  shrineZones: ShrineZones;
  abilityUi: ReturnType<typeof initAbilityUi>;
  /** The arch II powers the player has, as the overview's bar shows them; empty without a village. */
  builderList: () => AbilityView[];
  /** Casts an arch II power at what the cursor is over (the overview calls this). */
  castBuilder: (id: string, aim: CursorAim) => CastResult;
  /** Where the orb is on the ground. */
  orbPlace: () => { x: number; z: number };
  /** Plays the last night's cutscene without touching the quest (for the DEV probe); null without a finale. */
  playCutscene: ((done: () => void) => void) | null;
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

  const { landmarks } = deps;
  // The quests are the hamlet's way to a converted village (a sandbox village has none).
  const hamlet = !!village && village.sim.mode === 'hamlet';
  const nameReturned = () => quest?.isDone(FINALE_QUEST.id) ?? false;
  // The last night: a beam from each place, the rune over the temple and the cutscene that lights them.
  const temple = village ? templeOf(village.sim.buildings) : undefined;
  const finale =
    hamlet && temple
      ? createFinaleCutscene({
          parent: deps.scene,
          cinematic: deps.cinematic,
          closeOverview: deps.closeOverview,
          setLookBlocked: (blocked) => deps.lookInput.setLookBlocked(blocked),
          cameraPosition: () => deps.camera.position,
          places: landmarks.places,
          temple: { x: temple.x, z: temple.z },
          groundY: terrain.getWorldY,
          nameReturned,
        })
      : null;
  const quest =
    village && hamlet
      ? initQuest({
          initial: deps.savedQuests,
          village,
          orbPlace,
          dayPhase: village.dayPhase,
          gamePhase: () => state.phase,
          energy: energyMeter,
          grantSparks: skills.grantSparks,
          milestones: () => skills.state().milestones,
          places: {
            awake: () =>
              landmarks.places.filter((p) => landmarks.isAwake(p.kind)).map((p) => p.kind),
            allRestored: () =>
              landmarks.places.length > 0 && landmarks.restoredCount() >= landmarks.places.length,
          },
          playFinale: (done) => (finale ? finale.play(done) : done()),
        })
      : null;
  const restoration = initRestoration({ landmarks, village, orbPlace });
  const questUi = quest
    ? initQuestUi({
        objective: () => quest.objective() ?? restoration.objective(),
        book: () =>
          memoryBookOf({
            fragments: state.memoryFragments,
            places: landmarks.places,
            landmarks: landmarks.state(),
            milestones: skills.state().milestones,
            nameReturned: nameReturned(),
          }),
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
  const builder = initBuilderRuntime({
    abilities,
    village,
    weather: deps.weather,
    clock: deps.clock,
    windDirectionDeg: deps.windDirectionDeg,
  });
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
      const def = abilityById(id);
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
  configureOrbRespawn({
    orbSystem,
    terrain,
    shrines: deps.shrines,
    waterLevelM: deps.waterLevelM,
    villageSeed: deps.villageSeed,
    enabled: skills.isOpen,
  });

  const landmarkLights = createLandmarkLights({
    scene: deps.scene,
    terrain,
    landmarks,
    playerPosition: player.position,
    burstAt: orbSystem.burstAt,
  });
  const ambientLife = initAmbientLife({
    placeLife: deps.placeLife,
    landmarks,
    nameReturned,
  });
  let zoneClock = 0;
  const syncVillageSkills = createVillageSkillSync(
    skills,
    village,
    () => landmarks.restoredCount(),
    nameReturned,
  );
  return {
    quest,
    powers,
    landmarks,
    restoration,
    landmarkLights,
    ambientLife,
    energyRegen,
    shrineZones,
    abilityUi,
    builderList: builder?.list ?? (() => []),
    castBuilder: builder?.cast ?? (() => ({ ok: false, reason: 'unknown' as const })),
    orbPlace,
    playCutscene: finale ? finale.play : null,
    update: (dt) => {
      abilities.update(dt);
      if (village && powers) powers.update(dt, orbPlace(), village.dayPhase());
      quest?.update(dt);
      syncVillageSkills(dt);
      energyRegen.update(dt);
      landmarks.update(dt);
      restoration.update(dt);
      landmarkLights.update(dt);
      ambientLife.update();
      zoneClock += dt;
      shrineZones.update(zoneClock, energyRegen.inActiveZone());
    },
    dispose: () => {
      restoration.dispose();
      offVillagerDied();
      skillUi();
      questUi();
      abilityUi.dispose();
      powerOverlay();
      quest?.dispose();
      finale?.dispose();
      shrineZones.dispose();
      landmarkLights.dispose();
      ambientLife.dispose();
    },
  };
}
