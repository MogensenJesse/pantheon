// src/rendering/clouds/generateCloudField.ts - coverage-noise clumped placement for mesh-cluster clouds
// Phase 3B: inline tileable FBM (+ light Worley gaps) at each candidate; no baked weather map.
import { hash2 } from '../../core/math/hash2';
import { clamp01, fadeHermite, lerp } from '../../core/math/scalar';
import {
  type CloudLayerSettings,
  type CloudSettings,
  type CoverageNoiseSettings,
  readCloudSettings,
} from './cloudConfig';
import {
  type CloudParticleProfile,
  cloudSeededRandom,
  profileCloudParticle,
  shouldKeepCondensationPuff,
} from './cloudProfiles';
import { readCumulusDeck } from './cumulusDeck';

/** Phase 5: octave count frozen (was VISUAL.clouds.weather.octaves / Dev slider). */
const COVERAGE_NOISE_OCTAVES = 4;

export interface CloudParticlePlacement {
  /** Cluster index in the generated field. */
  cloudIndex: number;
  /** Particle index within the cluster. */
  particleIndex: number;
  /** World-space center of the parent cluster (fixed field origin at world 0). */
  clusterX: number;
  clusterY: number;
  clusterZ: number;
  /** Cluster-local offset from center (m); +X along-wind, +Z crosswind at apply time. */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** Non-uniform scale — sx along-wind, sz crosswind (rotated by windDirectionDeg). */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /**
   * Designer supercluster separation in the wind-local XZ plane (m).
   * Applied after wrap so a group shares one anchor. Unset on play (treated as 0).
   */
  groupOffsetX?: number;
  groupOffsetZ?: number;
}

export interface CloudClusterPlacement {
  index: number;
  density: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  particles: CloudParticleProfile[];
  /** Wind-local puff volume: abs(offset) + half scale. Fixed until the field is rebuilt. */
  extentX: number;
  extentY: number;
  extentZ: number;
  /** P25 of puff-center `offsetY`. */
  localDeckY: number;
  /** Condensation clip plane. */
  clipDeck: boolean;
  /** Same wind-local separation as this blob's particles. Unset on play. */
  groupOffsetX?: number;
  groupOffsetZ?: number;
}

export interface CloudFieldData {
  settings: CloudSettings;
  clusterCount: number;
  instanceCount: number;
  clusters: CloudClusterPlacement[];
  particles: CloudParticlePlacement[];
}

export interface GenerateCloudFieldOptions {
  settings?: CloudSettings;
  seed?: number;
  /**
   * Designer-only. 0 = even pick weight inside the coverage mask, 1 = density² cores.
   * Omitted on the play call, which keeps weight = density².
   */
  coverageHotspot?: number;
}

interface ScoredCandidate {
  x: number;
  z: number;
  raw: number;
  density: number;
  baseAltitude: number;
  weight: number;
}

/** Precomputed periods / seeds for gen-time coverage noise (same params as former bake path). */
interface CoverageNoiseContext {
  seed: number;
  spread: number;
  octaves: number;
  basePeriod: number;
  altPeriod: number;
  worleyPeriod: number;
}

interface CoverageSample {
  /** 0–1 raw coverage noise before threshold. */
  raw: number;
  /** 0–1 soft density after coverage threshold. */
  density: number;
  /** 0–1 low-frequency altitude field (shared flat base within a bank). */
  baseAltitude: number;
}

function wrapIndex(i: number, period: number): number {
  const p = Math.max(1, period | 0);
  return ((i % p) + p) % p;
}

/** Tileable value noise; lattice period matches `period` cells across the domain. */
function valueNoiseTileable(u: number, v: number, period: number, seed: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const tx = fadeHermite(u - x0);
  const ty = fadeHermite(v - y0);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const n00 = hash2(wrapIndex(x0, period), wrapIndex(y0, period), seed);
  const n10 = hash2(wrapIndex(x1, period), wrapIndex(y0, period), seed);
  const n01 = hash2(wrapIndex(x0, period), wrapIndex(y1, period), seed);
  const n11 = hash2(wrapIndex(x1, period), wrapIndex(y1, period), seed);
  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, ty);
}

