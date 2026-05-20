// src/world/TerrainGenerator.ts
import {
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  type ShaderMaterial,
} from 'three';
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
  water: Mesh;
  splatMaterial: ShaderMaterial;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
}

export function buildTerrain(scene: Scene, textures: TerrainTextureSet): TerrainContext {
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

  const splatMaterial = createTerrainSplatMaterial(textures);
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const waterY = WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  const waterGeo = new PlaneGeometry(800, 800);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new MeshBasicMaterial({
    color: 0x1a3a5c,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const water = new Mesh(waterGeo, waterMat);
  water.position.y = waterY;
  water.renderOrder = 1;
  water.receiveShadow = true;
  scene.add(water);

  const getHeightAt = (x: number, z: number): number => {
    const nx = Math.max(-0.5, Math.min(0.5, x / SIZE));
    const nz = Math.max(-0.5, Math.min(0.5, z / SIZE));
    return sampleHeight(nx, nz) * islandMask(nx, nz);
  };

  const getWorldY = (x: number, z: number): number => getHeightAt(x, z) * HEIGHT_SCALE;

  return { mesh, water, splatMaterial, getHeightAt, getWorldY };
}

export function disposeTerrain(context: TerrainContext): void {
  context.mesh.geometry.dispose();
  disposeTerrainSplatMaterial(context.splatMaterial);
  context.water.geometry.dispose();
  (context.water.material as { dispose?: () => void }).dispose?.();
}
