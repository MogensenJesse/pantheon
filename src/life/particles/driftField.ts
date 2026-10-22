// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/driftField.ts — specks carried by the wind (leaves, pollen), animated entirely in the shader
//
// The shader is the twin of `driftMath.ts`: a box of `count` specks follows the camera, every speck has a fixed
// seed, and where it is comes from the seed, the wind it has been carried by (`uDrift`, integrated here on the CPU
// so a gust never makes it jump), the clock and the box centre. Nothing is uploaded after the start, and the mesh
// is visible from the first frame (density 0 draws nothing) so no pipeline is compiled late.
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  cos,
  distance,
  float,
  fract,
  length,
  mix,
  PI2,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { windUniforms } from '../../rendering/ambience/windUniforms';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../rendering/glowMaterial';
import { propShadowUniforms } from '../../world/mapProps/config/mapPropShadowUniforms';
import { advanceDrift, seedAt } from './driftMath';

/** A specks' look: the numbers `VISUAL.life.LEAVES` / `POLLEN` hold. */
export interface DriftLook {
  count: number;
  boxM: number;
  heightM: number;
  shape: 'leaf' | 'dot';
  additive: boolean;
  sizeM: readonly [number, number];
  colorA: string;
  colorB: string;
  altColor: string;
  hdr: number;
  alpha: number;
  windSpeedMul: number;
  fallMps: number;
  wobbleM: number;
  wobbleHz: number;
  spin: number;
  nightMul: number;
}

export interface DriftFieldState {
  /** The centre of the box (ground height under the camera) and the share of the specks shown, 0..1. */
  centre: Vector3;
  density: number;
  /** The share of the specks drawn in the alternate colour (birch leaves), 0..1. */
  alt: number;
  windDirX: number;
  windDirZ: number;
  windBoost: number;
  /** The render-rate wind clock (pause-aware). */
  windClock: number;
}

export interface DriftField {
  readonly mesh: InstancedMesh;
  update: (state: DriftFieldState) => void;
  dispose: () => void;
}

/** A speck fades in over this distance from the camera (m), so none fills the screen. */
const NEAR_FADE_M = [0.8, 3.5] as const;
/** Where in its fall a speck fades in at the top and out at the ground (share of the box height). */
const TOP_FADE = 0.12;
const GROUND_FADE = 0.05;
/** The most the clock may advance in one frame when carrying the specks (a hitch must not throw them across). */
const MAX_CLOCK_STEP_S = 0.25;

export function createDriftField(name: string, look: DriftLook, renderOrder = 5): DriftField {
  const uCentre = uniform(new Vector3());
  const uDrift = uniform(new Vector2());
  const uDensity = uniform(0);
  const uAlt = uniform(0);
  const iSeed = attribute('iSeed', 'vec4');
  const clock = windUniforms.uWindClock;

  const box = float(look.boxM);
  const height = float(look.heightM);
  // a lattice fixed in the world: the box follows the camera, the specks do not
  const u = fract(iSeed.x.add(uDrift.x.sub(uCentre.x).div(box)));
  const lz = fract(iSeed.z.add(uDrift.y.sub(uCentre.z).div(box)));
  const v = fract(iSeed.y.sub(clock.mul(look.fallMps / look.heightM)));
  const sway = clock.mul(PI2.mul(look.wobbleHz));
  const x = uCentre.x
    .add(u.sub(0.5).mul(box))
    .add(sin(sway.add(iSeed.z.mul(PI2))).mul(look.wobbleM));
  const y = uCentre.y
    .add(v.mul(height))
    .add(sin(sway.mul(1.3).add(iSeed.w.mul(PI2))).mul(look.wobbleM * 0.25));
  const z = uCentre.z
    .add(lz.sub(0.5).mul(box))
    .add(sin(sway.mul(0.77).add(iSeed.x.mul(PI2))).mul(look.wobbleM));
  const position = vec3(x, y, z);

  const fromCentre = length(vec2(u.sub(0.5), lz.sub(0.5)).mul(2));
  const edge = float(1).sub(smoothstep(float(0.55), float(1), fromCentre));
  const near = smoothstep(
    float(NEAR_FADE_M[0]),
    float(NEAR_FADE_M[1]),
    distance(position, cameraPosition),
  );
  const fall = smoothstep(float(0), float(GROUND_FADE), v).mul(
    float(1).sub(smoothstep(float(1 - TOP_FADE), float(1), v)),
  );
  // the first share of the specks, each fading in a little after the last so a change of density is gradual
  const shown = smoothstep(iSeed.w, iSeed.w.add(0.08), uDensity.mul(1.08));

  const variation = fract(iSeed.z.mul(11.3));
  const size = mix(
    float(look.sizeM[0]),
    float(look.sizeM[1]),
    fract(iSeed.y.mul(13.7).add(iSeed.z.mul(5.1))),
  );
  const base = mix(vec3(new Color(look.colorA)), vec3(new Color(look.colorB)), variation);
  const tint = mix(base, vec3(new Color(look.altColor)), step(iSeed.z, uAlt));
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
  const visible = shown.mul(edge).mul(near).mul(fall).mul(mask).mul(look.alpha);

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
  mesh.renderOrder = look.additive ? GLOW_MESH_RENDER_ORDER : renderOrder;

  const drift = { x: 0, z: 0 };
  let lastClock: number | null = null;

  return {
    mesh,
    update: (state) => {
      const dt =
        lastClock === null
          ? 0
          : Math.min(MAX_CLOCK_STEP_S, Math.max(0, state.windClock - lastClock));
      lastClock = state.windClock;
      advanceDrift(drift, state.windDirX, state.windDirZ, look.windSpeedMul * state.windBoost, dt);
      // the lattice repeats every box, so keep the numbers small
      drift.x %= look.boxM;
      drift.z %= look.boxM;
      uDrift.value.set(drift.x, drift.z);
      uCentre.value.copy(state.centre);
      uDensity.value = state.density;
      uAlt.value = state.alt;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
