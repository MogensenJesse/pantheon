// @ts-nocheck — TSL node typings are incomplete (same as world/terrain/material/biomeSplatDisplacement.ts)
// src/world/snow/snowShellMaterial.ts — the shell: baked hull - furrow + berm (vertex), baked + field normal, cavity AO and the terrain's own lighting (fragment)
//
// Vertex: each clipmap vertex goes to its level's snapped lattice around `uCam`, reads the hull height from the baked R32F map
// (four integer loads, bilinear by hand) and, on the fine levels near the orb, the tracks field. Fragment: the snow depth map
// is the alpha (below `MIN_DEPTH_M` the pixel is dropped and the bare terrain shows), its slope plus the field's gradient is
// the normal, and the lighting is the terrain's (`terrainUniforms`, receiver sun shadow).
import { Color, type DirectionalLight, Vector2 } from 'three';
import {
  attribute,
  dot,
  Fn,
  float,
  floor,
  fract,
  If,
  ivec2,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  smoothstep,
  step,
  texture,
  textureLoad,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { computeTerrainSunVisFloor, createReceiverSunShadowNode } from '../../rendering/sunShadow';
import type { TerrainSplatMaterial } from '../terrain/material/createTerrainSplatMaterial';
import type { SnowField } from './snowField';
import type { SnowMaps } from './snowMaps';

export type SnowShellMaterial = MeshBasicNodeMaterial & {
  /** World XZ the clipmap follows (the orb); each level snaps it to its own cell size. */
  uCam: { value: Vector2 };
  uAlbedo: { value: Color };
};

/** Pixels where the snow is thinner than this (m) are dropped: the terrain shows. */
const MIN_DEPTH_M = 0.03;
/** Only levels with cells up to this (m) take the tracks as geometry; coarser ones get them as shading only. */
const FIELD_GEOMETRY_CELL_M = 0.51;

export function createSnowShellMaterial(opts: {
  terrain: TerrainSplatMaterial;
  sun: DirectionalLight;
  field: SnowField;
  maps: SnowMaps;
}): SnowShellMaterial {
  const { terrain, field, maps } = opts;
  const { terrainUniforms: U } = terrain;
  const cfg = VISUAL.snow;
  const fieldTex = texture(field.texture);
  const snowTex = texture(maps.snow);
  const worldM = maps.size * maps.texelM;
  const mapUv = (xz) => xz.add(worldM / 2).div(worldM);
  const toFieldUv = (xz) => fract(xz.div(field.windowM));

  const uCam = uniform(new Vector2());
  const uAlbedo = uniform(new Color(cfg.albedo));
  const aCell = attribute('aCell', 'float');
  const trackReach = (xz) =>
    float(1).sub(smoothstep(cfg.fieldNearM, cfg.fieldFarM, xz.sub(uCam).length()));

  // Hull Y at a world XZ: bilinear over the four nearest texel centres (integer loads: R32F is not filterable).
  const hullAt = Fn(([xz]) => {
    const limit = float(maps.size - 1 - 1e-3);
    const p = xz
      .add(worldM / 2)
      .div(maps.texelM)
      .sub(0.5)
      .clamp(vec2(0, 0), vec2(limit, limit));
    const cell = p.floor();
    const t = p.sub(cell);
    const at = (dx, dz) => textureLoad(maps.hull, ivec2(cell.x.add(dx), cell.y.add(dz))).r;
    return mix(mix(at(0, 0), at(1, 0), t.x), mix(at(0, 1), at(1, 1), t.x), t.y);
  });

  const position = Fn(() => {
    const snapped = floor(uCam.div(aCell).add(0.5)).mul(aCell);
    const xz = vec2(positionLocal.x, positionLocal.z).add(snapped);
    const depth = snowTex.sample(mapUv(xz)).b;
    const reach = trackReach(xz).mul(step(aCell, float(FIELD_GEOMETRY_CELL_M)));
    const f = fieldTex.sample(toFieldUv(xz));
    // the furrow never cuts below the terrain; the berm only stands where there is snow
    const y = hullAt(xz)
      .sub(min(f.x, depth).mul(reach))
      .add(f.y.mul(smoothstep(MIN_DEPTH_M, 0.2, depth)).mul(reach));
    return vec3(xz.x, y, xz.y);
  });

  const sunShadow = createReceiverSunShadowNode(opts.sun);
  const texelM = field.windowM / field.res;
  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const mapSample = snowTex.sample(mapUv(worldXZ));
  const trackHeight = (xz) => {
    const s = fieldTex.sample(toFieldUv(xz)).level(0);
    return s.y.sub(s.x);
  };

  const color = Fn(() => {
    const reach = trackReach(worldXZ);
    const gx = float(0).toVar();
    const gz = float(0).toVar();
    const furrow = float(0).toVar();
    If(reach.greaterThan(0.001), () => {
      // slope of (berm - furrow) over a two-texel baseline: the print's relief, added to the hull's slope
      const e = float(2 * texelM);
      gx.assign(
        trackHeight(worldXZ.add(vec2(e, 0)))
          .sub(trackHeight(worldXZ.sub(vec2(e, 0))))
          .div(e.mul(2))
          .mul(reach),
      );
      gz.assign(
        trackHeight(worldXZ.add(vec2(0, e)))
          .sub(trackHeight(worldXZ.sub(vec2(0, e))))
          .div(e.mul(2))
          .mul(reach),
      );
      furrow.assign(fieldTex.sample(toFieldUv(worldXZ)).level(0).x.mul(reach));
    });
    const n = normalize(vec3(mapSample.r.add(gx).negate(), 1, mapSample.g.add(gz).negate()));
    const cavity = mix(float(1), float(0.62), smoothstep(0, 0.3, furrow));
    const sunVis = computeTerrainSunVisFloor(sunShadow, U.uShadowFloor);
    const ndl = max(dot(n, U.uSunDirection), 0);
    const light = U.uAmbientColor
      .mul(U.uAmbientIntensity)
      .add(U.uSunColor.mul(U.uSunIntensity).mul(ndl).mul(sunVis));
    return uAlbedo.mul(cavity).mul(light);
  });

  const material = new MeshBasicNodeMaterial() as SnowShellMaterial;
  material.name = 'snow-shell';
  material.lights = false;
  material.positionNode = position();
  material.colorNode = color();
  material.opacityNode = mapSample.b;
  material.alphaTest = MIN_DEPTH_M;
  // pull the shell towards the camera a hair so it wins the depth test against the terrain it hides
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.uCam = uCam;
  material.uAlbedo = uAlbedo;
  return material;
}
