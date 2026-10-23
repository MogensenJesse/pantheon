// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/speckMaterial.ts — how a speck looks, shared by the camera box (driftField) and the place clouds (cloudField)
//
// A speck is a camera-facing sprite: a tumbling leaf or a soft dot, in a colour mixed from the look's two colours
// (and an alternate for a share of them), lit by the time of day and optionally blinking. Additive specks (pollen,
// fireflies, dust) glow with the bloom scale; the others blend normally.
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
} from 'three';
import {
  abs,
  cameraPosition,
  cos,
  distance,
  float,
  fract,
  hash,
  instanceIndex,
  length,
  mix,
  PI2,
  sin,
  smoothstep,
  step,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { windUniforms } from '../../rendering/ambience/windUniforms';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../rendering/glowMaterial';
import { propShadowUniforms } from '../../world/mapProps/config/mapPropShadowUniforms';
import { seedAt } from './driftMath';

/** The part of a field's look that decides how one speck is drawn. */
export interface SpeckLook {
  count: number;
  shape: 'leaf' | 'dot';
  additive: boolean;
  sizeM: readonly [number, number];
  colorA: string;
  colorB: string;
  /** The colour of the share of specks picked out by `alt` (none for a look with no alternate). */
  altColor?: string;
  hdr: number;
  alpha: number;
  spin: number;
  blinkHz: number;
  nightMul: number;
  /** Specks within this distance of the orb drift toward it (0 = they ignore it). */
  orbPullM: number;
}

/** Where a non-additive speck draws among the transparent things. */
const SPECK_RENDER_ORDER = 5;

/** A speck fades in over this distance from the camera (m), so none fills the screen. */
const NEAR_FADE_M = [0.8, 3.5] as const;

/**
 * `fade` is what the place of a speck says about it (edges, ground, age), 0..1.
 * Returns the material.
 */
export function createSpeckMaterial(options: {
  name: string;
  look: SpeckLook;
  iSeed;
  position;
  fade;
  /** The share of the specks shown, 0..1 (a uniform): the first share of them by their rank `iSeed.w`. */
  density;
  /** The share of the specks drawn in the look's alternate colour, 0..1 (ignored for a look with none). */
  alt?;
}): SpriteNodeMaterial {
  const { name, look, iSeed, position, fade, density, alt } = options;
  const clock = windUniforms.uWindClock;

  const variation = fract(iSeed.z.mul(11.3));
  const size = mix(
    float(look.sizeM[0]),
    float(look.sizeM[1]),
    fract(iSeed.y.mul(13.7).add(iSeed.z.mul(5.1))),
  );
  const base = mix(vec3(new Color(look.colorA)), vec3(new Color(look.colorB)), variation);
  // which specks take the alternate colour: a hash of the index, not a seed channel (x, y and z set where a speck
  // sits in its tile, so a channel would put the alternates in one band of every tile)
  const tint =
    look.altColor && alt
      ? mix(base, vec3(new Color(look.altColor)), step(hash(instanceIndex.add(7919)), alt))
      : base;
  const { uDaylight, uNightSkyDaylight } = propShadowUniforms;
  const day = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const lit = mix(float(look.nightMul), float(1), day);

  const r = length(uv().sub(0.5)).mul(2);
  const mask =
    look.shape === 'leaf'
      ? float(1).sub(
          smoothstep(float(0.55), float(1), length(uv().sub(0.5).mul(vec2(1.3, 2)).mul(2))),
        )
      : float(1).sub(smoothstep(float(0.12), float(1), r));
  let blink = float(1);
  if (look.blinkHz > 0) {
    // the twin of `blinkAt` in driftMath.ts
    const phase = fract(clock.mul(look.blinkHz).add(fract(iSeed.w.mul(37.31))));
    const s = sin(phase.mul(PI2)).mul(0.5).add(0.5);
    blink = mix(float(0.1), float(1), smoothstep(float(0.45), float(0.95), s));
  }
  // the first share of the specks, each fading in a little after the last so a change of density is gradual
  const shown = smoothstep(iSeed.w, iSeed.w.add(0.08), density.mul(1.08));
  // no speck fills the screen: it fades in with its distance from the camera
  const near = smoothstep(
    float(NEAR_FADE_M[0]),
    float(NEAR_FADE_M[1]),
    distance(position, cameraPosition),
  );
  const visible = shown.mul(near).mul(fade).mul(mask).mul(blink).mul(look.alpha);

  const material = new SpriteNodeMaterial();
  material.name = name;
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.positionNode = position;
  if (look.shape === 'leaf') {
    // a tumbling leaf turns edge-on now and then
    const flip = abs(cos(clock.mul(look.spin * 0.6).add(iSeed.x.mul(PI2))))
      .mul(0.7)
      .add(0.3);
    material.scaleNode = vec3(size.mul(flip), size, 1);
    material.rotationNode = clock.mul(look.spin).add(iSeed.y.mul(PI2));
  } else {
    material.scaleNode = vec3(size, size, 1);
  }
  if (look.additive) {
    material.blending = AdditiveBlending;
    material.forceSinglePass = true;
    material.colorNode = tint.mul(lit).mul(look.hdr).mul(uHdrBloomScale).mul(visible);
  } else {
    material.colorNode = tint.mul(lit);
    material.opacityNode = visible;
  }
  return material;
}

/** The mesh of `look.count` specks: one plane each, with a fixed seed that tells the shader which speck it is. */
export function createSpeckMesh(
  name: string,
  look: SpeckLook,
  material: SpriteNodeMaterial,
): InstancedMesh {
  const seeds = new InstancedBufferAttribute(new Float32Array(look.count * 4), 4);
  for (let i = 0; i < look.count; i++) {
    const s = seedAt(i, look.count);
    seeds.setXYZW(i, s.x, s.y, s.z, s.w);
  }
  seeds.needsUpdate = true;

  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('iSeed', seeds);
  const mesh = new InstancedMesh(geometry, material, look.count);
  mesh.name = name;
  mesh.count = look.count;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = look.additive ? GLOW_MESH_RENDER_ORDER : SPECK_RENDER_ORDER;
  return mesh;
}