/** Tileable FBM; `basePeriod` = cells across domain at octave 0. */
function fbmTileable(
  u: number,
  v: number,
  basePeriod: number,
  octaves: number,
  seed: number,
): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let freq = 1;
  const oct = Math.max(1, Math.min(8, octaves | 0));
  for (let i = 0; i < oct; i++) {
    const period = Math.max(1, Math.round(basePeriod * freq));
    sum += amp * valueNoiseTileable(u * freq, v * freq, period, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Light Worley (cellular) gaps — tileable over `period` cells.
 * Returns 0–1 distance to nearest feature (mixed into low coverage for holes).
 */
function worleyTileable(u: number, v: number, period: number, seed: number): number {
  const cellX = Math.floor(u);
  const cellY = Math.floor(v);
  let minD = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = cellX + ox;
      const cy = cellY + oy;
      const wx = wrapIndex(cx, period);
      const wy = wrapIndex(cy, period);
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 19);
      const dx = px - u;
      const dy = py - v;
      const d = dx * dx + dy * dy;
      if (d < minD) minD = d;
    }
  }
  return clamp01(Math.sqrt(minD));
}

function densityFromNoise(n: number, coverage: number, softness: number): number {
  const soft = Math.max(1e-4, softness);
  return clamp01((n - (1 - coverage)) / soft);
}

/** Cells at or below this density are outside the coverage mask and are not placed. */
const COVERAGE_MASK_DENSITY = 1e-4;

/**
 * Designer hotspot curve. density² peaks so hard the yellow shoulder is a hairline.
 * Green fringe, a wide yellow band through the middle densities, then red cores.
 */
function designerSoftCoreWeight(density: number): number {
  const d = Math.max(0, Math.min(1, density));
  const shoulderLo = 0.22;
  const shoulderHi = 0.78;
  const yellowLo = 0.38;
  const yellowHi = 0.62;
  if (d <= shoulderLo) return (d / shoulderLo) * yellowLo;
  if (d >= shoulderHi) {
    const u = (d - shoulderHi) / (1 - shoulderHi);
    return yellowHi + u * (1 - yellowHi);
  }
  const u = (d - shoulderLo) / (shoulderHi - shoulderLo);
  return yellowLo + u * (yellowHi - yellowLo);
}

/**
 * Pick weight for cells that already passed the coverage mask.
 * Play omits hotspot and uses density². Designer lerps 1 → the soft core curve.
 */
export function coveragePickWeight(density: number, hotspot?: number): number {
  if (hotspot === undefined) return density * density;
  const t = Math.max(0, Math.min(1, hotspot));
  const soft = designerSoftCoreWeight(density);
  return 1 + (soft - 1) * t;
}

/**
 * Width and height scale for one cloud. 1 at supercluster 0.
 * At 1, the fringe is greenSize and the core is redSize.
 * Core spacing multiplies the 16 m pack by this scale.
 */
export function designerWeightSizeScale(density: number, hotspot: number): number {
  const s = Math.max(0, Math.min(1, hotspot));
  if (s <= 1e-6) return 1;
  const deck = readCumulusDeck();
  const weight = coveragePickWeight(density, s);
  const n = Math.max(0, Math.min(1, (weight - (1 - s)) / s));
  const atFull = deck.greenSize + (deck.redSize - deck.greenSize) * n;
  return 1 + (atFull - 1) * s;
}

/** Unscaled core pack. Multiplied by size so a fat core still overlaps, with fewer clouds. */
const DESIGNER_CORE_SPACING_M = 16;

/**
 * Fringe pairs stay on minSpacing.
 * Two core clouds use 16 m times their size scale, so they still collide and merge.
 */
function superclusterPairSpacingM(
  minSpacing: number,
  densityA: number,
  densityB: number,
  weightA: number,
  weightB: number,
  hotspot: number,
): number {
  const closeness = hotspot * Math.max(0, Math.min(1, Math.min(weightA, weightB)));
  const footprint =
    (designerWeightSizeScale(densityA, hotspot) + designerWeightSizeScale(densityB, hotspot)) * 0.5;
  const coreGap = DESIGNER_CORE_SPACING_M * Math.max(1, footprint);
  return minSpacing + (coreGap - minSpacing) * closeness;
}

function worldToUV(x: number, z: number, spread: number): { u: number; v: number } {
  const s = Math.max(1, spread);
  const u = (((x / s) % 1) + 1) % 1;
  const v = (((z / s) % 1) + 1) % 1;
  return { u, v };
}

