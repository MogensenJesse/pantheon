// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/cloudField.ts — a small cloud of life around one place (fireflies, dust motes, shed leaves)
//
// The shader is the twin of `cloudMath.ts`. The cloud has a centre, a radius, a level 0..1 (the share of its specks
// shown) and nothing else: where a speck is comes from its seed, the clock and the wind. The mesh is visible from the first
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
import type { GroundNode } from './groundNode';
import { createLiveLook } from './liveLook';
import { orbPullNode } from './orbNotice';
import { createSpeckMaterial, createSpeckMesh, type SpeckLook } from './speckMaterial';

export interface CloudLook extends SpeckLook, CloudShape {}

export interface CloudFieldState {
  /** The place, in x and z (its y is not read: every speck rides the ground under itself). */
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
  groundNode: GroundNode,
  options: { ring?: boolean } = {},
): CloudField {
  const uCentre = uniform(new Vector3());
  const uSpread = uniform(look.spreadM);
  const uLevel = uniform(0);
  const iSeed = attribute('iSeed', 'vec4');
  const clock = windUniforms.uWindClock;
  // the look's numbers as uniforms, so the DEV panel's edits of the config reach the shader
  const live = createLiveLook();
  const heightM = live.num(() => look.heightM);
  const lifeS = live.num(() => look.lifeS);
  const wobbleM = live.num(() => look.wobbleM);
  // how far the wind carries a speck in a second: the shared wind's heading and boost times the look's speed
  const wind = windUniforms.uWindDirection.mul(
    windUniforms.uWindBoost.mul(live.num(() => look.speedMps)),
  );

  const sway = clock.mul(PI2.mul(live.num(() => look.wobbleHz)));
  const wobbleX = sin(sway.add(iSeed.z.mul(PI2))).mul(wobbleM);
  const wobbleZ = sin(sway.mul(0.77).add(iSeed.x.mul(PI2))).mul(wobbleM);
  const radius = options.ring
    ? uSpread.mul(float(0.85).add(iSeed.z.mul(0.15)))
    : uSpread.mul(sqrt(iSeed.z));

  let placed: TslNode;
  let fade: TslNode;
  if (look.style === 'swirl') {
    const turn = step(0.5, fract(iSeed.w.mul(5.17)))
      .mul(2)
      .sub(1);
    const angle = iSeed.x.mul(PI2).add(
      clock
        .mul(live.num(() => look.orbitRadPerS))
        .mul(iSeed.w.mul(0.6).add(0.4))
        .mul(turn),
    );
    const x = uCentre.x.add(cos(angle).mul(radius)).add(wobbleX);
    const z = uCentre.z.add(sin(angle).mul(radius)).add(wobbleZ);
    placed = vec3(
      x,
      groundNode(x, z)
        .add(0.4)
        .add(fract(iSeed.y.mul(7.7)).mul(heightM))
        .add(sin(sway.mul(1.3).add(iSeed.w.mul(PI2))).mul(0.35)),
      z,
    );
    fade = float(1);
  } else {
    const age = fract(iSeed.y.add(clock.div(lifeS)));
    const angle = iSeed.x.mul(PI2);
    const carry = age.mul(lifeS);
    const rising = look.style === 'rise';
    const x = uCentre.x.add(cos(angle).mul(radius)).add(wobbleX).add(wind.x.mul(carry));
    const z = uCentre.z.add(sin(angle).mul(radius)).add(wobbleZ).add(wind.y.mul(carry));
    placed = vec3(x, groundNode(x, z).add((rising ? age : float(1).sub(age)).mul(heightM)), z);
    fade = rising
      ? sin(age.mul(PI))
      : smoothstep(float(0), float(0.1), age).mul(
          float(1).sub(smoothstep(float(0.85), float(1), age)),
        );
  }
  const position =
    look.orbPullM > 0
      ? orbPullNode(
          placed,
          live.num(() => look.orbPullM),
        )
      : placed;
  const material = createSpeckMaterial({
    name,
    look,
    iSeed,
    position,
    fade,
    density: uLevel,
    live,
  });
  const mesh = createSpeckMesh(name, look, material);

  return {
    mesh,
    update: (state) => {
      live.sync();
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
