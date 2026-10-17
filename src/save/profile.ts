// src/save/profile.ts — the player's and the world's state in a save (the snapshot's `profile`)
// (pure: no DOM, node-runnable; the game modules are only imported for their types)

import type { FrameClocks } from '../core/gameTick';
import type { DayCycleState } from '../core/reveal/DayCycle';
import type { GameState } from '../core/state/gameState';
import type { OrbsState } from '../entities/energyOrb/orbSystem';
import { parseSkills, type SkillsState } from '../skills/skillTree.ts';

/** The slice of `GameState` that a save keeps (all of it today). */
export type GameProfile = Pick<
  GameState,
  'energy' | 'energyCap' | 'orbsAbsorbed' | 'phase' | 'memoryFragments'
>;

/**
 * Everything outside the village that decides what the player comes back to. Loading starts the game
 * over with this state (the page boots from the save), so each part is applied while the game builds:
 * the game state first, the player and camera at their starting pose, the orbs after the world, the
 * day cycle after it exists, and the clocks when the frame tick is made.
 */
export type ProfileState = {
  game: GameProfile;
  dayCycle: DayCycleState;
  /** Where the orb is; its height follows the ground. */
  player: { x: number; z: number };
  camera: { yaw: number; pitch: number };
  orbs: OrbsState;
  clocks: FrameClocks;
  /** Sparks and the ranks taken in the skill tree. */
  skills: SkillsState;
};

export interface ProfileSources {
  game: GameProfile;
  dayCycle: { serialize: () => DayCycleState };
  player: { position: { x: number; z: number } };
  camera: { getYaw: () => number; getPitch: () => number };
  orbs: { serialize: () => OrbsState };
  clocks: () => FrameClocks;
  skills: { state: () => SkillsState };
}

/** A copy of the current state, safe to keep while the game runs on. */
export function captureProfile(src: ProfileSources): ProfileState {
  const { game } = src;
  return {
    game: {
      energy: game.energy,
      energyCap: game.energyCap,
      orbsAbsorbed: game.orbsAbsorbed,
      phase: game.phase,
      memoryFragments: [...game.memoryFragments],
    },
    dayCycle: src.dayCycle.serialize(),
    player: { x: src.player.position.x, z: src.player.position.z },
    camera: { yaw: src.camera.getYaw(), pitch: src.camera.getPitch() },
    orbs: src.orbs.serialize(),
    clocks: { ...src.clocks() },
    skills: src.skills.state(),
  };
}

/** Put the saved game state into the live one, in place (other modules hold the same object). */
export function applyGameProfile(target: GameProfile, saved: GameProfile): void {
  target.energy = saved.energy;
  target.energyCap = saved.energyCap;
  target.orbsAbsorbed = saved.orbsAbsorbed;
  target.phase = saved.phase;
  target.memoryFragments.length = 0;
  target.memoryFragments.push(...saved.memoryFragments);
}

export type ParsedProfile = { ok: true; profile: ProfileState } | { ok: false; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNum(v) && v >= 0;
const REVEAL = ['idle', 'sunrise', 'looping'] as const;

const bad = (what: string): ParsedProfile => ({
  ok: false,
  message: `The save's ${what} is damaged.`,
});

/** Accepts a stored profile or says which part is wrong; nothing is applied from a profile that fails. */
export function parseProfile(raw: unknown): ParsedProfile {
  if (!isRecord(raw)) return bad('player data');
  const { game, dayCycle, player, camera, orbs, clocks, skills } = raw;

  if (!isRecord(game)) return bad('game state');
  if (
    !isCount(game.energy) ||
    !isNum(game.energyCap) ||
    game.energyCap <= 0 ||
    game.energy > game.energyCap ||
    !isCount(game.orbsAbsorbed) ||
    !Number.isInteger(game.orbsAbsorbed) ||
    !isCount(game.phase) ||
    !Number.isInteger(game.phase) ||
    !Array.isArray(game.memoryFragments) ||
    !game.memoryFragments.every(isNum)
  ) {
    return bad('game state');
  }

  if (
    !isRecord(dayCycle) ||
    !(REVEAL as readonly unknown[]).includes(dayCycle.reveal) ||
    !isCount(dayCycle.introElapsed) ||
    !isCount(dayCycle.elapsed)
  ) {
    return bad('day cycle');
  }
  if (!isRecord(player) || !isNum(player.x) || !isNum(player.z)) return bad('player position');
  if (!isRecord(camera) || !isNum(camera.yaw) || !isNum(camera.pitch)) return bad('camera');

  if (
    !isRecord(orbs) ||
    !Array.isArray(orbs.absorbed) ||
    !orbs.absorbed.every((o) => isRecord(o) && isNum(o.x) && isNum(o.z))
  ) {
    return bad('orbs');
  }
  if (!isRecord(clocks) || !isCount(clocks.elapsed) || !isCount(clocks.windClock)) {
    return bad('clocks');
  }

  const parsedSkills = parseSkills(skills);
  if (!parsedSkills.ok) return { ok: false, message: parsedSkills.message };

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
      dayCycle: {
        reveal: dayCycle.reveal as DayCycleState['reveal'],
        introElapsed: dayCycle.introElapsed,
        elapsed: dayCycle.elapsed,
      },
      player: { x: player.x, z: player.z },
      camera: { yaw: camera.yaw, pitch: camera.pitch },
      orbs: {
        absorbed: (orbs.absorbed as { x: number; z: number }[]).map((o) => ({ x: o.x, z: o.z })),
      },
      clocks: { elapsed: clocks.elapsed, windClock: clocks.windClock },
      skills: parsedSkills.skills,
    },
  };
}

/** Game days played, from the world clock (a day is one turn of the sun). */
export function dayOf(elapsedSec: number, dayDurationSec: number): number {
  return dayDurationSec > 0 ? Math.floor(elapsedSec / dayDurationSec) + 1 : 1;
}
