// src/rendering/underwater/underwaterRippleTsl.ts — screen-space wobble of the whole view while the camera is under the surface
import { float, sin, vec2 } from 'three/tsl';
import { underwaterUniforms as U } from './underwaterUniforms';

type TslNode = any;

/** UV offset to add to the scene sample: two crossing sine fields, zero above water (scaled by `uSubmerge`). */
export function underwaterRippleOffsetTsl(uv: TslNode): TslNode {
  const t = U.uClock.mul(U.uRippleSpeed);
  const k = float(Math.PI * 2).div(U.uRippleScale);
  const dx = sin(uv.y.mul(k).add(t)).add(sin(uv.y.mul(k).mul(2.3).sub(t.mul(1.7))).mul(0.5));
  const dy = sin(uv.x.mul(k).mul(0.8).sub(t.mul(1.2))).add(
    sin(uv.x.mul(k).mul(2.1).add(t.mul(1.4))).mul(0.5),
  );
  return vec2(dx, dy).mul(U.uRippleAmp).mul(U.uSubmerge);
}
