// src/world/grass/grassCompactionConfig.ts — Tier 3A compaction toggle
import { devSettings } from '../../core/GameState';

export function grassCompactionEnabled(): boolean {
  if (import.meta.env.DEV) return devSettings.grassPerf.enableCompaction;
  return true;
}
