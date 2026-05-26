// src/world/TerrainGenerator.ts
import {
  CircleGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
} from 'three';
import type { TerrainSplatMaterial } from './terrain/TerrainSplatMaterial';
import { createNoise2D } from 'simplex-noise';
import alea from 'alea';
import { WORLD } from './WorldConfig';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import {
  createTerrainSplatMaterial,
  disposeTerrainSplatMaterial,
} from './terrain/TerrainSplatMaterial';

const noise2D = createNoise2D(alea(WORLD.SEED));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Peninsula island mask.
 * nx, nz are normalized coordinates in [-0.5, 0.5].
 * Radial falloff keeps the center as land and fades edges to water (0).
 * NE exception (+x east, -z north in Three.js): peninsula boost keeps the
 * northeast corner elevated — the mountain land-bridge to the "mainland".
 */
function islandMask(nx: number, nz: number): number {
  const dist = Math.sqrt(nx * nx + nz * nz);
  const radial = 1 - smoothstep(0.22, 0.48, dist);

  // Peaks at 1 when nx > 0 and nz < 0 (northeast quadrant)
  const cornerFactor =
    Math.max(0, Math.min(1, nx * 2)) * Math.max(0, Math.min(1, -nz * 2));
  const peninsulaBoost = smoothstep(0, 0.5, cornerFactor);

  return Math.max(0, Math.min(1, Math.max(radial, peninsulaBoost)));
}

function sampleHeight(nx: number, nz: number): number {
  let h = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 6; o++) {
    h += noise2D(nx * freq, nz * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return (h + 1) * 0.5;
}

export interface TerrainContext {
  mesh: Mesh;
  /** Group containing concentric water ring tiers (translucent near shore, opaque outward). */
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
}

const WATER_COLOR = 0x1a3a5c;

/** Concentric water tiers. Opacity rises outward so the horizon shows fully opaque water. */
const WATER_TIERS: ReadonlyArray<{ rInner: number; rOuter: number; opacity: number }> = [
  { rInner: 0.0, rOuter: 0.25, opacity: 0.85 },
  { rInner: 0.25, rOuter: 0.55, opacity: 0.95 },
  { rInner: 0.55, rOuter: 1.0, opacity: 1.0 },
];

function buildWaterRings(waterRadius: number, waterY: number): Object3D {
  const group = new Group();
  for (const tier of WATER_TIERS) {
    const rOuter = waterRadius * tier.rOuter;
    const rInner = waterRadius * tier.rInner;
    const geo = tier.rInner === 0
      ? new CircleGeometry(rOuter, 96)
      : new RingGeometry(rInner, rOuter, 96, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: WATER_COLOR,
      transparent: tier.opacity < 1,
      opacity: tier.opacity,
      depthWrite: tier.opacity >= 1,
    });
    const ring = new Mesh(geo, mat);
    ring.position.y = waterY;
    ring.renderOrder = 1;
    ring.receiveShadow = true;
    group.add(ring);
  }
  return group;
}

export function buildTerrain(
  scene: Scene,
  textures: TerrainTextureSet,
  sun: DirectionalLight,
): TerrainContext {
  const { SIZE, SEGMENTS, HEIGHT_SCALE } = WORLD;
  const geometry = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const heightNorms: number[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const nx = x / SIZE;
    const nz = z / SIZE;
    const h = sampleHeight(nx, nz) * islandMask(nx, nz);
    const y = h * HEIGHT_SCALE;
    positions.setY(i, y);
    heightNorms.push(h);
  }

  geometry.setAttribute('heightNorm', new Float32BufferAttribute(heightNorms, 1));
  geometry.computeVertexNormals();

  const splatMaterial = createTerrainSplatMaterial(textures, sun);
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const waterY = WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  const waterRadius = WORLD.WATER_PLANE_SIZE * 0.5;

  // Seafloor: opaque dark disc that the translucent water blends over.
  // Sits just below water level so the HDRI never shows through past the
  // 200 m island terrain. Slightly larger radius to ensure no edge peek.
  const seafloorGeo = new CircleGeometry(waterRadius * 1.02, 64);
  seafloorGeo.rotateX(-Math.PI / 2);
  const seafloorMat = new MeshBasicMaterial({
    color: 0x0a1a2e,
    depthWrite: true,
  });
  const seafloor = new Mesh(seafloorGeo, seafloorMat);
  seafloor.position.y = waterY - 4;
  seafloor.renderOrder = 0;
  scene.add(seafloor);

  const water = buildWaterRings(waterRadius, waterY);
  scene.add(water);

  const getHeightAt = (x: number, z: number): number => {
    const nx = Math.max(-0.5, Math.min(0.5, x / SIZE));
    const nz = Math.max(-0.5, Math.min(0.5, z / SIZE));
    return sampleHeight(nx, nz) * islandMask(nx, nz);
  };

  const getWorldY = (x: number, z: number): number => getHeightAt(x, z) * HEIGHT_SCALE;

  return { mesh, water, seafloor, splatMaterial, getHeightAt, getWorldY };
}

export function disposeTerrain(context: TerrainContext): void {
  context.mesh.geometry.dispose();
  disposeTerrainSplatMaterial(context.splatMaterial);
  context.water.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as Material).dispose();
    }
  });
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
