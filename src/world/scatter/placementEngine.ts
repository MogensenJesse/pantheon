// src/world/scatter/placementEngine.ts — rejection sampling and placement distribution
import { distanceToJourneyPath, sampleBesideJourney } from '../JourneyPath';
import { getActiveLandmarkClearance } from '../landmarkClearance';
import { WORLD } from '../WorldConfig';
import type { TerrainContext } from '../TerrainGenerator';
import type { Placement, PlacementRules } from './placementTypes';

export function tooClose(x: number, z: number, list: Placement[], minSpacing: number): boolean {
  const minSq = minSpacing * minSpacing;
  for (const p of list) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

export function tooCloseLandmarks(x: number, z: number, clearance: number): boolean {
  const minSq = clearance * clearance;
  for (const [lx, lz] of getActiveLandmarkClearance()) {
    const dx = lx - x;
    const dz = lz - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

export function tooCloseToPath(x: number, z: number, exclusionRadius: number): boolean {
  return distanceToJourneyPath(x, z) < exclusionRadius;
}

export function pickWeighted<T extends { weight: number }>(entries: readonly T[], rng: () => number): T {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

export function scatterPlacements(
  config: PlacementRules,
  terrain: TerrainContext,
  rng: () => number,
): Placement[] {
  const globalPlacements: Placement[] = [];
  let attempts = 0;

  const pathExclusion =
    config.pathExclusionRadius ?? WORLD.JOURNEY.PATH_EXCLUSION_RADIUS;
  const attemptLimit =
    config.count * (config.pathCorridor ? 70 : config.region ? 50 : 30);

  while (globalPlacements.length < config.count && attempts < attemptLimit) {
    attempts++;
    let x: number;
    let z: number;
    if (config.pathCorridor) {
      const p = sampleBesideJourney(
        rng,
        pathExclusion,
        WORLD.JOURNEY.PATH_HALF_WIDTH,
      );
      x = p.x;
      z = p.z;
    } else if (config.region) {
      const { centerX, centerZ, radius } = config.region;
      const angle = rng() * Math.PI * 2;
      const dist = radius * Math.pow(rng(), 0.55);
      x = centerX + Math.cos(angle) * dist;
      z = centerZ + Math.sin(angle) * dist;
    } else {
      x = (rng() - 0.5) * WORLD.SIZE * 0.9;
      z = (rng() - 0.5) * WORLD.SIZE * 0.9;
    }
    const h = terrain.getHeightAt(x, z);

    if (h < config.heightMin || h > config.heightMax) continue;
    if (tooClose(x, z, globalPlacements, config.minSpacing)) continue;
    if (tooCloseLandmarks(x, z, config.landmarkClearance)) continue;
    if (!config.pathCorridor && tooCloseToPath(x, z, pathExclusion)) continue;

    globalPlacements.push({
      x,
      z,
      yRotation: rng() * Math.PI * 2,
      scale: config.scaleMin + rng() * (config.scaleMax - config.scaleMin),
      instanceIndex: globalPlacements.length,
    });
  }

  return globalPlacements;
}

export function distributePlacements<T extends { key: string; weight: number }>(
  globalPlacements: Placement[],
  entries: readonly T[],
  rng: () => number,
): { entry: T; placements: Placement[] }[] {
  const byKey = new Map<string, { entry: T; placements: Placement[] }>();

  for (const placement of globalPlacements) {
    const entry = pickWeighted(entries, rng);
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, { entry, placements: [] });
    }
    const group = byKey.get(entry.key)!;
    placement.instanceIndex = group.placements.length;
    group.placements.push(placement);
  }

  return [...byKey.values()];
}

export function scatter<T extends { key: string; weight: number }>(
  config: PlacementRules,
  terrain: TerrainContext,
  rng: () => number,
  entries: readonly T[],
): { entry: T; placements: Placement[] }[] {
  const globalPlacements = scatterPlacements(config, terrain, rng);
  return distributePlacements(globalPlacements, entries, rng);
}
