// src/world/TerrainGenerator.ts
import {
  CircleGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  type Texture,
} from 'three';
import type { TerrainSplatMaterial } from './terrain/TerrainSplatMaterial';
import { WORLD } from './WorldConfig';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import {
  createTerrainSplatMaterial,
  disposeTerrainSplatMaterial,
} from './terrain/TerrainSplatMaterial';
import { sampleProceduralHeight, sampleProceduralHeightAt } from './proceduralHeight';
import { createPantheonWater } from './water/PantheonWaterMesh';
import { disposePantheonWater } from './water/disposePantheonWater';

/** Height sampling + render meshes shared by procedural and authored terrain. */
export interface TerrainSurface {
  mesh: Mesh;
  /** Reflective ocean (three.js WaterMesh) spanning the island disc. */
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
}

export interface TerrainContext extends TerrainSurface {}

export function buildTerrain(
  scene: Scene,
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  waterNormals: Texture,
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
    const h = sampleProceduralHeight(nx, nz);
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

  const water = createPantheonWater(waterNormals, { waterRadius, waterY });
  scene.add(water);

  const getHeightAt = (x: number, z: number): number => sampleProceduralHeightAt(x, z, SIZE);
  const getWorldY = (x: number, z: number): number => getHeightAt(x, z) * HEIGHT_SCALE;

  return { mesh, water, seafloor, splatMaterial, getHeightAt, getWorldY };
}

export function disposeTerrain(context: TerrainContext): void {
  context.mesh.geometry.dispose();
  disposeTerrainSplatMaterial(context.splatMaterial);
  disposePantheonWater(context.water);
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
