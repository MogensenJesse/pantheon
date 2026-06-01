// src/world/grass/foliageBiomeRules.ts — painted-biome foliage budgets (VISUAL / dev overrides)

import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { FoliageBiomeRule, FoliageBiomeRules, FoliagePackKey, FoliageScatterBiomeKey } from './foliageTypes';

export const FOLIAGE_SCATTER_BIOME_KEYS: readonly FoliageScatterBiomeKey[] = [
  'shore',
  'forest',
  'hills',
  'mountain',
];

const BIOME_ID_TO_RULE_KEY: Partial<Record<BiomeIdValue, FoliageScatterBiomeKey>> = {
  [BiomeId.Shore]: 'shore',
  [BiomeId.Forest]: 'forest',
  [BiomeId.Hills]: 'hills',
  [BiomeId.Mountain]: 'mountain',
};

export function foliageRuleKeyForBiomeId(id: BiomeIdValue): FoliageScatterBiomeKey | null {
  return BIOME_ID_TO_RULE_KEY[id] ?? null;
}

export function getFoliageBiomeRules(): FoliageBiomeRules {
  if (import.meta.env.DEV) {
    return devSettings.grass.biomes;
  }
  return VISUAL.grass.biomes;
}

export function getFoliageBiomeRule(key: FoliageScatterBiomeKey): FoliageBiomeRule {
  return getFoliageBiomeRules()[key];
}

export function normalizePackWeights(
  packs: Partial<Record<FoliagePackKey, number>>,
): Array<{ pack: FoliagePackKey; weight: number }> {
  const entries = Object.entries(packs).filter(([, w]) => w != null && w > 0) as Array<
    [FoliagePackKey, number]
  >;
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (sum <= 0) return [];
  return entries.map(([pack, weight]) => ({ pack, weight: weight / sum }));
}

export function maxFoliageSpacingMul(rules: FoliageBiomeRules): number {
  let max = 1;
  for (const key of FOLIAGE_SCATTER_BIOME_KEYS) {
    max = Math.max(max, rules[key].spacingMul);
  }
  return max;
}
