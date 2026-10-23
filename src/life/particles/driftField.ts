// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/driftField.ts — specks carried by the wind (leaves, pollen, fireflies), animated entirely in the shader
//
// The shader is the twin of `driftMath.ts`: a box of `count` specks follows the camera, every speck has a fixed
// seed, and where it is comes from the seed, the wind it has been carried by (`uDrift`, integrated here on the CPU
// so a gust never makes it jump), the clock and the box centre. Nothing is uploaded after the start, and the mesh
// is visible from the first frame (density 0 draws nothing) so no pipeline is compiled late.
import { type InstancedMesh, Vector2, Vector3 } from 'three';
import {
  attribute,
  float,
  fract,
  length,
  PI2,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { windUniforms } from '../../rendering/ambience/windUniforms';
import { advanceDrift, EDGE_FADE_FROM } from './driftMath';
import { createSpeckMaterial, createSpeckMesh, orbPullNode, type SpeckLook } from './speckMaterial';

/** A field's look: the numbers `VISUAL.life.LEAVES` / `POLLEN` / `FIREFLIES` hold. */
export interface DriftLook extends SpeckLook {
  boxM: number;
  heightM: number;
  windSpeedMul: number;
  fallMps: number;
  wobbleM: number;
  wobbleHz: number;
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

/** Where in its fall a speck fades in at the top and out at the ground (share of the box height). */
const TOP_FADE = 0.12;
const GROUND_FADE = 0.05;
/** The most the clock may advance in one frame when carrying the specks (a hitch must not throw them across). */
const MAX_CLOCK_STEP_S = 0.25;

export function createDriftField(name: string, look: DriftLook): DriftField {
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
  const placed = vec3(x, y, z);
  const position = look.orbPullM > 0 ? orbPullNode(placed, look.orbPullM) : placed;

  const fromCentre = length(vec2(u.sub(0.5), lz.sub(0.5)).mul(2));
  const edge = float(1).sub(smoothstep(float(EDGE_FADE_FROM), float(1), fromCentre));
  const fall = smoothstep(float(0), float(GROUND_FADE), v).mul(
    float(1).sub(smoothstep(float(1 - TOP_FADE), float(1), v)),
  );
  const material = createSpeckMaterial({
    name,
    look,
    iSeed,
    position,
    fade: edge.mul(fall),
    density: uDensity,
    alt: uAlt,
  });
  const mesh = createSpeckMesh(name, look, material);

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
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
