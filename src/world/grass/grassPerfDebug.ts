// src/world/grass/grassPerfDebug.ts — DEV periodic grass perf logging
import { devSettings } from '../../core/GameState';
import type { GrassSystem } from './GrassSystem';
import { logGrassPerfSnapshot } from './grassPerfStats';

let lastLogMs = 0;
const LOG_INTERVAL_MS = 3000;

export function maybeLogGrassPerfPeriodic(grass: GrassSystem): void {
  if (!import.meta.env.DEV || !devSettings.grassPerf.logPerfPeriodic) return;
  const now = performance.now();
  if (now - lastLogMs < LOG_INTERVAL_MS) return;
  lastLogMs = now;
  const s = grass.getPerfSnapshot();
  logGrassPerfSnapshot(s.bladesPerSide, 'periodic');
}
