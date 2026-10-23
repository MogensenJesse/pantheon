// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/cloudField.ts — a small cloud of life around one place (fireflies, dust motes, shed leaves)
//
// The shader is the twin of `cloudMath.ts`. The cloud has a centre, a level 0..1 (the share of its specks shown)
// and nothing else: where a speck is comes from its seed, the clock and the wind. The mesh is visible from the first
// frame (level 0 draws nothing) so no pipeline is compiled late.
import { type InstancedMesh, Vector3 } from 'three';
import {
  attribute,
  cos,
  float,
  fract,
  PI,
  PI2,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import { windUniforms } from '../../rendering/ambience/windUniforms';
import type { TslNode } from '../../world/grass/tsl/tslNode';
import type { CloudShape } from './cloudMath';
import { createSpeckMaterial, createSpeckMesh, orbPullNode, type SpeckLook } from './speckMaterial';

export interface CloudLook extends SpeckLook, CloudShape {}

export interface CloudFieldState {
  centre: Vector3;
  /** The share of the specks shown, 0..1. */
  level: number;
  /** Radius of the disc or ring, metres (the look's default when omitted). */
  spreadM?: number;
}

export interface CloudField {
  readonly mesh: InstancedMesh;
  update: (state: CloudFieldState) => void;
  dispose: () => void;
}

export function createCloudField(
  name: string,
  look: CloudLook,
  options: { ring?: boolean } = {},
): CloudField {
  const uCentre = uniform(new Vector3());
  const uSpread = uniform(look.spreadM);
  const uLevel = uniform(0);
  const iSeed = attribute('iSeed', 'vec4');
  const clock = windUniforms.uWindClock;
  // how far the wind carries a speck in a second: the shared wind's heading and boost times the look's speed
  const wind = windUniforms.uWindDirection.mul(windUniforms.uWindBoost.mul(look.speedMps));

  const sway = clock.mul(PI2.mul(look.wobbleHz));
  const wobbleX = sin(sway.add(iSeed.z.mul(PI2))).mul(look.wobbleM);
  const wobbleZ = sin(sway.mul(0.77).add(iSeed.x.mul(PI2))).mul(look.wobbleM);
  const radius = options.ring
    ? uSpread.mul(float(0.85).add(iSeed.z.mul(0.15)))
    : uSpread.mul(sqrt(iSeed.z));

  let placed: TslNode;
  let fade: TslNode;
  if (look.style === 'swirl') {
    const turn = step(0.5, fract(iSeed.w.mul(5.17)))
      .mul(2)
      .sub(1);
    const angle = iSeed.x
      .mul(PI2)
      .add(clock.mul(look.orbitRadPerS).mul(iSeed.w.mul(0.6).add(0.4)).mul(turn));
    placed = vec3(
      uCentre.x.add(cos(angle).mul(radius)).add(wobbleX),
      uCentre.y
        .add(0.4)
        .add(fract(iSeed.y.mul(7.7)).mul(look.heightM))
        .add(sin(sway.mul(1.3).add(iSeed.w.mul(PI2))).mul(0.35)),
      uCentre.z.add(sin(angle).mul(radius)).add(wobbleZ),
    );
    fade = float(1);
  } else {
    const age = fract(iSeed.y.add(clock.div(look.lifeS)));
    const angle = iSeed.x.mul(PI2);
    const carry = age.mul(look.lifeS);
    const rising = look.style === 'rise';
    placed = vec3(
      uCentre.x.add(cos(angle).mul(radius)).add(wobbleX).add(wind.x.mul(carry)),
      uCentre.y.add((rising ? age : float(1).sub(age)).mul(look.heightM)),
      uCentre.z.add(sin(angle).mul(radius)).add(wobbleZ).add(wind.y.mul(carry)),
    );
    fade = rising
      ? sin(age.mul(PI))
      : smoothstep(float(0), float(0.1), age).mul(
          float(1).sub(smoothstep(float(0.85), float(1), age)),
        );
  }
  const position = look.orbPullM > 0 ? orbPullNode(placed, look.orbPullM) : placed;
  const material = createSpeckMaterial({
    name,
    look,
    iSeed,
    position,
    fade,
    density: uLevel,
  });
  const mesh = createSpeckMesh(name, look, material);

  return {
    mesh,
    update: (state) => {
      uCentre.value.copy(state.centre);
      uLevel.value = state.level;
      uSpread.value = state.spreadM ?? look.spreadM;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
