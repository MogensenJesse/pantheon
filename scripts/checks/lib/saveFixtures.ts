// scripts/checks/lib/saveFixtures.ts — stand-ins for the game's save sources and a valid stored profile,
// shared by the check scripts that touch saves

import { GAME_DAY_S } from '../../../src/config/clock.ts';
import type { GameSaveSources } from '../../../src/save/gameSave.ts';
import type { ProfileSources } from '../../../src/save/profile.ts';

/** Stand-ins for what the running game hands to `captureProfile` (override any part). */
export const fakeSources = (over: Partial<ProfileSources> = {}): ProfileSources => ({
  game: { energy: 40, energyCap: 100, orbsAbsorbed: 3, phase: 0, memoryFragments: [1, 2] },
  dayCycle: { serialize: () => ({ reveal: 'looping', introElapsed: 12, elapsed: 345.5 }) },
  player: { position: { x: 10.5, z: -20.25 } },
  camera: { getYaw: () => 1.25, getPitch: () => 0.4 },
  orbs: {
    serialize: () => ({
      absorbed: [{ x: 1, z: 2 }],
      relocated: [{ homeX: 5, homeZ: 6, x: 7, z: 8, energy: 4 }],
      respawn: { remainingSec: 100, rng: [0.1, 0.2, 0.3, 4] },
    }),
  },
  skills: {
    state: () => ({
      opened: true,
      sparks: 1,
      ranks: { resonance: 1 },
      villageOpened: false,
      faithSparks: 0,
    }),
  },
  quest: { state: () => ({ step: 1, progress: 2, done: false, beats: ['elder-meets'] }) },
  landmarks: {
    state: () => ({ awakened: ['tree', 'monolith'], restoration: { tree: 'inProgress' } }),
  },
  powers: {
    state: () => ({
      cooldowns: [['kindle', 12.5]],
      weather: {
        fronts: [{ x: 1, z: 2, dirX: -1, dirZ: 0, speed: 1, radius: 700, peak: 1, crossS: 4000 }],
        zones: [{ x: 3, z: 4, radius: 1200, edgeM: 225, fromS: 4000, untilS: 4600 }],
      },
    }),
  },
  clocks: () => ({ elapsed: 5000, windClock: 4900.5 }),
  ...over,
});

/** Stand-ins for everything `captureGame` reads (no village unless given). */
export const fakeGame = (over: Partial<GameSaveSources> = {}): GameSaveSources => ({
  ...fakeSources(),
  village: null,
  dayDurationSec: () => GAME_DAY_S,
  playSeconds: () => 99.5,
  ...over,
});

/**
 * A valid stored profile as plain data (what `parseProfile` accepts). `over` replaces whole parts; a
 * part set to `undefined` is removed, to try a profile without it.
 */
export function rawProfile(over: Record<string, unknown> = {}): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    game: { energy: 50, energyCap: 100, orbsAbsorbed: 3, phase: 1, memoryFragments: [] },
    dayCycle: { reveal: 'looping', introElapsed: 5, elapsed: 100 },
    player: { x: 1, z: 2 },
    camera: { yaw: 0, pitch: 0.4 },
    orbs: { absorbed: [{ x: 1, z: 2 }], relocated: [], respawn: { remainingSec: 200, rng: null } },
    clocks: { elapsed: 100, windClock: 100 },
    skills: { opened: true, sparks: 2, ranks: {}, villageOpened: false, faithSparks: 0 },
    quest: { step: 0, progress: 0, done: false, beats: [] },
    landmarks: { awakened: ['tree'], restoration: {} },
    powers: { cooldowns: [], weather: { fronts: [], zones: [] } },
    ...over,
  };
  for (const key of Object.keys(profile)) if (profile[key] === undefined) delete profile[key];
  return profile;
}
