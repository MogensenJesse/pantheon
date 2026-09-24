// src/rendering/clouds/generateCloudField.ts — coverage-noise clumped placement for mesh-cluster clouds
// Phase 3B: inline tileable FBM (+ light Worley gaps) at each candidate; no baked weather map.
import {
  type CloudGenus,
  type CloudLayerId,
  type CloudLayerSettings,
  type CloudSettings,
  type CoverageNoiseSettings,
  readCloudSettings,
  resolveLayerCloudCount,
  resolveLayerCoverage,
  resolveLayerParticles,
} from './cloudConfig';
import {
  type CloudParticleProfile,
  cloudSeededRandom,
  genusAltitudeOffset,
  pickCloudGenus,
  profileCloudParticle,
} from './cloudProfiles';

/** Phase 5: octave count frozen (was VISUAL.clouds.weather.octaves / Dev slider). */
const COVERAGE_NOISE_OCTAVES = 4;

export interface CloudParticlePlacement {
  /** Cluster index in the generated field. */
  cloudIndex: number;
  /** Particle index within the cluster. */
  particleIndex: number;
  genus: CloudGenus;
  layer: CloudLayerId;
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
}

export interface CloudClusterPlacement {
  index: number;
  genus: CloudGenus;
  layer: CloudLayerId;
  density: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  particles: CloudParticleProfile[];
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
  highPeriod: number;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function saturate(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function fadeHermite(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic 0–1 hash for integer lattice (period wraps via mod). */
function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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
  return saturate(Math.sqrt(minD));
}

function densityFromNoise(n: number, coverage: number, softness: number): number {
  const soft = Math.max(1e-4, softness);
  return saturate((n - (1 - coverage)) / soft);
}

function worldToUV(x: number, z: number, spread: number): { u: number; v: number } {
  const s = Math.max(1, spread);
  const u = (((x / s) % 1) + 1) % 1;
  const v = (((z / s) % 1) + 1) % 1;
  return { u, v };
}

/** Same period/seed layout as the former 128² bake (Phase 3A), evaluated continuously. */
function makeCoverageNoiseContext(settings: CloudSettings): CoverageNoiseContext {
  const spread = Math.max(1, settings.spread);
  const cellM = Math.max(1, settings.coverageNoise.cellM);
  const basePeriod = Math.max(2, Math.round(spread / cellM));
  return {
    seed: settings.seed,
    spread,
    octaves: COVERAGE_NOISE_OCTAVES,
    basePeriod,
    highPeriod: Math.max(2, Math.round(basePeriod * 0.55)),
    altPeriod: Math.max(2, Math.round(basePeriod * 0.25)),
    worleyPeriod: Math.max(2, Math.round(basePeriod * 0.85)),
  };
}

/**
 * Sample tileable coverage + base altitude at world XZ (gen-time only).
 * Matches former bake raw fields: low = FBM + Worley gaps; high = separate lower-freq FBM.
 */
function sampleCoverageAt(
  ctx: CoverageNoiseContext,
  layer: CloudLayerId,
  x: number,
  z: number,
  coverage: number,
  coverageNoise: CoverageNoiseSettings,
): CoverageSample {
  const { u: u01, v: v01 } = worldToUV(x, z, ctx.spread);
  const seed = ctx.seed;

  let raw: number;
  if (layer === 'low') {
    const uLow = u01 * ctx.basePeriod;
    const vLow = v01 * ctx.basePeriod;
    const fbmLow = fbmTileable(uLow, vLow, ctx.basePeriod, ctx.octaves, seed + 11);
    const gaps = worleyTileable(uLow * 0.85, vLow * 0.85, ctx.worleyPeriod, seed + 77);
    raw = saturate(fbmLow * 0.82 + gaps * 0.18);
  } else {
    const uHigh = u01 * ctx.highPeriod;
    const vHigh = v01 * ctx.highPeriod;
    raw = fbmTileable(uHigh, vHigh, ctx.highPeriod, Math.max(1, ctx.octaves - 1), seed + 911);
  }

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
  layer: CloudLayerId,
  settings: CloudSettings,
  noise: CoverageNoiseContext,
  coverage: number,
  seed: number,
): ScoredCandidate[] {
  const spread = settings.spread;
  const half = spread * 0.5;
  const cellM = Math.max(32, settings.coverageNoise.cellM * 0.75);
  const gridN = Math.max(4, Math.round(spread / cellM));
  const cell = spread / gridN;
  const layerSeed = seed + (layer === 'low' ? 0 : 5000);
  const out: ScoredCandidate[] = [];

  for (let iz = 0; iz < gridN; iz++) {
    for (let ix = 0; ix < gridN; ix++) {
      const base = layerSeed + ix * 97 + iz * 131;
      const jx = cloudSeededRandom(base);
      const jz = cloudSeededRandom(base + 1);
      const x = -half + (ix + jx) * cell;
      const z = -half + (iz + jz) * cell;
      const sampled = sampleCoverageAt(noise, layer, x, z, coverage, settings.coverageNoise);
      if (sampled.density <= 1e-4) continue;
      out.push({
        x,
        z,
        raw: sampled.raw,
        density: sampled.density,
        baseAltitude: sampled.baseAltitude,
        weight: sampled.density * sampled.density,
      });
    }
  }
  return out;
}

/**
 * Weighted sample without replacement + min spacing.
 * Prefers high-density candidates so banks form.
 */
function pickWeightedWithSpacing(
  candidates: ScoredCandidate[],
  count: number,
  minSpacing: number,
  spread: number,
  seed: number,
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
      if (toroidalDistSq(chosen.x, chosen.z, p.x, p.z, spread) < minSq) {
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
  layer: CloudLayerId,
  layerSettings: CloudLayerSettings,
  settings: CloudSettings,
  noise: CoverageNoiseContext,
  seed: number,
  startIndex: number,
  instanceBudget: number,
): {
  clusters: CloudClusterPlacement[];
  particles: CloudParticlePlacement[];
  usedInstances: number;
} {
  const coverage = resolveLayerCoverage(settings, layer);
  const targetCount = resolveLayerCloudCount(settings, layer);
  const particlesRange = resolveLayerParticles(settings, layer);
  if (targetCount === 0 || instanceBudget <= 0) {
    return { clusters: [], particles: [], usedInstances: 0 };
  }

  const candidates = collectLayerCandidates(layer, settings, noise, coverage, seed);
  const minSpacing = Math.max(40, settings.spread / Math.max(4, Math.sqrt(targetCount * 3.5)));
  const selected = pickWeightedWithSpacing(
    candidates,
    targetCount,
    minSpacing,
    settings.spread,
    seed + (layer === 'low' ? 100 : 200),
  );

  const clusters: CloudClusterPlacement[] = [];
  const particles: CloudParticlePlacement[] = [];
  let usedInstances = 0;
  const sizeMul = layerSettings.sizeMul;

  for (let i = 0; i < selected.length; i++) {
    if (usedInstances >= instanceBudget) break;
    const c = selected[i]!;
    const base = seed + startIndex * 97 + i * 53 + (layer === 'low' ? 0 : 9000);
    const genus = pickCloudGenus(cloudSeededRandom(base + 3), settings.typeWeights);
    const y =
      layerSettings.baseY +
      c.baseAltitude * layerSettings.jitter +
      genusAltitudeOffset(genus) * (layer === 'low' ? 1 : 0.35);

    const particleCount = Math.max(
      1,
      Math.min(
        instanceBudget - usedInstances,
        Math.round(lerp(particlesRange.min, particlesRange.max, c.density)),
      ),
    );

    const particleProfiles: CloudParticleProfile[] = [];
    const cloudIndex = startIndex + clusters.length;

    for (let p = 0; p < particleCount; p++) {
      const profileSeed = seed + cloudIndex * 1000 + p * 13;
      const profile = profileCloudParticle(genus, p, particleCount, profileSeed, sizeMul);
      particleProfiles.push(profile);
      particles.push({
        cloudIndex,
        particleIndex: p,
        genus,
        layer,
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
    }

    usedInstances += particleCount;
    clusters.push({
      index: cloudIndex,
      genus,
      layer,
      density: c.density,
      centerX: c.x,
      centerY: y,
      centerZ: c.z,
      particles: particleProfiles,
    });
  }

  return { clusters, particles, usedInstances };
}

/**
 * Build cluster + flat particle lists for InstancedMesh population.
 * Positions are world-space around the origin; MeshCloudSystem keeps the root fixed.
 * Low + high layers share one mesh / one sort (no extra draw calls).
 * Coverage clumping via inline FBM at candidate sites (Phase 3B; no runtime weather map).
 */
export function generateCloudField(options: GenerateCloudFieldOptions = {}): CloudFieldData {
  const settings = options.settings ?? readCloudSettings();
  const seed = options.seed ?? settings.seed;
  const noise = makeCoverageNoiseContext(settings);

  const maxInstances = Math.max(0, settings.maxInstances | 0);
  const low = placeLayerClusters(
    'low',
    settings.layers.low,
    settings,
    noise,
    seed,
    0,
    maxInstances,
  );
  const high = placeLayerClusters(
    'high',
    settings.layers.high,
    settings,
    noise,
    seed,
    low.clusters.length,
    Math.max(0, maxInstances - low.usedInstances),
  );

  const clusters = low.clusters.concat(high.clusters);
  const particles = low.particles.concat(high.particles);

  return {
    settings,
    clusterCount: clusters.length,
    instanceCount: particles.length,
    clusters,
    particles,
  };
}