/** Same period/seed layout as the former 128Â² bake (Phase 3A), evaluated continuously. */
function makeCoverageNoiseContext(settings: CloudSettings): CoverageNoiseContext {
  const spread = Math.max(1, settings.spread);
  const cellM = Math.max(1, settings.coverageNoise.cellM);
  const basePeriod = Math.max(2, Math.round(spread / cellM));
  return {
    seed: settings.seed,
    spread,
    octaves: COVERAGE_NOISE_OCTAVES,
    basePeriod,
    altPeriod: Math.max(2, Math.round(basePeriod * 0.25)),
    worleyPeriod: Math.max(2, Math.round(basePeriod * 0.85)),
  };
}

/**
 * Sample tileable coverage + base altitude at world XZ (gen-time only).
 * FBM plus Worley gaps, same mix the low deck has always used.
 */
function sampleCoverageAt(
  ctx: CoverageNoiseContext,
  x: number,
  z: number,
  coverage: number,
  coverageNoise: CoverageNoiseSettings,
): CoverageSample {
  const { u: u01, v: v01 } = worldToUV(x, z, ctx.spread);
  const seed = ctx.seed;
  const uLow = u01 * ctx.basePeriod;
  const vLow = v01 * ctx.basePeriod;
  const fbmLow = fbmTileable(uLow, vLow, ctx.basePeriod, ctx.octaves, seed + 11);
  const gaps = worleyTileable(uLow * 0.85, vLow * 0.85, ctx.worleyPeriod, seed + 77);
  const raw = clamp01(fbmLow * 0.82 + gaps * 0.18);

  const uAlt = u01 * ctx.altPeriod;
  const vAlt = v01 * ctx.altPeriod;
  const baseAltitude = fbmTileable(uAlt, vAlt, ctx.altPeriod, 2, seed + 1709);
  const density = densityFromNoise(raw, coverage, coverageNoise.softness);

  return { raw, density, baseAltitude };
}

function wrapDelta(d: number, spread: number): number {
  const half = spread * 0.5;
  let v = d;
  while (v > half) v -= spread;
  while (v < -half) v += spread;
  return v;
}

function toroidalDistSq(ax: number, az: number, bx: number, bz: number, spread: number): number {
  const dx = wrapDelta(ax - bx, spread);
  const dz = wrapDelta(az - bz, spread);
  return dx * dx + dz * dz;
}

/** Jittered grid over the wrap domain; scores by inline coverage-noise density. */
function collectLayerCandidates(
  settings: CloudSettings,
  noise: CoverageNoiseContext,
  coverage: number,
  seed: number,
  targetCount: number,
  coverageHotspot?: number,
): ScoredCandidate[] {
  const spread = settings.spread;
  const half = spread * 0.5;
  const noiseCell = Math.max(32, settings.coverageNoise.cellM * 0.75);
  const noiseGrid = Math.max(4, Math.round(spread / noiseCell));
  // Finer lattice only when the requested count cannot fit the coverage-noise grid.
  const countGrid = targetCount > 0 ? Math.ceil(Math.sqrt(targetCount * 4)) : 0;
  let gridN = Math.max(noiseGrid, countGrid);
  // Designer hotspot only. Play omits it and keeps this lattice.
  // Fine cells so the picker can still find a site outside a scaled core.
  if (coverageHotspot !== undefined && coverageHotspot > 0) {
    const coarse = spread / gridN;
    const cellTarget = coarse + (DESIGNER_CORE_CELL_M - coarse) * coverageHotspot;
    gridN = Math.max(gridN, Math.round(spread / Math.max(8, cellTarget)));
  }
  const cell = spread / gridN;
  const out: ScoredCandidate[] = [];

  for (let iz = 0; iz < gridN; iz++) {
    for (let ix = 0; ix < gridN; ix++) {
      const base = seed + ix * 97 + iz * 131;
      const jx = cloudSeededRandom(base);
      const jz = cloudSeededRandom(base + 1);
      const x = -half + (ix + jx) * cell;
      const z = -half + (iz + jz) * cell;
      const sampled = sampleCoverageAt(noise, x, z, coverage, settings.coverageNoise);
      if (sampled.density <= COVERAGE_MASK_DENSITY) continue;
      out.push({
        x,
        z,
        raw: sampled.raw,
        density: sampled.density,
        baseAltitude: sampled.baseAltitude,
        weight:
          coverageHotspot === undefined
            ? sampled.density * sampled.density
            : coveragePickWeight(sampled.density, coverageHotspot),
      });
    }
  }
  return out;
}

