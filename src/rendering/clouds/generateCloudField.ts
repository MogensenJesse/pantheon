// src/rendering/clouds/generateCloudField.ts — weather-map clumped placement for mesh-cluster clouds
import {
  type CloudGenus,
  type CloudLayerId,
  type CloudLayerSettings,
  type CloudPreset,
  type CloudSettings,
  readCloudSettings,
  resolveActiveCloudPreset,
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
import {
  buildCloudWeatherMapFromSettings,
  type CloudWeatherMap,
  weatherDensityFromRaw,
} from './cloudWeatherMap';

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
  preset: CloudPreset;
  clusterCount: number;
  instanceCount: number;
  clusters: CloudClusterPlacement[];
  particles: CloudParticlePlacement[];
}

export interface GenerateCloudFieldOptions {
  settings?: CloudSettings;
  preset?: CloudPreset;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

/** Jittered grid over the wrap domain; scores by weather density. */
function collectLayerCandidates(
  layer: CloudLayerId,
  settings: CloudSettings,
  weather: CloudWeatherMap,
  coverage: number,
  seed: number,
): ScoredCandidate[] {
  const spread = settings.spread;
  const half = spread * 0.5;
  const cellM = Math.max(32, settings.weather.cellM * 0.75);
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
      const baked = weather.sampleBaked(layer, x, z);
      const density = weatherDensityFromRaw(baked.density, coverage, settings.weather);
      if (density <= 1e-4) continue;
      out.push({
        x,
        z,
        raw: baked.density,
        density,
        baseAltitude: baked.baseAltitude,
        weight: density * density,
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
  preset: CloudPreset,
  weather: CloudWeatherMap,
  seed: number,
  startIndex: number,
  instanceBudget: number,
): {
  clusters: CloudClusterPlacement[];
  particles: CloudParticlePlacement[];
  usedInstances: number;
} {
  const coverage = resolveLayerCoverage(preset, layer);
  const targetCount = resolveLayerCloudCount(
    settings,
    preset,
    layer,
  );
  const particlesRange = resolveLayerParticles(settings, preset, layer);
  if (targetCount === 0 || instanceBudget <= 0) {
    return { clusters: [], particles: [], usedInstances: 0 };
  }

  const candidates = collectLayerCandidates(layer, settings, weather, coverage, seed);
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
    const genus = pickCloudGenus(cloudSeededRandom(base + 3), preset.typeWeights);
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
 */
export function generateCloudField(options: GenerateCloudFieldOptions = {}): CloudFieldData {
  const settings = options.settings ?? readCloudSettings();
  const preset = options.preset ?? resolveActiveCloudPreset(settings);
  const seed = options.seed ?? settings.seed;
  const weather = buildCloudWeatherMapFromSettings(settings);

  const maxInstances = Math.max(0, settings.maxInstances | 0);
  const low = placeLayerClusters(
    'low',
    settings.layers.low,
    settings,
    preset,
    weather,
    seed,
    0,
    maxInstances,
  );
  const high = placeLayerClusters(
    'high',
    settings.layers.high,
    settings,
    preset,
    weather,
    seed,
    low.clusters.length,
    Math.max(0, maxInstances - low.usedInstances),
  );

  const clusters = low.clusters.concat(high.clusters);
  const particles = low.particles.concat(high.particles);

  return {
    settings,
    preset,
    clusterCount: clusters.length,
    instanceCount: particles.length,
    clusters,
    particles,
  };
}
