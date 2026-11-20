// src/rendering/underwater/underwaterPostTsl.ts — the underwater pieces of the full-screen post pass: the view ray, the horizon fill, the screen wobble
import {
  float,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  screenSize,
  select,
  sin,
  smoothstep,
  vec2,
} from 'three/tsl';
import { WORLD } from '../../config/world';
import { underwaterColorAtDepthTsl, underwaterSurfaceYTsl } from './underwaterTsl';
import { underwaterUniforms as U } from './underwaterUniforms';

type TslNode = any;

/**
 * World-space view ray of the game camera at screen `uv`, scaled so its forward part is 1: its parameter is then the view
 * depth the depth buffer holds. For post passes, where the camera nodes are the full-screen quad's, so it reads `uCam*`.
 */
export function underwaterViewRayTsl(uv: TslNode): TslNode {
  return U.uCamFwd
    .add(U.uCamRight.mul(uv.x.mul(2).sub(1).mul(U.uCamTan.x)))
    .add(U.uCamUp.mul(float(1).sub(uv.y.mul(2)).mul(U.uCamTan.y)));
}

const MAP_HALF_M = WORLD.SIZE / 2;

/** Distance along a horizontal ray, from coordinate `c` with direction `d` on one axis, to the map's edge on that side. */
function mapEdgeDistanceTsl(c: TslNode, d: TslNode): TslNode {
  return select(
    d.greaterThan(0),
    float(MAP_HALF_M)
      .sub(c)
      .div(max(d, float(1e-4))),
    float(-MAP_HALF_M)
      .sub(c)
      .div(min(d, float(-1e-4))),
  );
}

/**
 * What shows where nothing is drawn under water: below the horizon, past the terrain mesh's edge (the map ends at about 1 km
 * with a flat sea floor), only the sky would show. Such a ray never meets the surface or the ground, so it is water all the way
 * and `color` is the water's fog colour. It is the ceiling's colour at the horizontal and, linearly in the angle, the colour
 * the far terrain gets at the map edge's floor depth at the angle where the terrain's edge is: the sea floor seems to run on
 * to the horizon with no seam at either end. `weight` is 1 on pixels with nothing drawn (depth at the far plane, or next to
 * such a pixel: silhouette pixels are blended with the sky) whose ray does not rise, scaled by how far the camera is under.
 * Replaces the pixel: transparents without depth (orb halo, motes) over those pixels are lost.
 */
export function underwaterVoidFillTsl(
  uv: TslNode,
  sceneDepth: TslNode,
): { weight: TslNode; color: TslNode } {
  const dir: TslNode = normalize(underwaterViewRayTsl(uv));
  const flat = dir.xz;
  const surfaceY = underwaterSurfaceYTsl();
  const camDepth = max(surfaceY.sub(U.uCamPos.y), float(0));
  const floorDepth = max(surfaceY.sub(U.uEdgeFloorY), camDepth);
  // Angle (as a tangent) below the horizontal, against the angle at which the terrain's edge floor is seen along this ray.
  const toEdge = max(
    min(mapEdgeDistanceTsl(U.uCamPos.x, flat.x), mapEdgeDistanceTsl(U.uCamPos.z, flat.y)),
    float(1),
  );
  const tanDown = max(dir.y.negate(), float(0)).div(max(length(flat), float(1e-4)));
  const tanEdge = max(floorDepth.sub(camDepth).div(toEdge), float(1e-4));
  const ramp = tanDown.div(tanEdge).clamp(0, 1);
  const endDepth = mix(camDepth, floorDepth, ramp);
  // The ceiling is drawn at 0.9 of the fog colour, the terrain at 1.
  const shade = mix(float(0.9), float(1), ramp);
  const color = underwaterColorAtDepthTsl(camDepth.add(endDepth).mul(0.5)).mul(shade);
  const px = vec2(0, 1.5).div(screenSize);
  const farthest = max(
    sceneDepth.sample(uv).r,
    max(sceneDepth.sample(uv.add(px)).r, sceneDepth.sample(uv.sub(px)).r),
  );
  const nothingDrawn = select(farthest.greaterThan(0.999999), float(1), float(0));
  const weight = nothingDrawn
    .mul(float(1).sub(smoothstep(float(0), float(0.004), dir.y)))
    .mul(U.uSubmerge)
    .mul(U.uEnabled);
  return { weight, color };
}

/** `rgb` with the void filled in while the camera is under water (a uniform branch: free above it). Call inside an `Fn`. */
export function underwaterFillVoidTsl(rgb: TslNode, uv: TslNode, sceneDepth: TslNode): TslNode {
  const out = rgb.toVar();
  If(U.uSubmerge.greaterThan(0.001), () => {
    const fill = underwaterVoidFillTsl(uv, sceneDepth);
    out.assign(mix(out, fill.color, fill.weight));
  });
  return out;
}

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
