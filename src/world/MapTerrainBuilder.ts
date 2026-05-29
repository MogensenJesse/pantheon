// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  CircleGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  type DataTexture,
  type Texture,
} from 'three';
import type { TerrainSplatMaterial } from './terrain/TerrainSplatMaterial';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import {
  createTerrainSplatMaterial,
  disposeTerrainSplatMaterial,
} from './terrain/TerrainSplatMaterial';
import { WORLD } from './WorldConfig';
import { createPantheonWater } from './water/PantheonWaterMesh';
import { disposePantheonWater } from './water/disposePantheonWater';
import type { MapGrids } from '../map/MapGrids';
import {
  createBiomeWeightTexture,
  sampleHeightBilinear,
  updateBiomeWeightTexture,
} from '../map/MapGrids';

export interface MapTerrainContext {
  mesh: Mesh;
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  applyHeightsToMesh: () => void;
  uploadBiomeMap: () => void;
}

function applyGridHeightsToGeometry(mesh: Mesh, grids: MapGrids): void {
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const heightNorms: number[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = sampleHeightBilinear(grids, x, z, SIZE);
    positions.setY(i, h * HEIGHT_SCALE);
    heightNorms.push(h);
  }

  geometry.setAttribute('heightNorm', new Float32BufferAttribute(heightNorms, 1));
  geometry.computeVertexNormals();
  positions.needsUpdate = true;
}

export interface BuildMapTerrainOptions {
  receiveShadow?: boolean;
  /** Normal map for the reflective ocean. Omit (e.g. map editor) to skip water. */
  waterNormals?: Texture;
}

export function buildMapTerrain(
  scene: Scene,
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  grids: MapGrids,
  options: BuildMapTerrainOptions = {},
): MapTerrainContext {
  const { receiveShadow = true, waterNormals } = options;
  const { SIZE, SEGMENTS, HEIGHT_SCALE } = WORLD;
  const geometry = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const biomeMap = createBiomeWeightTexture(grids);
  const splatMaterial = createTerrainSplatMaterial(textures, sun, { biomeMap });
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);

  const applyHeightsToMesh = () => applyGridHeightsToGeometry(mesh, grids);
  applyHeightsToMesh();

  const waterY = WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  const waterRadius = WORLD.WATER_PLANE_SIZE * 0.5;

  const seafloorGeo = new CircleGeometry(waterRadius * 1.02, 64);
  seafloorGeo.rotateX(-Math.PI / 2);
  const seafloor = new Mesh(
    seafloorGeo,
    new MeshBasicMaterial({ color: 0x0a1a2e, depthWrite: true }),
  );
  seafloor.position.y = waterY - 4;
  scene.add(seafloor);

  const water: Object3D = waterNormals
    ? createPantheonWater(waterNormals, { waterRadius, waterY })
    : new Object3D();
  scene.add(water);

  const getHeightAt = (x: number, z: number) => sampleHeightBilinear(grids, x, z, SIZE);
  const getWorldY = (x: number, z: number) => getHeightAt(x, z) * HEIGHT_SCALE;
  const uploadBiomeMap = () => updateBiomeWeightTexture(biomeMap, grids);

  return {
    mesh,
    water,
    seafloor,
    splatMaterial,
    grids,
    biomeMap,
    getHeightAt,
    getWorldY,
    applyHeightsToMesh,
    uploadBiomeMap,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  context.mesh.geometry.dispose();
  disposeTerrainSplatMaterial(context.splatMaterial);
  context.biomeMap.dispose();
  disposePantheonWater(context.water);
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
