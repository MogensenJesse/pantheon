// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/orbNotice.ts — how the orb draws living specks toward it (shader side)
//
// `orbNoticeUniforms` is written once a frame by `driftFields.ts`; `orbPullNode` is what a field's position node adds.
import { Vector3 } from 'three';
import { float, smoothstep, uniform } from 'three/tsl';
import { life } from '../../config/visual/life';

const NOTICE = life.ORB_NOTICE;

/** The orb as the shaders see it: where it is and how hard creatures are drawn to it (0 until the world is alive). */
export const orbNoticeUniforms = {
  uOrb: uniform(new Vector3()),
  uOrbPull: uniform(0),
};

/** The twin of `orbPulled` in driftMath.ts. */
export function orbPullNode(position, radiusM: number) {
  const { uOrb, uOrbPull } = orbNoticeUniforms;
  const d = position.sub(uOrb).length();
  const pull = uOrbPull.mul(
    float(1).sub(smoothstep(float(radiusM * NOTICE.INNER_SHARE), float(radiusM), d)),
  );
  const keep = float(1).sub(float(1 - NOTICE.KEEP).mul(pull));
  return uOrb.add(position.sub(uOrb).mul(keep));
}
