// src/world/mapProps/tsl/propSwayTsl.ts — tree sway in the vertex stage (the shader twin of `sway/treeSway.ts`)
import {
  float,
  length,
  positionGeometry,
  positionLocal,
  pow,
  sin,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import { windUniforms } from '../../../rendering/ambience/windUniforms';
import { propSunReceiverUniforms } from '../../../rendering/sunShadow/receiverUniforms';
import { propSwayUniforms, SWAY_GUST_SLOW_SHARE } from '../config/propSwayUniforms';
import { SWAY_SHAPE as S, type TreeSway } from '../sway/treeSway';

type TslNode = any;

/**
 * `material.positionNode` for a tree: the instanced position moved by the wind. It runs after instancing, so
 * `positionLocal` is already in world space (prop meshes sit at the origin) and the phase comes from where the
 * tree stands, never from its instance index (which changes when the tree changes level of detail). The lean
 * is the same at every `lodBand`; only lod0 adds the leaf flutter, so a tree does not jump at a band change.
 */
export function createPropSwayPositionNode(sway: TreeSway, lodBand: 0 | 1 | 2): TslNode {
  const { uWindDirection: dir, uWindClock: clock, uWindBoost: boost } = windUniforms;
  const u = propSwayUniforms;
  const world = positionLocal;
  const xz = vec2(world.x, world.z);
  const perp = vec2(dir.y.negate(), dir.x);
  const along = xz.dot(dir);
  const across = xz.dot(perp);

  // 0 at the foot, 1 at the top; the lean is weighted by it so the trunk stays stiff
  const share = positionGeometry.y.sub(sway.footY).div(sway.heightM).clamp();
  const weight = pow(share, u.uHeightPower);

  // the gust: a broad wave travelling along the wind plus a faster, narrower one
  const phase = along.mul(u.uWaveK).sub(clock.mul(u.uWaveOmega));
  const slow = sin(phase).mul(0.5).add(0.5);
  const fast = sin(
    phase
      .mul(S.FAST_RATE)
      .add(across.mul(u.uWaveK.mul(S.FAST_ACROSS)))
      .add(S.FAST_OFFSET),
  )
    .mul(0.5)
    .add(0.5);
  const gust = slow.mul(SWAY_GUST_SLOW_SHARE).add(fast.mul(1 - SWAY_GUST_SLOW_SHARE));

  const scale = boost.mul(sway.bend).mul(sway.heightM).mul(weight);
  const alongM = u.uBaseLean.add(u.uGustLean.mul(gust)).mul(scale);
  const sideM = fast.sub(0.5).mul(u.uGustLean).mul(u.uSideShare).mul(scale);
  let offset: TslNode = vec3(
    dir.x.mul(alongM).add(perp.x.mul(sideM)),
    float(0),
    dir.y.mul(alongM).add(perp.y.mul(sideM)),
  );

  if (lodBand === 0) {
    const vertexPhase = world.x
      .mul(S.VERTEX_X)
      .add(world.z.mul(S.VERTEX_Z))
      .add(positionGeometry.y.mul(S.VERTEX_Y));
    const t = clock.mul(u.uFlutterOmega);
    const fa = sin(t.add(vertexPhase))
      .mul(S.MAIN_WEIGHT)
      .add(sin(t.mul(S.SECOND_RATE).add(vertexPhase.mul(S.SECOND_PHASE))).mul(S.SECOND_WEIGHT));
    const fb = sin(t.mul(S.ACROSS_RATE).add(vertexPhase.mul(S.ACROSS_PHASE)).add(S.ACROSS_OFFSET));
    const { uPlayerPosition: orb } = propSunReceiverUniforms;
    const orbDist = length(xz.sub(vec2(orb.x, orb.z)));
    const orbLift = float(1).add(
      u.uOrbGain.mul(float(1).sub(smoothstep(float(0), u.uOrbRadius, orbDist))),
    );
    const flutterM = share
      .mul(share)
      .mul(share)
      .mul(u.uFlutterM)
      .mul(sway.flutter)
      .mul(boost)
      .mul(orbLift);
    offset = offset.add(
      vec3(
        dir.x.mul(fa).add(perp.x.mul(fb)),
        fa.mul(S.LIFT),
        dir.y.mul(fa).add(perp.y.mul(fb)),
      ).mul(flutterM),
    );
  }

  return positionLocal.add(offset);
}
