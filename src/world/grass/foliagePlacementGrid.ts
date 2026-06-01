// src/world/grass/foliagePlacementGrid.ts — spatial hash for foliage scatter spacing

import { getFoliageBiomeRule, maxFoliageSpacingMul } from './foliageBiomeRules';
import type { FoliageBiomeRules } from './foliageTypes';
import type { FoliagePlacement, FoliageScatterBiomeKey } from './foliageTypes';

class PlacementGrid {
  private readonly cells = new Map<string, FoliagePlacement[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  add(p: FoliagePlacement): void {
    const cx = Math.floor(p.x / this.cellSize);
    const cz = Math.floor(p.z / this.cellSize);
    const k = this.key(cx, cz);
    let list = this.cells.get(k);
    if (!list) {
      list = [];
      this.cells.set(k, list);
    }
    list.push(p);
  }

  tooClose(
    x: number,
    z: number,
    biomeKey: FoliageScatterBiomeKey,
    baseSpacing: number,
    rules: FoliageBiomeRules,
  ): boolean {
    const need = baseSpacing * getFoliageBiomeRule(biomeKey).spacingMul;
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.cells.get(this.key(cx + dx, cz + dz));
        if (!list) continue;
        for (const p of list) {
          const distX = p.x - x;
          const distZ = p.z - z;
          const distSq = distX * distX + distZ * distZ;
          const otherNeed = baseSpacing * rules[p.biomeKey].spacingMul;
          const minDist = Math.max(need, otherNeed);
          if (distSq < minDist * minDist) return true;
        }
      }
    }
    return false;
  }
}

export function createFoliagePlacementGrid(
  baseMinSpacing: number,
  rules: FoliageBiomeRules,
): PlacementGrid {
  return new PlacementGrid(baseMinSpacing * maxFoliageSpacingMul(rules));
}

export type FoliagePlacementGrid = PlacementGrid;
