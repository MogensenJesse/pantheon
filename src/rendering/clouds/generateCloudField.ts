// src/rendering/clouds/generateCloudField.ts — seeded CPU placement for mesh-cluster clouds
import {
  type CloudGenus,
  type CloudPreset,
  type CloudSettings,
  effectiveCloudCount,
  readCloudSettings,
  resolveActiveCloudPreset,
} from './cloudConfig';
import {
  type CloudParticleProfile,
  cloudSeededRandom,
  genusAltitudeOffset,
  pickCloudGenus,
  profileCloudParticle,
} from './cloudProfiles';

export interface CloudParticlePlacement {
  /** Cluster index in the generated field. */
  cloudIndex: number;
  /** Particle index within the cluster. */
  particleIndex: number;
  genus: CloudGenus;
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
  centerX: number;
  centerY: number;
  centerZ: number;
  particles: CloudParticleProfile[];
}

export interface CloudFieldData {
  settings: CloudSettings;
  preset: CloudPreset;
  clusterCount: number;
  particlesPerCloud: number;
  instanceCount: number;
  clusters: CloudClusterPlacement[];
  particles: CloudParticlePlacement[];
}

export interface GenerateCloudFieldOptions {
  settings?: CloudSettings;
  preset?: CloudPreset;
  seed?: number;
}

function clusterCenter(
  cloudIndex: number,
  settings: CloudSettings,
  seed: number,
): { x: number; y: number; z: number; genus: CloudGenus } {
  const preset = resolveActiveCloudPreset(settings);
  const base = seed + cloudIndex * 97;
  const genus = pickCloudGenus(cloudSeededRandom(base + 3), preset.typeWeights);
  const spread = settings.spread;
  const x = (cloudSeededRandom(base) - 0.5) * spread;
  const z = (cloudSeededRandom(base + 1) - 0.5) * spread;
  const y =
    settings.cloudBaseY +
    genusAltitudeOffset(genus) +
    cloudSeededRandom(base + 2) * settings.altitudeJitter;
  return { x, y, z, genus };
}

/**
 * Build cluster + flat particle lists for InstancedMesh population.
 * Positions are world-space around the origin; MeshCloudSystem keeps the root fixed.
 */
export function generateCloudField(options: GenerateCloudFieldOptions = {}): CloudFieldData {
  const settings = options.settings ?? readCloudSettings();
  const preset = options.preset ?? resolveActiveCloudPreset(settings);
  const seed = options.seed ?? settings.seed;
  const clusterCount = effectiveCloudCount(settings, preset);
  const particlesPerCloud = Math.max(1, settings.particlesPerCloud);

  const clusters: CloudClusterPlacement[] = [];
  const particles: CloudParticlePlacement[] = [];

  for (let c = 0; c < clusterCount; c++) {
    const { x, y, z, genus } = clusterCenter(c, settings, seed);
    const particleProfiles: CloudParticleProfile[] = [];

    for (let p = 0; p < particlesPerCloud; p++) {
      const profileSeed = seed + c * 1000 + p * 13;
      const profile = profileCloudParticle(genus, p, particlesPerCloud, profileSeed);
      particleProfiles.push(profile);
      particles.push({
        cloudIndex: c,
        particleIndex: p,
        genus,
        clusterX: x,
        clusterY: y,
        clusterZ: z,
        offsetX: profile.x,
        offsetY: profile.y,
        offsetZ: profile.z,
        scaleX: profile.sx,
        scaleY: profile.sy,
        scaleZ: profile.sz,
      });
    }

    clusters.push({
      index: c,
      genus,
      centerX: x,
      centerY: y,
      centerZ: z,
      particles: particleProfiles,
    });
  }

  return {
    settings,
    preset,
    clusterCount,
    particlesPerCloud,
    instanceCount: particles.length,
    clusters,
    particles,
  };
}
