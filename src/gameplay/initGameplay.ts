// src/gameplay/initGameplay.ts — the gameplay systems built on the world: the conversion quest, the orb's
// hand, the village powers, energy regeneration, shrine zones and orb respawn, and what they do each fixed step
//
// `main.ts` builds the world and hands over what these need; this wires them together and returns the
// few things other parts reach for (the quest for the save, the hand and the powers for the DEV hooks).

import type { Camera, Scene } from 'three';
import { Vector3 } from 'three';
import type { AbilityRuntime } from '../abilities/abilityRuntime';
import type { AbilityView } from '../abilities/abilityView';
import type { CursorAim } from '../abilities/builderPowers';
import { initBuilderRuntime } from '../abilities/builderRuntime';
import type { CastResult } from '../abilities/caster';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visual';
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
import { createHandRuntime, type HandRuntime } from '../hand/handRuntime';
import type { LandmarkRuntime } from '../landmarks/landmarkRuntime';
import type { AnimalHand } from '../life/animals/animals';
import { type AmbientLife, createAmbientLife } from '../life/places/ambientLife';
import type { PlaceLife } from '../life/places/placeLife';
import type { ShrineEntity } from '../map/MapTypes';
import { FINALE_QUEST } from '../quests/content/finale';
import { memoryBookOf } from '../quests/memoryBook';
import type { QuestsState } from '../quests/questLog';
import { initQuest, type QuestRuntime } from '../quests/questRuntime';
import type { Cinematic } from '../rendering/cinematic';
import { modifiers } from '../skills/modifiers';
import type { SkillRuntime } from '../skills/skillRuntime';
import { type HandUi, initHandUi } from '../ui/hand/handUi';
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
  /** The village overview is open (it owns the orb, so the roam hand rests). */
  overviewActive: () => boolean;
  /** The farm's sheep, which the hand can lift. */
  animalHand: AnimalHand;
}

export interface Gameplay {
  /** The conversion quest; null in a village that has none (a DEV sandbox village) or without one. */
  quest: QuestRuntime | null;
  /** The orb's hand; null without a village. */
  handRuntime: HandRuntime | null;
  hand: HandUi | null;
  landmarks: LandmarkRuntime;
  /** Starts and finishes the restoration of the places of power. */
  restoration: RestorationRuntime;
  landmarkLights: LandmarkLights;
  /** The life at the places of power, tied to the story. */
  ambientLife: AmbientLife;
  energyRegen: EnergyRegen;
  shrineZones: ShrineZones;
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
  // The hand is built below, after the quest it asks about the elder; the finale sets down what it holds.
  let hand: HandUi | null = null;
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
          playFinale: (done) => {
            hand?.cancel();
            if (finale) finale.play(done);
            else done();
          },
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

  // The roam hand shows and answers its key while the skill tree is open and nothing else owns the orb.
  const roamHandOn = () => skills.isOpen() && !deps.overviewActive() && !deps.cinematic.isPlaying();
  // The hand lifts and puts down; villagers believe because they see it done.
  const handRuntime = village
    ? createHandRuntime({
        energy: energyMeter,
        orb: orbPlace,
        village,
        animals: {
          sheepWithin: deps.animalHand.sheepWithin,
          lift: deps.animalHand.lift,
          pose: deps.animalHand.hold,
          release: deps.animalHand.release,
          holding: deps.animalHand.holding,
        },
        deeds: {
          villagers: village.sim.villagers,
          addBelief: village.addBelief,
          notice: village.notice,
          canBelieve: (i) => quest?.canBelieve(i) ?? true,
        },
        reachMul: () => modifiers.handReachMul,
        costMul: () => modifiers.handCostMul,
        // The overview is not a block: the hand works there too, and what it holds is kept across the toggle.
        blocked: deps.cinematic.isPlaying,
        active: roamHandOn,
      })
    : null;
  const burstOrigin = new Vector3();
  hand = handRuntime
    ? initHandUi({
        runtime: handRuntime,
        camera: deps.camera,
        groundY: (x, z) => terrain.getWorldY(x, z),
        enabled: roamHandOn,
        onDelivered: (delivery, at) => {
          bus.emit('hand:delivered', delivery);
          // Sparkles burst at the orb, or where the overview's cursor put it down.
          const x = at?.x ?? player.position.x;
          const z = at?.z ?? player.position.z;
          const y = at ? terrain.getWorldY(x, z) : player.position.y;
          burstOrigin.set(x, y + VISUAL.hand.BURST_HEIGHT_M, z);
          orbSystem.burstAt(burstOrigin, player.position);
        },
      })
    : null;
  // A villager who dies leaves the pool and the last one takes their slot: a deed's cooldown follows.
  const offVillagerDied = bus.on('village:villagerDied', ({ villager, moved }) => {
    handRuntime?.villagerRemoved(villager, moved);
  });
  // The arch II powers act on the village and the weather, paid in the village's faith.
  const builder = initBuilderRuntime({
    abilities,
    village,
    weather: deps.weather,
    clock: deps.clock,
    windDirectionDeg: deps.windDirectionDeg,
  });
  // Casting anything is done by the village powers: without a village there is nothing to cast.
  if (village) abilities.setPerformer((def, target) => builder?.perform(def, target) ?? false);
  const powerOverlay = village
    ? initPowerOverlay({
        camera: deps.camera,
        villagers: village.sim.villagers,
        orbPosition: orbPlace,
        groundY: (x, z) => terrain.getWorldY(x, z),
        pipRangeM: PHASE0.PIPS.PIP_RANGE_M,
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
  const ambientLife = createAmbientLife({
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
    handRuntime,
    hand,
    landmarks,
    restoration,
    landmarkLights,
    ambientLife,
    energyRegen,
    shrineZones,
    builderList: builder?.list ?? (() => []),
    castBuilder: builder?.cast ?? (() => ({ ok: false, reason: 'unknown' as const })),
    orbPlace,
    playCutscene: finale ? finale.play : null,
    update: (dt) => {
      abilities.update(dt);
      hand?.update(dt);
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
      hand?.dispose();
      restoration.dispose();
      offVillagerDied();
      skillUi();
      questUi();
      powerOverlay();
      quest?.dispose();
      finale?.dispose();
      shrineZones.dispose();
      landmarkLights.dispose();
      ambientLife.dispose();
    },
  };
}