/**
 * Weighted sample without replacement + min spacing.
 * Prefers high-density candidates so banks form.
 * Above supercluster 0, only hot-core pairs widen to 16 m times their size scale.
 * They still overlap. Other clouds keep minSpacing, so density can keep filling the deck.
 */
/** Designer candidate lattice. Play never reads this. */
const DESIGNER_CORE_CELL_M = 12;

function pickWeightedWithSpacing(
  candidates: ScoredCandidate[],
  count: number,
  minSpacing: number,
  spread: number,
  seed: number,
  coverageHotspot?: number,
): ScoredCandidate[] {
  if (count <= 0 || candidates.length === 0) return [];
  const pool = candidates.slice();
  const picked: ScoredCandidate[] = [];
  const minSq = minSpacing * minSpacing;
  let guard = 0;
  const maxGuard = count * 8 + pool.length;

  while (picked.length < count && pool.length > 0 && guard++ < maxGuard) {
    let total = 0;
    for (const c of pool) total += c.weight;
    if (total <= 1e-8) break;
    const roll = cloudSeededRandom(seed + picked.length * 17 + guard * 3) * total;
    let acc = 0;
    let pickIdx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      acc += pool[i]!.weight;
      if (roll <= acc) {
        pickIdx = i;
        break;
      }
    }
    const chosen = pool[pickIdx]!;
    pool.splice(pickIdx, 1);

    let ok = true;
    for (const p of picked) {
      let limitSq = minSq;
      if (coverageHotspot !== undefined && coverageHotspot > 0) {
        const limit = superclusterPairSpacingM(
          minSpacing,
          chosen.density,
          p.density,
          chosen.weight,
          p.weight,
          coverageHotspot,
        );
        limitSq = limit * limit;
      }
      if (toroidalDistSq(chosen.x, chosen.z, p.x, p.z, spread) < limitSq) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    picked.push(chosen);
  }
  return picked;
}

function placeLayerClusters(
  layerSettings: CloudLayerSettings,
  settings: CloudSettings,
  noise: CoverageNoiseContext,
  seed: number,
  startIndex: number,
  instanceBudget: number,
  coverageHotspot?: number,
): {
  clusters: CloudClusterPlacement[];
  particles: CloudParticlePlacement[];
  usedInstances: number;
} {
  const coverage = settings.coverage;
  const targetCount = Math.max(0, Math.round(layerSettings.cloudCount));
  const particlesRange = { min: layerSettings.particlesMin, max: layerSettings.particlesMax };
  if (targetCount === 0 || instanceBudget <= 0) {
    return { clusters: [], particles: [], usedInstances: 0 };
  }

  const candidates = collectLayerCandidates(
    settings,
    noise,
    coverage,
    seed,
    targetCount,
    coverageHotspot,
  );
  const minSpacing = Math.max(40, settings.spread / Math.max(4, Math.sqrt(targetCount * 3.5)));
  const selected = pickWeightedWithSpacing(
    candidates,
    targetCount,
    minSpacing,
    settings.spread,
    seed + 100,
    coverageHotspot,
  );

  const clusters: CloudClusterPlacement[] = [];
  const particles: CloudParticlePlacement[] = [];
  let usedInstances = 0;

  for (let i = 0; i < selected.length; i++) {
    if (usedInstances >= instanceBudget) break;
    const c = selected[i]!;
    const y = layerSettings.baseY + c.baseAltitude * layerSettings.jitter;

    const particleCount = Math.max(
      1,
      Math.min(
        instanceBudget - usedInstances,
        Math.round(lerp(particlesRange.min, particlesRange.max, c.density)),
      ),
    );

    const particleProfiles: CloudParticleProfile[] = [];
    const cloudIndex = startIndex + clusters.length;

    let kept = 0;
    for (let p = 0; p < particleCount; p++) {
      const profileSeed = seed + cloudIndex * 1000 + p * 13;
      const profile = profileCloudParticle(
        p,
        particleCount,
        profileSeed,
        settings.deckBaseFraction,
      );
      if (!shouldKeepCondensationPuff(profile)) continue;
      particleProfiles.push(profile);
      particles.push({
        cloudIndex,
        particleIndex: kept,
        clusterX: c.x,
        clusterY: y,
        clusterZ: c.z,
        offsetX: profile.x,
        offsetY: profile.y,
        offsetZ: profile.z,
        scaleX: profile.sx,
        scaleY: profile.sy,
        scaleZ: profile.sz,
      });
      kept += 1;
    }
    if (kept === 0) continue;

    usedInstances += kept;
    clusters.push({
      index: cloudIndex,
      density: c.density,
      centerX: c.x,
      centerY: y,
      centerZ: c.z,
      particles: particleProfiles,
      extentX: 0.001,
      extentY: 0.001,
      extentZ: 0.001,
      localDeckY: 0,
      clipDeck: false,
    });
  }

  return { clusters, particles, usedInstances };
}

