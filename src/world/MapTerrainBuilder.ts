// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  CircleGeometry,
  type DataTexture,
  type DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
  type Texture,
} from 'three';
import { VISUAL } from '../config/visualTuning';
import type { BiomeWeightBakeOptions, MapGrids } from '../map/MapGrids';
import {
  createBiomeWeightTexture,
  createMeadowMaskTexture,
  createPathMaskTexture,
  sampleBiomeNearest,
  sampleHeightBilinear,
  updateBiomeWeightTexture,
  updateMeadowMaskTexture,
  updatePathMaskTexture,
} from '../map/MapGrids';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import type { TerrainSplatMaterial } from './terrain/TerrainSplatMaterial';
import {
  createTerrainSplatMaterial,
  disposeTerrainSplatMaterial,
} from './terrain/TerrainSplatMaterial';
import {
  createTerrainShadowCastMesh,
  disposeTerrainShadowCastMesh,
} from './terrain/terrainShadowCast';
import { WORLD } from './WorldConfig';
import { disposePantheonWater } from './water/disposePantheonWater';
import { createPantheonWater } from './water/PantheonWaterMesh';
import { enableWaterReflectionLayer } from './water/waterReflectionLayers';

export interface MapTerrainContext {
  mesh: Mesh;
  /** Macro hill shadow caster — shares geometry with mesh, not drawn in main pass. */
  shadowCastMesh: Mesh | null;
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  pathMap: DataTexture;
  meadowMap: DataTexture;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  getBiomeAt: (x: number, z: number) => import('../map/MapTypes').BiomeIdValue;
  applyHeightsToMesh: () => void;
  /** Upload biome weights + path mask after paint/sculpt edits. */
  uploadBiomeMap: (opts?: BiomeWeightBakeOptions) => void;
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
  /** Draw sculpted height into sun shadow map (hill silhouettes). */
  castShadow?: boolean;
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
  const { receiveShadow = true, castShadow = VISUAL.terrain.castShadow, waterNormals } = options;
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const meshSegments = VISUAL.terrain.meshSegments;
  const geometry = new PlaneGeometry(SIZE, SIZE, meshSegments, meshSegments);
  geometry.rotateX(-Math.PI / 2);

  const biomeMap = createBiomeWeightTexture(grids);
  const pathMap = createPathMaskTexture(grids);
  const meadowMap = createMeadowMaskTexture(grids);
  const splatMaterial = createTerrainSplatMaterial(textures, sun, {
    biomeMap,
    pathMap,
    meadowMap,
    vertexDisplacement: textures.hasDisplacementMaps && VISUAL.terrain.displacementEnabled,
  });
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.castShadow = false;
  mesh.receiveShadow = receiveShadow;
  enableWaterReflectionLayer(mesh);
  scene.add(mesh);

  let shadowCastMesh: Mesh | null = null;
  if (castShadow) {
    shadowCastMesh = createTerrainShadowCastMesh(geometry);
    scene.add(shadowCastMesh);
  }

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
  enableWaterReflectionLayer(seafloor);
  scene.add(seafloor);

  const water: Object3D = waterNormals
    ? createPantheonWater(waterNormals, { waterRadius, waterY })
    : new Object3D();
  scene.add(water);

  const getHeightAt = (x: number, z: number) => sampleHeightBilinear(grids, x, z, SIZE);
  const getWorldY = (x: number, z: number) => getHeightAt(x, z) * HEIGHT_SCALE;
  const getBiomeAt = (x: number, z: number) => sampleBiomeNearest(grids, x, z, SIZE);
  const uploadBiomeMap = (opts?: BiomeWeightBakeOptions) => {
    updateBiomeWeightTexture(biomeMap, grids, opts);
    updatePathMaskTexture(pathMap, grids, opts);
    updateMeadowMaskTexture(meadowMap, grids, opts);
  };

  return {
    mesh,
    shadowCastMesh,
    water,
    seafloor,
    splatMaterial,
    grids,
    biomeMap,
    pathMap,
    meadowMap,
    getHeightAt,
    getWorldY,
    getBiomeAt,
    applyHeightsToMesh,
    uploadBiomeMap,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  if (context.shadowCastMesh) {
    disposeTerrainShadowCastMesh(context.shadowCastMesh);
  }
  context.mesh.geometry.dispose();
  disposeTerrainSplatMaterial(context.splatMaterial);
  context.biomeMap.dispose();
  context.pathMap.dispose();
  context.meadowMap.dispose();
  disposePantheonWater(context.water);
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
