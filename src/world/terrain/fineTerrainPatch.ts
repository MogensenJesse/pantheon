// src/world/terrain/fineTerrainPatch.ts — 2 m facets over the village region: the mesh that shows its levelling
import { DataTexture, FloatType, Mesh, NearestFilter, type PlaneGeometry, RedFormat } from 'three';
import { attribute, Fn, normalize, positionWorld, vec2, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { WORLD } from '../../config/world';
import type { MapGrids } from '../../map/MapGrids';
import { enableWaterReflectionLayer } from '../../rendering/layers/waterReflectionLayers';
import { configureMeshShadowCast, unregisterMeshShadowCast } from '../../rendering/sunShadow';
import { FINE_DIVISOR, type FineDelta, type NodeBounds } from './cpu/fineDelta';
import { terrainFacetStepM } from './cpu/terrainChiselCpu';
import { createFineGeometry } from './fineTerrainGeometry';
import type { TerrainSplatMaterial } from './material/createTerrainSplatMaterial';
import { createFineDeltaTsl } from './tsl/fineDeltaTsl';
import type { MacroHeightTsl } from './tsl/terrainMacroHeightTsl';

export interface FineTerrain {
  readonly delta: FineDelta;
  /** The patch; child it to the terrain mesh so hide toggles and transforms follow. */
  readonly mesh: Mesh;
  /** Coarse (8 m chisel) Y at every node: what the region was before any levelling. */
  readonly baseNodeY: Float32Array;
  /** Macro height Fns whose chisel Y includes the offsets; grass reads its blade height from this. */
  readonly macroHeight: MacroHeightTsl;
  /** Rebake the patch triangles around changed nodes (all when omitted) and re-upload the data. */
  refresh: (bounds?: NodeBounds) => void;
  dispose: () => void;
}

/**
 * Drop the coarse cells the patch replaces. Cell k of a PlaneGeometry owns indices [6k, 6k + 6),
 * ordered by row then column. The region is whole coarse cells, so the border lines up exactly.
 */
export function carveCoarseCells(geometry: PlaneGeometry, delta: FineDelta): void {
  const { widthSegments: segX, heightSegments: segZ } = geometry.parameters;
  const size = WORLD.SIZE;
  const cellsPerSide = (delta.nodes - 1) / FINE_DIVISOR;
  const cx0 = Math.round((delta.originX / size + 0.5) * segX);
  const cz0 = Math.round((delta.originZ / size + 0.5) * segZ);
  const index = geometry.getIndex()!;
  const src = index.array;
  const keep: number[] = [];
  for (let cz = 0; cz < segZ; cz++) {
    for (let cx = 0; cx < segX; cx++) {
      if (cx >= cx0 && cx < cx0 + cellsPerSide && cz >= cz0 && cz < cz0 + cellsPerSide) continue;
      const k = (cz * segX + cx) * 6;
      for (let n = 0; n < 6; n++) keep.push(src[k + n]!);
    }
  }
  geometry.setIndex(keep);
}

export function createFineTerrain(opts: {
  delta: FineDelta;
  grids: MapGrids;
  splatMaterial: TerrainSplatMaterial;
  receiveShadow: boolean;
  castShadow: boolean;
}): FineTerrain {
  const { delta, grids, splatMaterial } = opts;
  const coarseStep = terrainFacetStepM();
  if (Math.abs(delta.stepM * FINE_DIVISOR - coarseStep) > 1e-9) {
    throw new Error(
      `detail step ${delta.stepM} m is not chisel step ${coarseStep} m / ${FINE_DIVISOR}`,
    );
  }
  const { geometry, baseNodeY, bake } = createFineGeometry(delta, grids);
  const n = delta.nodes;
  const texture = new DataTexture(delta.data, n, n, RedFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const refresh = (bounds?: NodeBounds) => {
    bake(bounds);
    texture.needsUpdate = true;
  };
  refresh();

  // The terrain's own graph, with the face normal tilted by this facet's offset slope. The chisel
  // normal (crease fillet and all) is read from the height texture as on the coarse mesh, so a facet
  // the village never touched shades exactly as before.
  const offsetSlope = attribute('aDeltaSlope', 'vec2');
  const material = new MeshBasicNodeMaterial();
  material.name = 'terrain-detail';
  material.lights = false;
  material.colorNode = splatMaterial.groundColor(
    vec2(positionWorld.x, positionWorld.z),
    (chiselNormal: any) => {
      const sx = chiselNormal.x.negate().div(chiselNormal.y).add(offsetSlope.x);
      const sz = chiselNormal.z.negate().div(chiselNormal.y).add(offsetSlope.y);
      return normalize(vec3(sx.negate(), 1, sz.negate()));
    },
  );

  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain-detail';
  mesh.frustumCulled = false;
  mesh.receiveShadow = opts.receiveShadow;
  mesh.castShadow = opts.castShadow;
  if (mesh.castShadow) configureMeshShadowCast(mesh);
  enableWaterReflectionLayer(mesh);

  const base = splatMaterial.macroHeight;
  const deltaAt = createFineDeltaTsl(delta, texture) as (worldXZ: any) => any;
  const fineY = Fn(([worldXZ]: any[]) =>
    base.chiseledWorldYAtWorldXZ(worldXZ).add(deltaAt(worldXZ)),
  );
  const macroHeight = { ...base, chiseledWorldYAtWorldXZ: fineY } as unknown as MacroHeightTsl;

  return {
    delta,
    mesh,
    baseNodeY,
    macroHeight,
    refresh,
    dispose: () => {
      if (mesh.castShadow) unregisterMeshShadowCast(mesh);
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