/**
 * P25 of puff-center local Y. Same partial selection as the old per-frame wind scan.
 * Mutates `values` through the target index.
 */
function puffCenterPercentile(values: number[], pct: number): number {
  const count = values.length;
  if (count <= 0) return 0;
  if (count === 1) return values[0]!;
  const target = Math.min(count - 1, Math.max(0, Math.floor(count * pct)));
  for (let i = 0; i <= target; i++) {
    let minIdx = i;
    let minVal = values[i]!;
    for (let j = i + 1; j < count; j++) {
      const v = values[j]!;
      if (v < minVal) {
        minVal = v;
        minIdx = j;
      }
    }
    if (minIdx !== i) {
      values[minIdx] = values[i]!;
      values[i] = minVal;
    }
  }
  return values[target]!;
}

/**
 * Bake per-cluster extent, condensation Y, and clip flag from the flat particle list.
 * Call again after any post-pass that rescales puff offsets.
 */
export function assignClusterWindMotion(field: CloudFieldData): void {
  const particles = field.particles;
  let cursor = 0;
  for (const cluster of field.clusters) {
    while (cursor < particles.length && particles[cursor]!.cloudIndex < cluster.index) cursor += 1;
    let ex = 0.001;
    let ey = 0.001;
    let ez = 0.001;
    const offsetYs: number[] = [];
    let j = cursor;
    while (j < particles.length && particles[j]!.cloudIndex === cluster.index) {
      const p = particles[j]!;
      ex = Math.max(ex, Math.abs(p.offsetX) + p.scaleX * 0.5);
      ey = Math.max(ey, Math.abs(p.offsetY) + p.scaleY * 0.5);
      ez = Math.max(ez, Math.abs(p.offsetZ) + p.scaleZ * 0.5);
      offsetYs.push(p.offsetY);
      j += 1;
    }
    cursor = j;
    cluster.extentX = ex;
    cluster.extentY = ey;
    cluster.extentZ = ez;
    cluster.localDeckY = puffCenterPercentile(offsetYs, 0.25);
    cluster.clipDeck = true;
  }
}

/**
 * Build cluster + flat particle lists for InstancedMesh population.
 * Positions are world-space around the origin; MeshCloudSystem keeps the root fixed.
 * One cumulus deck.
 * Coverage clumping via inline FBM at candidate sites (Phase 3B; no runtime weather map).
 */
export function generateCloudField(options: GenerateCloudFieldOptions = {}): CloudFieldData {
  const settings = options.settings ?? readCloudSettings();
  const seed = options.seed ?? settings.seed;
  const noise = makeCoverageNoiseContext(settings);

  const maxInstances = Math.max(0, settings.maxInstances | 0);
  const low = placeLayerClusters(
    settings.layer,
    settings,
    noise,
    seed,
    0,
    maxInstances,
    options.coverageHotspot,
  );
  const clusters = low.clusters;
  const particles = low.particles;

  const field: CloudFieldData = {
    settings,
    clusterCount: clusters.length,
    instanceCount: particles.length,
    clusters,
    particles,
  };
  assignClusterWindMotion(field);
  return field;
}

/**
 * Designer debug only. Low-layer density from the same sampleCoverageAt /
 * densityFromNoise path placement uses (FBM 0.82 + Worley 0.18). Does not place clouds.
 */
export function samplePreviewLowCoverageDensity(
  settings: CloudSettings,
  x: number,
  z: number,
): number {
  const ctx = makeCoverageNoiseContext(settings);
  return sampleCoverageAt(ctx, x, z, settings.coverage, settings.coverageNoise).density;
}

/**
 * Designer debug. Null outside the coverage mask. Otherwise the same pick weight
 * the hotspot slider feeds the designer field build.
 */
export function samplePreviewPlacementWeight(
  settings: CloudSettings,
  x: number,
  z: number,
  hotspot: number,
): number | null {
  const density = samplePreviewLowCoverageDensity(settings, x, z);
  if (density <= COVERAGE_MASK_DENSITY) return null;
  return coveragePickWeight(density, hotspot);
}
