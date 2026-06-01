// src/world/cloud/cloudLayout.ts — RNG + layered-cluster + horizon-ring layout for cloud sprites
import type { CloudHorizonRingSettings } from './cloudHorizonRing';

export interface CloudInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  zRot: number;
}

export interface LayerSpawnConfig {
  clusters: number;
  layersPerCluster: number;
  layerSpread: number;
  rMin: number;
  rMax: number;
  yMin: number;
  yMax: number;
  scaleMin: number;
  scaleMax: number;
}

export const LAYOUT_SEED = 0x636c6f75; // 'clou'
export const HORIZON_RING_COUNT = 3;
const DEG2RAD = Math.PI / 180;

/** Vertical band for horizon-ring puff placement (world Y). */
const HORIZON_Y = { min: 1.6, max: 26 } as const;
/** Scale band for horizon-ring puffs. */
const HORIZON_SCALE = { min: 70, max: 105 } as const;
/** Z spread between layered cards within a single cluster. */
const LAYER_SPREAD = 12;

/**
 * Deterministic small-state PRNG. Kept here (vs alea / world RNG) so cloud
 * layouts stay seed-stable across refactors — switching seeds would reshuffle
 * every existing screenshot.
 */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), s | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushClusterLayers(
  out: CloudInstance[],
  x: number,
  y: number,
  z: number,
  baseScale: number,
  baseZRot: number,
  layersPerCluster: number,
  spread: number,
  rotationJitter: number,
  rand: () => number,
): void {
  const dist = Math.hypot(x, z) || 1;
  const nx = x / dist;
  const nz = z / dist;
  const rotSpread = 0.4 * rotationJitter;

  for (let l = 0; l < layersPerCluster; l++) {
    const layerT = l - (layersPerCluster - 1) * 0.5;
    out.push({
      x: x + nx * layerT * spread * 0.35 + (rand() - 0.5) * spread * 0.4,
      y: y + layerT * spread * 0.2 + (rand() - 0.5) * spread * 0.25,
      z: z + nz * layerT * spread * 0.35 + (rand() - 0.5) * spread * 0.4,
      scale: baseScale * (0.88 + rand() * 0.18),
      zRot: baseZRot + (rand() - 0.5) * rotSpread,
    });
  }
}

/** Build the high-altitude scatter of cloud clusters above the player. */
export function buildLayeredClusters(
  cfg: LayerSpawnConfig,
  rotationJitter: number,
  rand: () => number,
): CloudInstance[] {
  const out: CloudInstance[] = [];

  for (let c = 0; c < cfg.clusters; c++) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand() * (cfg.rMax * cfg.rMax - cfg.rMin * cfg.rMin) + cfg.rMin * cfg.rMin);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = cfg.yMin + rand() * (cfg.yMax - cfg.yMin);
    const baseScale = cfg.scaleMin + rand() * (cfg.scaleMax - cfg.scaleMin);
    pushClusterLayers(
      out,
      x,
      y,
      z,
      baseScale,
      rand() * Math.PI * 2,
      cfg.layersPerCluster,
      cfg.layerSpread,
      rotationJitter,
      rand,
    );
  }
  return out;
}

/** Build one horizon tier (evenly spaced + optional staggered half-ring). */
export function buildHorizonRingTier(
  ring: CloudHorizonRingSettings,
  rotationJitter: number,
  ringRotationRad: number,
  rand: () => number,
): CloudInstance[] {
  const out: CloudInstance[] = [];
  const layers = Math.max(1, Math.round(ring.layersPerCluster));
  const primary = Math.max(4, Math.round(ring.clusters));
  const staggered = Math.max(0, Math.round(ring.staggeredClusters));

  const placeRing = (count: number, angleOffset: number, rBias: number) => {
    if (count <= 0) return;
    for (let c = 0; c < count; c++) {
      const angle =
        (c / count) * Math.PI * 2 + angleOffset + ringRotationRad + (rand() - 0.5) * 0.08;
      const r = ring.rCenter + (rand() - 0.5) * ring.rSpread * rBias;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = HORIZON_Y.min + rand() * (HORIZON_Y.max - HORIZON_Y.min);
      const baseScale = HORIZON_SCALE.min + rand() * (HORIZON_SCALE.max - HORIZON_SCALE.min);
      pushClusterLayers(
        out,
        x,
        y,
        z,
        baseScale,
        rand() * Math.PI * 2,
        layers,
        LAYER_SPREAD,
        rotationJitter,
        rand,
      );
    }
  };

  placeRing(primary, 0, 1);
  if (staggered > 0) {
    placeRing(staggered, Math.PI / staggered, 0.85);
  }

  return out;
}

export { DEG2RAD };
