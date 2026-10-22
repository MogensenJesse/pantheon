// src/save/profile.ts — the player's and the world's state in a save (the snapshot's `profile`)
// (pure: no DOM, node-runnable; the game modules are only imported for their types)

import type { FrameClocks } from '../core/gameTick';
import { isCount, isCountInt, isNum, isRecord } from '../core/guards.ts';
import { type DayCycleState, parseDayCycle } from '../core/reveal/dayCycleState.ts';
import type { GameState } from '../core/state/gameState';
import { type OrbsState, parseOrbs } from '../entities/energyOrb/orbState.ts';
import { type LandmarkState, parseLandmarks } from '../landmarks/landmarks.ts';
import { parseQuests, type QuestsState } from '../quests/questLog.ts';
import { QUESTS } from '../quests/registry.ts';
import { parseSkills, type SkillsState } from '../skills/skillTree.ts';
import { type ForcedWeather, forcedWeatherProblem } from '../world/weather/weather.ts';

/** What the arch II powers leave running: cooldowns still counting down, and the storms and clear skies they made. */
export type PowersState = {
  cooldowns: [string, number][];
  weather: ForcedWeather;
};

/**
 * Everything outside the village that decides what the player comes back to. Loading starts the game
 * over with this state (the page boots from the save), so each part is applied while the game builds:
 * the game state first, the player and camera at their starting pose, the orbs after the world, the
 * day cycle after it exists, and the clocks when the frame tick is made.
 */
export type ProfileState = {
  /** All of `GameState`, so a new field is a compile error in `parseProfile` and is copied without being listed. */
  game: GameState;
  dayCycle: DayCycleState;
  /** Where the orb is; its height follows the ground. */
  player: { x: number; z: number };
  camera: { yaw: number; pitch: number };
  orbs: OrbsState;
  clocks: FrameClocks;
  /** Sparks and the ranks taken in the skill tree. */
  skills: SkillsState;
  /** The quests that have begun: where each stands and which story beats it showed. */
  quests: QuestsState;
  powers: PowersState;
  /** The Phase 0 landmarks that are awake, in the order they were woken. */
  landmarks: LandmarkState;
};

export interface ProfileSources {
  game: GameState;
  dayCycle: { serialize: () => DayCycleState };
  player: { position: { x: number; z: number } };
  camera: { getYaw: () => number; getPitch: () => number };
  orbs: { serialize: () => OrbsState };
  clocks: () => FrameClocks;
  skills: { state: () => SkillsState };
  quests: { state: () => QuestsState };
  powers: { state: () => PowersState };
  landmarks: { state: () => LandmarkState };
}

/** A copy of the current state, safe to keep while the game runs on. */
export function captureProfile(src: ProfileSources): ProfileState {
  const { game } = src;
  return {
    game: { ...game, memoryFragments: [...game.memoryFragments] },
    dayCycle: src.dayCycle.serialize(),
    player: { x: src.player.position.x, z: src.player.position.z },
    camera: { yaw: src.camera.getYaw(), pitch: src.camera.getPitch() },
    orbs: src.orbs.serialize(),
    clocks: { ...src.clocks() },
    skills: src.skills.state(),
    quests: src.quests.state(),
    powers: src.powers.state(),
    landmarks: src.landmarks.state(),
  };
}

/** Put the saved game state into the live one, in place (other modules hold the same object). */
export function applyGameProfile(target: GameState, saved: GameState): void {
  const { memoryFragments, ...scalars } = saved;
  Object.assign(target, scalars);
  target.memoryFragments.length = 0;
  target.memoryFragments.push(...memoryFragments);
}

export type ParsedProfile = { ok: true; profile: ProfileState } | { ok: false; message: string };

const bad = (what: string): ParsedProfile => ({
  ok: false,
  message: `The save's ${what} is damaged.`,
});

/** Accepts a stored profile or says which part is wrong; nothing is applied from a profile that fails. */
export function parseProfile(raw: unknown): ParsedProfile {
  if (!isRecord(raw)) return bad('player data');
  const { game, dayCycle, player, camera, orbs, clocks, skills, quests, powers, landmarks } = raw;

  if (!isRecord(game)) return bad('game state');
  if (
    !isCount(game.energy) ||
    !isNum(game.energyCap) ||
    game.energyCap <= 0 ||
    game.energy > game.energyCap ||
    !isCountInt(game.orbsAbsorbed) ||
    !isCountInt(game.phase) ||
    !Array.isArray(game.memoryFragments) ||
    !game.memoryFragments.every(isNum)
  ) {
    return bad('game state');
  }

  const parsedDayCycle = parseDayCycle(dayCycle);
  if (!parsedDayCycle) return bad('day cycle');
  if (!isRecord(player) || !isNum(player.x) || !isNum(player.z)) return bad('player position');
  if (!isRecord(camera) || !isNum(camera.yaw) || !isNum(camera.pitch)) return bad('camera');

  const parsedOrbs = parseOrbs(orbs);
  if (!parsedOrbs) return bad('orbs');
  if (!isRecord(clocks) || !isCount(clocks.elapsed) || !isCount(clocks.windClock)) {
    return bad('clocks');
  }

  const parsedSkills = parseSkills(skills);
  if (!parsedSkills.ok) return { ok: false, message: parsedSkills.message };
  const parsedQuests = parseQuests(quests, QUESTS);
  if (!parsedQuests.ok) return { ok: false, message: parsedQuests.message };
  if (!isRecord(powers) || !Array.isArray(powers.cooldowns)) return bad('powers');
  const cooldownsOk = powers.cooldowns.every(
    (c) => Array.isArray(c) && c.length === 2 && typeof c[0] === 'string' && isCount(c[1]),
  );
  if (!cooldownsOk || forcedWeatherProblem(powers.weather)) return bad('powers');

  const parsedLandmarks = parseLandmarks(landmarks);
  if (!parsedLandmarks.ok) return { ok: false, message: parsedLandmarks.message };

  return {
    ok: true,
    profile: {
      game: {
        energy: game.energy,
        energyCap: game.energyCap,
        orbsAbsorbed: game.orbsAbsorbed,
        phase: game.phase,
        memoryFragments: [...(game.memoryFragments as number[])],
      },
      dayCycle: parsedDayCycle,
      player: { x: player.x, z: player.z },
      camera: { yaw: camera.yaw, pitch: camera.pitch },
      orbs: parsedOrbs,
      clocks: { elapsed: clocks.elapsed, windClock: clocks.windClock },
      skills: parsedSkills.skills,
      quests: parsedQuests.quests,
      powers: {
        cooldowns: (powers.cooldowns as [string, number][]).map(([id, left]) => [id, left]),
        weather: powers.weather as ForcedWeather,
      },
      landmarks: parsedLandmarks.landmarks,
    },
  };
}
