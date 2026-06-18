// src/map/standingStoneDefaults.ts — default standing-stone scales (editor + play)

/** Default scale per stone id (0–4); shared by editor preview and play spawn. */
export const STANDING_STONE_DEFAULT_SCALES = [1.0, 1.2, 1.35, 1.55, 1.8] as const;

export function standingStoneDefaultScale(stoneId: number): number {
  return STANDING_STONE_DEFAULT_SCALES[stoneId] ?? 1;
}
